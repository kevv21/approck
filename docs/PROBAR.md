# Cómo probar la app y la impresora

Guía para verificar todo desde tu teléfono. Empezá por la parte 1: la
impresora no necesita base de datos ni configuración.

---

## Lo primero que hay que entender

**Web Bluetooth solo funciona sobre HTTPS.** Si abrís la app por
`http://192.168.1.x:3000`, el botón de conectar no va a hacer nada, y el
navegador no siempre explica por qué. Por eso hay dos caminos y los dos
terminan en `https://`.

**Y en iPhone no funciona nunca.** Safari no implementa Web Bluetooth. En un
iPhone podés recorrer la app, armar órdenes y ver el recibo en pantalla, pero
para imprimir necesitás el Android o el puente de la PC.

---

## Camino A — Desplegar (recomendado, 5 minutos)

Es el único que da un certificado real, sin advertencias, y te deja abrir la
app desde cualquier teléfono.

```bash
npx vercel
```

Seguí las preguntas (aceptá los valores por defecto). Al terminar te da una
dirección tipo `https://approck-xxxx.vercel.app`.

Abrí esa dirección en el **Chrome del Android** y andá a **Probar**.

> No hace falta configurar Supabase todavía. Sin base de datos la app arranca
> en **modo demo**: tenés los 48 productos de la carta, podés armar órdenes y
> ver el recibo. No guarda nada, pero alcanza para probar la impresora y
> recorrer la interfaz.

## Camino B — Desde tu PC, sin desplegar

```bash
npm run dev:https
```

Te va a mostrar dos direcciones. Usá la de **Network**, la que empieza con la
IP de tu PC:

```
- Network:  https://192.168.1.50:3000
```

El teléfono tiene que estar en el **mismo wifi**. Al abrirla, Chrome va a
avisar que el certificado no es de confianza: tocá *Configuración avanzada* →
*Continuar*.

> Este camino a veces falla justo para Bluetooth, porque algunos Chrome
> bloquean las APIs de hardware en páginas con certificado no confiable. Si el
> botón de conectar no responde, usá el camino A.

---

## Parte 1 — La impresora

Abrí **Probar** en el menú de arriba. La pantalla te lleva por tres pasos.

### Paso 0: el diagnóstico de arriba

Antes de tocar nada, mirá los tres checks:

| Check | Si sale ✕ |
|---|---|
| Conexión segura | Estás en `http://`. Volvé a leer los caminos A y B |
| Soporta Bluetooth | Es un iPhone, o no es Chrome/Edge |
| Modo imagen | Raro; el navegador no deja usar canvas |

### Paso 1: conectar

1. Encendé la PT-210 (botón redondo, la luz queda fija).
2. En los ajustes de Bluetooth del teléfono, **emparejala**. PIN `0000` o `1234`.
3. Volvé a la app y tocá **Bluetooth**.
4. Elegila de la lista. Puede aparecer como `PT-210`, `MTP-II` o `Printer001`
   según el lote.

Si no aparece: apagala y prendela, y revisá que no esté conectada a otro
teléfono. Estas impresoras aceptan una sola conexión a la vez.

### Paso 2: los acentos

Tocá **Imprimir hoja de acentos**. Sale una sola hoja con tres bloques que
dicen lo mismo:

```
>>> OPCION 0
CP437 - estandar, funciona en casi todas
--------------------------------
Toña  Jamón  Piña
Española  Champiñón
¿Cuántos? ¡Sí! Año Niño
```

Mirá el papel y buscá el bloque donde **Toña** y **Jamón** se leen bien.
Tocá esa opción en la app. Queda guardada en ese teléfono.

**Si ninguno se lee bien**, tenés dos salidas:

- **Quitar acentos** — imprime `Tona`, `Jamon`. Feo pero infalible.
- **Modo imagen** — dibuja el ticket y lo manda como mapa de bits. La
  impresora no interpreta caracteres, solo pinta puntos, así que funciona en
  cualquier modelo. El costo es el peso: ~30 kB en vez de ~1 kB, o sea unos
  40 segundos por Bluetooth. Sirve de respaldo, no para la hora pico.

### Paso 3: el recibo

Tocá **Imprimir recibo de ejemplo**. Revisá dos cosas:

1. **El ancho.** La línea de guiones tiene que llegar justo al borde del
   papel. Si se corta o sobra margen, cambiá entre 58 y 80 mm.
2. **Que cuadre.** Subtotal + IVA + envío + propina = TOTAL.

---

## Parte 2 — La app completa

Para esto sí hace falta la base de datos.

### 1. Supabase (5 minutos)

1. Creá una cuenta gratis en [supabase.com](https://supabase.com) y un proyecto.
2. En **SQL Editor**, pegá y ejecutá **en orden**:

```
supabase/01_schema.sql
supabase/02_rls.sql
supabase/03_seed_menu.sql
supabase/04_spec_fase2.sql
supabase/05_puente.sql
supabase/06_offline.sql
supabase/07_inventario.sql
supabase/08_roles_auditoria.sql
```

3. En **Project Settings → API** copiá la URL y la `anon key`.

### 2. Configurar

```bash
cp .env.example .env.local
```

Pegá los dos valores. Si desplegaste con Vercel, cargalos también en el panel
del proyecto y volvé a desplegar.

### 3. Entrar

PIN inicial: **1234**. Poné tu nombre — ese nombre queda en la bitácora de
cada anulación y descuento, y sale impreso en el recibo.

### 4. Recorrido de prueba

| Paso | Dónde | Qué mirar |
|---|---|---|
| Abrir turno | Cierres | Poné un fondo inicial |
| Tomar una orden | Caja | Elegí tipo, agregá productos |
| Descuento | Caja | 10% a pizzas. Fijate en el aviso naranja si además ponés uno general |
| Propina | Caja | Prendela y mirá cómo cambia el total |
| Ver ticket | Caja | Es exactamente lo que sale en papel |
| Cobrar | Caja | Elegí Efectivo, Banpro o BAC |
| Inventario | Inventario | Contá algunos insumos y bajá el Excel |
| Cierre | Cierres | Bajá el Excel y revisá que PedidosYa esté aparte |
| Bitácora | Cierres | Desplegá y verificá que quedó registrado el descuento |

### 5. Sin internet

Con la app abierta, **apagá los datos y el wifi** del teléfono.

- El indicador de la barra pasa a rojo.
- Podés seguir armando órdenes. **Guardar orden** las deja en el teléfono con
  un número temporal `T-1`, `T-2`.
- **Cobrar** se bloquea con un mensaje: un cobro que existe solo en el
  teléfono no entra en el arqueo.
- Al volver la señal, se suben solas y el indicador vuelve a verde.

---

## Si algo falla

| Síntoma | Causa más probable |
|---|---|
| El botón de conectar no hace nada | Estás en `http://`, no en `https://` |
| No aparece ninguna impresora | No está emparejada, o está conectada a otro teléfono |
| Imprime símbolos raros | Codepage equivocado: repetí el paso 2 |
| El ticket sale cortado a la mitad | Batería baja. Dejala enchufada |
| Se corta a mitad de imprimir | Se alejó demasiado; el BLE tiene poco alcance |
| El texto no llega al borde | Ancho de papel equivocado (58 vs 80 mm) |
| "Modo demo" arriba | Falta configurar Supabase (Parte 2) |
