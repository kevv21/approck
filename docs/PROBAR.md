# Cómo probar la app y la impresora

Guía para Android, de principio a fin. Los pasos 1 a 3 no necesitan base de
datos ni computadora.

---

## Antes de empezar: dos cosas que no se negocian

**Tiene que ser `https://`.** Web Bluetooth no funciona sobre `http://`. Si
abrís la app por `http://192.168.1.x:3000`, el botón de conectar no responde
y el navegador no siempre explica por qué.

**Tiene que ser Android.** En iPhone no hay forma: Safari no implementa Web
Bluetooth y Apple no piensa agregarlo. Un iPhone puede tomar órdenes y ver el
recibo en pantalla, pero imprime el Android o el puente de la PC.

---

## Paso 1 — Conseguir una dirección `https://`

Sin terminal, todo desde el navegador (sirve incluso desde el mismo Android):

1. Entrá a **[vercel.com](https://vercel.com)** y creá la cuenta
   con **Continue with GitHub**.
2. **Add New → Project** e importá el repositorio `approck`.
3. Deploy. Tarda un par de minutos.
4. Vercel también despliega la rama de trabajo
   `claude/determined-franklin-kz5981` como *preview*. En **Deployments**
   busca la de esa rama y copia su dirección: es la que tiene lo último.

Te queda algo tipo `https://approck-git-claude-xxxx.vercel.app`.

> **No configures Supabase todavía.** Sin base de datos la app arranca en
> **modo demo** con los 48 productos de la carta. Alcanza para probar la
> impresora y recorrer la interfaz.

**Alternativa con computadora:** `npx vercel` desde la carpeta del proyecto
hace lo mismo.

---

## Paso 2 — Preparar el Android

Tres cosas que si faltan hacen que el botón de conectar no responda, sin
mensaje de error.

### a) Usá Chrome

Chrome o Edge. **Samsung Internet, Firefox y Opera no sirven**: no
implementan Web Bluetooth.

### b) Dale permiso de dispositivos cercanos

- **Android 12 o más nuevo:** Ajustes → Aplicaciones → Chrome → Permisos →
  **Dispositivos cercanos** → Permitir.
- **Android 11 o más viejo:** además de lo anterior, la **ubicación tiene que
  estar encendida** (el interruptor del panel de accesos rápidos). No es que
  la app quiera tu ubicación: Android exige ese permiso para poder escanear
  BLE, y sin él no aparece ninguna impresora.

### c) NO la emparejes en los ajustes de Bluetooth

Esto es lo que más confunde. La PT-210 habla por dos canales distintos:

| Canal | Quién lo usa | Hace falta emparejar |
|---|---|---|
| **BLE** | La app en el teléfono | **No.** Chrome muestra su propio buscador |
| **Clásico (SPP)** | El puente de la PC | Sí, crea el puerto COM |

Desde el teléfono se usa BLE, así que **no la emparejes en los ajustes**. Si
ya lo hiciste y no conecta, ve a Ajustes → Bluetooth, toca la impresora y
**Desvincular**. Después probá de nuevo desde la app.

---

## Paso 3 — Conectar e imprimir

1. Encendé la PT-210. La luz tiene que quedar **fija**, no parpadeando.
   Si parpadea, está buscando conexión: está bien.
2. Abrí la dirección de Vercel en Chrome.
3. Tocá **Probar** en el menú de arriba.
4. Mira los tres checks del diagnóstico antes de seguir:

| Check | Si sale ✕ |
|---|---|
| Conexión segura | Estás en `http://`. Usá la dirección de Vercel |
| Soporta Bluetooth | No es Chrome, o es un iPhone |
| Modo imagen | Raro; el navegador no deja usar canvas |

5. Tocá **Bluetooth**. Se abre el buscador de Chrome.
6. Elige la impresora. Puede aparecer como `PT-210`, `MTP-II`, `Printer001`
   o incluso sin nombre, según el lote.

### Si la lista sale vacía

En orden, y probando después de cada uno:

1. Apaga y prende la impresora.
2. Revisá que no esté conectada a otro teléfono. **Estas impresoras aceptan
   una sola conexión a la vez**, y si quedó tomada por otro aparato no
   aparece.
3. Confirmá el permiso de Dispositivos cercanos (paso 2b).
4. Si es Android 11 o más viejo, encendé la ubicación.
5. Si la emparejaste antes en los ajustes, desvinculala (paso 2c).

### Resolver los acentos

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

Mira el papel, busca el bloque donde **Toña** y **Jamón** se leen bien, y
toca esa opción en la app. Queda guardada en ese teléfono.

**Si ninguno se lee bien:**

- **Quitar acentos** — imprime `Tona`, `Jamon`. Feo pero infalible.
- **Modo imagen** — dibuja el ticket y lo manda como mapa de bits. La
  impresora no interpreta caracteres, solo pinta puntos, así que funciona en
  cualquier modelo. Pesa ~30 kB en vez de ~1 kB, o sea unos 40 segundos por
  Bluetooth. Sirve de respaldo, no para la hora pico.

### El recibo

Tocá **Imprimir recibo de ejemplo** y revisá dos cosas:

1. **El ancho.** La línea de guiones tiene que llegar justo al borde. Si se
   corta o sobra margen, cambiá entre 58 y 80 mm.
2. **Que cuadre.** Subtotal + IVA + envío + propina = TOTAL.

### Instalar la app en la pantalla de inicio

Una vez que funcione: menú ⋮ de Chrome → **Agregar a pantalla de inicio**.
Queda como una app normal, sin barra del navegador.

---

## Paso 4 — La app completa

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

Pega los dos valores. Si desplegaste con Vercel, cárgalos también en el panel
del proyecto y volvé a desplegar.

### 3. Entrar

PIN inicial: **1234**. Poné tu nombre — ese nombre queda en la bitácora de
cada anulación y descuento, y sale impreso en el recibo.

### 4. Recorrido de prueba

| Paso | Dónde | Qué mirar |
|---|---|---|
| Abrir turno | Cierres | Poné un fondo inicial |
| Tomar una orden | Caja | Elige tipo, agrega productos |
| Descuento | Caja | 10% a pizzas. Fíjate en el aviso naranja si además pones uno general |
| Propina | Caja | Prendela y mirá cómo cambia el total |
| Ver ticket | Caja | Es exactamente lo que sale en papel |
| Cobrar | Caja | Elige Efectivo, Banpro o BAC |
| Inventario | Inventario | Contá algunos insumos y bajá el Excel |
| Cierre | Cierres | Bajá el Excel y revisá que PedidosYa esté aparte |
| Bitácora | Cierres | Desplegá y verificá que quedó registrado el descuento |

### 5. Sin internet

Con la app abierta, **apagá los datos y el wifi** del teléfono.

- El indicador de la barra pasa a rojo.
- Puedes seguir armando órdenes. **Guardar orden** las deja en el teléfono con
  un número temporal `T-1`, `T-2`.
- **Cobrar** se bloquea con un mensaje: un cobro que existe solo en el
  teléfono no entra en el arqueo.
- Al volver la señal, se suben solas y el indicador vuelve a verde.

---

## Si algo falla

| Síntoma | Causa más probable |
|---|---|
| El botón de conectar no hace nada | Estás en `http://`, no en `https://` |
| El buscador de Chrome no abre | No es Chrome (Samsung Internet no sirve) |
| No aparece ninguna impresora | Falta el permiso de Dispositivos cercanos, o está conectada a otro teléfono, o la emparejaste en los ajustes |
| Imprime símbolos raros | Codepage equivocado: repetí el paso 2 |
| El ticket sale cortado a la mitad | Batería baja. Dejala enchufada |
| Se corta a mitad de imprimir | Se alejó demasiado; el BLE tiene poco alcance |
| El texto no llega al borde | Ancho de papel equivocado (58 vs 80 mm) |
| "Modo demo" arriba | Falta configurar Supabase (Parte 2) |
