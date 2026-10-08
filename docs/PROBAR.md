# Cómo probar la app y la impresora

La impresión va **por internet**: cualquier teléfono, tablet o PC deja el
ticket en la cola al cobrar, y lo imprime la **PC de caja**, que tiene la
impresora conectada y el servicio del puente corriendo. Ningún teléfono le
habla directo a la impresora, y no hay que dejar ninguna pantalla abierta.

---

## Paso 1 — La PC de caja

Es lo único que toca la impresora. Las instrucciones completas están en
**[bridge/README.md](../bridge/README.md)**. En corto:

1. Instalar **Node 22** o más nuevo (con 18 o 20 el puente no arranca).
2. Emparejar la PT-210 en Windows y anotar el puerto COM **saliente**.
3. En `bridge/`: `npm install`, copiar `.env.example` a `.env` y llenarlo con
   la URL y la clave publishable de Supabase y el puerto COM.
4. `npm start`. Tiene que decir «Tiempo real activo: los tickets salen al
   instante». Si dice que el tiempo real está caído, igual imprime: consulta
   la cola cada 3 segundos.

Para probar sin la impresora en la mano: `SIMULAR=true npm start` guarda los
tickets como archivos en `bridge/salida/`.

---

## Paso 2 — La pantalla Impresora

En cualquier aparato, abre la app → **Más → Impresora**.

**PC de caja.** Tiene que decir **«Lista para imprimir»**. Si dice «No
responde», revisa que la PC esté encendida, con internet y con el puente
corriendo.

**Acentos.** Toca **Imprimir hoja de acentos**. Sale el mismo texto con los
tres juegos de caracteres; mira el papel, busca el bloque donde **Toña** y
**Jamón** se leen bien y toca esa opción. Si ninguno sirve, prende **Quitar
acentos** (imprime `Tona`, `Jamon`: feo, pero no falla).

**El recibo.** Toca **Imprimir un recibo de ejemplo** y revisa dos cosas:

1. **El ancho.** La línea de guiones tiene que llegar justo al borde. Si se
   corta o sobra margen, cambia entre 58 y 80 mm.
2. **Que cuadre.** Subtotal + IVA + envío = TOTAL.

El ancho, el juego de caracteres y «quitar acentos» se guardan en ese
aparato y se usan en todo lo que imprime: cobros, reimpresiones y
pre-cuentas.

---

## Paso 3 — Un cobro de verdad

En la Caja, agrega una pizza y cóbrala. El ticket tiene que salir en la PC
en uno o dos segundos.

- **Si la orden se guardó pero el ticket no llegó a la cola** (por ejemplo,
  se cortó internet justo ahí), la caja dice **«Orden #N cobrada, sin
  ticket»** con un botón **Reimprimir**. No hay que volver a cobrar.
- **Sin internet o con la PC apagada**, la caja puede imprimir el recibo desde
  el navegador: **Más opciones → Imprimir aquí**, o **Descargar recibo**.

---

## Sin PC de caja — Bluetooth desde el teléfono (cuenta maestra)

Solo en **Chrome en Android** (el iPhone no tiene Bluetooth para páginas web).

1. Entra con el PIN de la **maestra**.
2. **Más → Impresora → Sin PC: Bluetooth en este teléfono → Buscar impresora
   Bluetooth**. Elige la impresora de la lista.
3. **Imprimir prueba por Bluetooth**.

Mientras siga conectada, todo lo que imprimas desde ese teléfono (cobros,
reimpresiones, pre-cuentas) sale por ahí y no por la PC. Al cerrar la app se
desconecta: hay que volver a conectarla.

**Si la impresora no aparece en la lista**, lo más probable es que solo hable
Bluetooth clásico (la que pide PIN 0000 al emparejarla). Web Bluetooth solo
habla Bluetooth de baja energía (BLE), así que esa impresora no se puede usar
desde la página: no es un ajuste, el canal no existe. Hay que probarlo en el
teléfono real; avísame qué pasa.

---

## Instalar la app en la pantalla de inicio

En Chrome (Android) o Safari (iPhone), abre la dirección `https://` de la app y
usa **Agregar a la pantalla de inicio**. Abre a pantalla completa y funciona
sin internet para tomar órdenes; cobrar e imprimir sí necesitan conexión.
