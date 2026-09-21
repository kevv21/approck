# APPROCK — POS para Rock Munchies

Punto de venta para teléfono y PC: tickets en la GOOJPRT PT-210, descuentos
por categoría, propina configurable y cierres de caja descargables en Excel.

---

## El problema que define la arquitectura

La PT-210 solo tiene Bluetooth. Y **Safari en iPhone/iPad no implementa Web
Bluetooth**; Apple ha dicho que no lo va a implementar. Como en el local hay
iPhones, ningún iPhone puede imprimir desde el navegador, y no hay código que
lo arregle.

Por eso el sistema separa **tomar la orden** de **imprimir**:

```
PC (caja)       ─┐
iPhone (mesero) ─┼──► tabla print_job ──► Android de caja ──BLE──► PT-210
Tablet          ─┘      (Postgres)         (/estacion)
```

Cualquier dispositivo crea el trabajo de impresión. Un solo Android, abierto
en `/estacion`, lo consume y lo manda a la impresora. Esto además da
reimpresión gratis y evita el emparejamiento Bluetooth en la PC, que en
Windows es inconsistente.

---

## Cómo se calcula el cobro

**Los precios del menú NO incluyen IVA.** El 15% se suma al cobrar.

| Paso | Qué pasa |
|---|---|
| 1 | `bruto de línea = precio unitario × cantidad` |
| 2 | **Descuento de categoría** (pizzas / bebidas) sobre las líneas de ese grupo |
| 3 | **Descuento general** sobre el *remanente* de todas las líneas |
| 4 | `base productos = Σ(bruto − descuentos)`, nunca negativa |
| 5 | Envío: no admite descuento, no genera propina, sí paga IVA |
| 6 | `IVA 15% = (base productos + envío) × 0.15` |
| 7 | `propina = base productos × 10%` (configurable, apagada por defecto) |
| 8 | `total = base + envío + IVA + propina` |

**Consecuencia:** 10% a pizzas + 10% general **no es 20%**. El general cae
sobre lo ya descontado, así que el efectivo es 19%. La UI avisa cuando se
apilan descuentos.

### Dos cosas que hay que confirmar con el contador

1. **Base de la propina.** Aquí el 10% se calcula sobre el subtotal *antes*
   de IVA, que es la práctica más común, pero no encontré fuente normativa
   que lo fije. Si en tu caso va sobre subtotal+IVA, cambia `propinaSobre` a
   `"base_con_iva"` en `src/lib/types.ts` (`CONFIG_DEFAULT`).
2. **Los precios de la carta.** El sistema toma C$260 (Jamón) como base
   e imprime C$260 + IVA = C$299. Si hoy el cliente paga C$260 en total, los
   precios del seed hay que bajarlos a la base correspondiente, o el cliente
   va a pagar más.

---

## Probar primero

Antes de configurar nada: **[docs/PROBAR.md](docs/PROBAR.md)** explica cómo
verificar la impresora desde el teléfono en cinco minutos, sin base de datos.
La pantalla `/prueba` resuelve los acentos imprimiendo los tres juegos de
caracteres en una sola hoja: miras el papel y eliges el que se lee bien.

Sin Supabase configurado la app **no** simula nada: la pantalla de caja dice
qué falta y lleva a **Estado**. Antes cargaba un menú de mentira y se veía
normal, así que se podían armar pedidos completos que no se guardaban en
ningún lado. En una caja eso no es una demostración.

## Puesta en marcha

### 1. Base de datos (5 minutos)

Crea un proyecto gratis en [supabase.com](https://supabase.com). En
**SQL Editor → New query**, pega **un solo archivo**:

```
supabase/00_INSTALAR.sql
```

Eso es todo: tablas, tipos, políticas, los 57 productos de la carta y los 59
insumos del inventario. Se puede volver a correr sin duplicar nada.

> Los archivos `01_` a `08_` quedan como historial de los cambios. **No los
> ejecutes uno por uno**: están incompletos por separado y el orden importa.

**Si ya tenías la base instalada** y solo quieres ponerla al día, no repitas
el instalador: pega **`supabase/PUESTA_A_PUNTO.sql`**. Son 5 KB en vez de 34,
trae las cuatro columnas que faltan y termina con un diagnóstico que te dice
en el panel de resultados cuántas órdenes han entrado, cómo va la cola de
impresión y si el puente está conectado.

> Pegar 34 KB en el editor del navegador se corta a veces. Cuando pasa,
> Postgres responde `syntax error at or near "'Carne molida'"` con un
> `LINE 1:` delante. Ese `LINE 1` es la pista: lo que se ejecutó **empezaba**
> ahí, o sea que le faltaba el encabezado `insert into ... values`. No es un
> error del archivo, llegó incompleto. Comprueba que la última línea del
> editor sea la última del archivo, y que no tengas texto seleccionado: el
> editor de Supabase ejecuta solo la selección cuando hay una.

### 2. Variables de entorno

```bash
cp .env.example .env.local
```

Pon `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` desde
**Project Settings → API**.

> Una variable creada pero **en blanco** es peor que no crearla: `""` no es
> `undefined`, así que no cae al respaldo y llega vacía hasta el cliente.

### 2b. Comprobar que quedó bien

Abre **`/configuracion`** (pestaña *Estado*). Revisa una por una las variables
de entorno, la conexión, las tablas, las columnas, el menú y si hay caja
abierta, y dice qué hacer con lo que falle. No pide PIN, justamente porque el
PIN vive en la base que esa pantalla sirve para diagnosticar.

### 3. Correr

```bash
npm install
npm run dev          # http://localhost:3000
```

Para probar desde un Android en la red del local, Web Bluetooth exige HTTPS:

```bash
npx next dev --experimental-https -H 0.0.0.0
```

### 4. Desplegar

```bash
npx vercel
```

Carga las dos variables de entorno en el panel de Vercel. El plan gratuito
alcanza de sobra para el volumen de una pizzería, y no caduca.

### 5. Instalar el puente de impresión

El puente corre en la **PC de caja** y es lo que permite que un iPhone
imprima. Instrucciones completas en [`bridge/README.md`](bridge/README.md):

```bash
cd bridge
npm install
cp .env.example .env     # mismos valores de Supabase + el puerto COM
npm run puertos          # ver los puertos serie disponibles
npm run prueba           # imprimir un ticket de prueba
npm start                # dejarlo corriendo
```

Para probar sin la impresora en la mano: `SIMULAR=true npm start` guarda los
tickets como archivos en `bridge/salida/`.

En los demás dispositivos (incluidos iPhones) abre `/` e instala la PWA.
`/estacion` muestra el estado del puente y la cola.

---

## Pantallas

| Ruta | Para qué |
|---|---|
| `/` | Caja: menú, pedido, descuentos, propina, cobro |
| `/estacion` | Android de caja: conexión Bluetooth y cola de impresión |
| `/inventario` | Conteo de insumos y descarga del Excel con la plantilla |
| `/cierre` | Turnos, arqueo y descarga del Excel |

---

## El Excel del inventario

Reproduce `Plantilla_Inventario.xlsx` exactamente: hoja `Inventario`, mismos
anchos de columna (30/15/20), encabezado Arial 12 blanco sobre `#2A3F54` y
bordes finos `#DDDDDD`. Los 59 insumos van en el mismo orden.

La fecha y quién contó van en el **encabezado de impresión**, no en una fila:
así la hoja sale fechada al imprimirla sin que la estructura deje de coincidir
con la plantilla que ya usa la cocina. Una hoja opcional `Datos` guarda las
notas y la lista de insumos sin unidad definida.

Una celda de cantidad vacía significa "nadie lo contó", que es muy distinto de
un cero, que significa "no hay existencias". El exportador nunca convierte lo
uno en lo otro.

## El Excel del cierre

Una sola hoja, al estilo de la casa: encabezado con el nombre, día y hora, y
debajo cuatro bloques.

1. **Consumibles** — qué se vendió, agrupado por producto
2. **Forma de pago** — Efectivo, Banpro, BAC
3. **PedidosYa, aparte** — esa plata no entra a la caja el mismo día: la
   plataforma deposita después y con comisión. Sumarla al efectivo hace que
   el arqueo nunca cuadre
4. **Arqueo** — fondo inicial, esperado, contado y diferencia

Los totales son **fórmulas de Excel**, no valores fijos: quien revise la hoja
puede tocar una celda y ver el total recalcularse.

### El detalle viejo del cierre

Cuatro hojas:

1. **Resumen** — ventas, descuentos desglosados por tipo, base gravable, IVA,
   propinas, ventas por tipo de orden y por método de pago, y arqueo de caja
   (fondo inicial, efectivo esperado vs. contado, diferencia).
2. **Órdenes** — una fila por orden, con todos los descuentos separados.
3. **Items** — una fila por línea de producto. Esta es la hoja que responde
   "¿qué se vende?".
4. **Productos** — agregado por producto, ordenado por venta neta.

---

## Detalles técnicos que cuestan horas si no se saben

**Dinero en centavos.** Todo el sistema usa enteros (`C$260.00` → `26000`).
Con float, `0.1 + 0.2 !== 0.3` y eso aparece en el arqueo como una diferencia
de centavos que nadie puede explicar. Los descuentos de monto fijo se
reparten por el método del mayor resto, así que la suma de las líneas siempre
cuadra exactamente con el total.

**Snapshot de precios.** `orden_item` guarda `nombre_snapshot` y
`precio_snapshot`. Si mañana subes la Diabla de C$300 a C$320 y los reportes
leyeran el precio por FK, **todos los cierres históricos cambiarían solos**.

**La PT-210 en concreto:**

- 58mm de papel, 48mm imprimibles, 384 puntos → **32 caracteres por línea**
  (16 en doble ancho). El maquetado hace wrap por palabra; hay tests que
  fallan si alguna línea se pasa del ancho.
- **No tiene cortador automático.** No se envía `GS V`; se avanzan 4 líneas
  y se corta a mano.
- Los acentos tienen cuatro niveles de respaldo, de más a menos bonito:
  **CP437** por defecto, que es la línea base del estándar ESC/POS y la trae
  toda impresora; **CP850**, que agrega mayúsculas con tilde; **CP1252** para
  Windows; y si ninguno sirve, **quitar acentos** o el **modo imagen**, que
  manda el ticket como mapa de bits (`GS v 0`) y funciona en cualquier
  modelo porque la impresora no interpreta caracteres, solo pinta puntos.
- `ESC t n` le dice a la impresora cómo interpretar los bytes, pero no
  convierte nada: hay que mandarle los bytes de ESE codepage. La ñ es 0xA4
  en CP437 y CP850, pero 0xF1 en CP1252.
- BLE deja ~20 bytes útiles por paquete. El ticket se manda en trozos de 20
  bytes con 25ms de pausa; de un golpe sale cortado a la mitad.
- Servicio BLE `49535343-fe7d-4ae5-8fa9-9fafd205e455` (UART transparente de
  ISSC/Microchip), característica de escritura `...-8841-43f4-...`. Hay tres
  UUIDs alternos para clones de otros lotes.

**La estación pide un wake lock** para que el Android no se duerma y pare la
cola. El polling cada 4s es lo que realmente sostiene el sistema: el realtime
de Supabase se cae con el wifi del local y no siempre reconecta.

---

## Alcance y límites conocidos

- **Seguridad.** Hay un PIN de acceso y un nombre por persona, pero las
  políticas RLS abren las tablas a la clave anon: cualquiera con la URL puede
  saltarse la pantalla llamando a la API directo. **Es control de acceso, no
  seguridad.** Sirve para que nadie entre por accidente desde un teléfono
  ajeno, no para resistir a un atacante. Lo que sí da garantías es la
  bitácora, que registra quién hizo cada anulación y cada descuento.
  PIN inicial: **1234**. Cámbialo antes de operar.
- **Offline parcial.** Se pueden tomar órdenes sin señal: quedan en
  IndexedDB con un número temporal `T-n` y se suben solas al reconectar, con
  el correlativo real que asigna Postgres. Cobrar y cerrar caja **requieren
  conexión** a propósito: un cobro que existe solo en el teléfono no entra en
  el arqueo. Lo que sigue sin resolverse es que **las comandas de cocina no
  salen sin internet**, porque el puente consulta la cola en la nube.
- **Sin comandas por estado.** Las órdenes se guardan como `pagada` al
  cobrar; no hay flujo de cocina (pendiente → listo → entregado).
- **Un solo turno abierto a la vez**, forzado por índice único en la BD.

---

## Pruebas

```bash
npm test
```

Cubren el motor de precios (apilado de descuentos, guardas contra totales
negativos, reparto de montos fijos sin perder centavos, base de la propina,
envío) y el maquetado del ticket (ninguna línea excede 32 columnas, los
acentos sobreviven al encoder, el ticket de cocina no lleva precios).
