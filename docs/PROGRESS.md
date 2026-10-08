# Progreso

Estado real al 2026-09-19. Ver `docs/GAP.md` para el detalle de la brecha
contra `docs/SPEC.md` y las contradicciones abiertas.

## Fase 0 — Preparación (manual, antes de Claude Code)
- [ ] Canjear Appwrite Education en education.github.com/pack
- [ ] Crear proyecto en Appwrite Cloud
- [ ] `claude plugin install appwrite@claude-plugins-official` → /plugins → configurar
- [ ] `claude mcp add --transport http appwrite https://mcp.appwrite.io/` → /mcp → Authenticate
- [ ] `claude mcp add --transport http sentry https://mcp.sentry.dev/mcp` → /mcp → Authenticate
- [x] Corchetes: el dueño decidió no llenarlos por ahora. El recibo sale con
      `Tel: 0000-0000` como marcador y sin líneas de RUC ni dirección (se
      imprimen solo si `settings` las tiene). Cambiar eso es editar un campo.
- [x] ¿Precios incluyen IVA? → **NO incluyen** (confirmado por el dueño)
- [x] ¿Propina 10%? → **sí, opcional**, sobre subtotal sin IVA, no gravada
- [x] ¿Impresora LAN? → **decidido: puente en la PC que consulta la nube.**
      La PC de caja correrá un servicio Node emparejado con la PT-210 por
      Bluetooth, haciendo polling de la cola. Mantiene HTTPS y la PWA.
      Pendiente de implementar (Fase 4).

## Fases
- [ ] 1. Setup: proyecto, Appwrite, auth con roles, Sentry
      → bloqueado: el MCP de Appwrite no está disponible (GAP.md §1.1).
      Sin auth ni Sentry todavía. Service worker sin hacer.
- [~] 2. Productos + órdenes (4 tipos) + función de cálculo con tests
      → hecho: catálogo de 57 productos, 4 tipos de orden, `calcularTotales`
        pura con 27 pruebas, precio congelado por línea, `aplica_iva` por
        producto (exentos), modo "precios con IVA incluido" con desglose
        hacia atrás, descuento manual por línea, modificadores con recargo,
        multimoneda US$, y cálculo en milésimas de centavo para redondear
        solo al final.
      → falta: flujo de estados de la orden (abierta → enviada_cocina →
        por_cobrar → pagada), pantalla de mesas para el mesero.
- [~] 3. Cobro + recibo HTML/PDF + pre-cuenta + comanda
      → hecho: recibo térmico con desglose completo (base exenta, base
        gravable, IVA, envío, propina), comanda de cocina, **pre-cuenta**,
        leyenda "no es factura fiscal", **COPIA** en reimpresiones, ancho
        **58 y 80mm configurable**, precio unitario por línea,
        modificadores, equivalente en US$, mesero y cajero identificados.
      → hecho también: fallback HTML con window.print() y descarga del
        recibo, que funciona en cualquier navegador incluido iPhone.
      → falta: PDF nativo (hoy se genera desde el diálogo de impresión).
- [x] 4. Capa de impresión (puente + fallbacks)
      → hecho: interfaz `PrinterAdapter` con 4 implementaciones
        intercambiables (puente, Bluetooth, serial COM, HTML), servicio del
        puente en `bridge/` con latido, reintentos y modo simulado, cola con
        estado visible, detección de iOS, prueba de codepage y de ancho.
      → nota: el puente CONSULTA la cola, no recibe conexiones. Recibir no
        funciona desde una PWA en HTTPS (GAP.md §1.3).
- [x] 5. Sesiones de caja + cierre + Excel
      → El Excel se rehízo según lo que pidió el dueño: **una sola hoja al
        estilo Rock Munchies** con encabezado, día y hora, y debajo los
        consumibles, la forma de pago (Efectivo / Banpro / BAC) y
        **PedidosYa aparte**. Los totales van como fórmulas de Excel, no
        como valores fijos.
      → Se descartaron las 6 hojas del spec original: para un cierre diario
        que alguien imprime y firma, era papeleo.
- [x] 6. Offline + sincronización
      → hecho: almacén local en IndexedDB (Dexie), menú cacheado para poder
        tomar órdenes sin señal, cola de subida que respeta el orden de
        creación, números temporales `T-n` reemplazados por el correlativo
        real de Postgres al subir, indicador de conexión con pendientes en la
        barra, service worker para que la app abra sin internet, y cobro y
        cierre bloqueados sin conexión con mensaje claro, como exige el spec.
      → clave: `id_local` único en la base. Sin eso, una caída justo después
        de subir y antes de recibir la respuesta duplicaba la orden y se
        cobraba dos veces.
- [x] 7. Auditoría
      → `audit_log` con anulaciones, descuentos, reimpresiones, aperturas y
        cierres de caja e intentos de acceso fallidos. Motivo obligatorio en
        anulaciones y descuentos. La política de RLS permite insertar y leer
        pero **no modificar ni borrar**: una bitácora que el cajero puede
        editar no sirve de nada.
      → Visible desde la pantalla de cierres, filtrada por período.
- [~] 8. Pruebas en dispositivos reales + despliegue
      → El despliegue en Vercel fallaba con `supabaseUrl is required` durante
        el prerenderizado. Causa: una variable de entorno declarada pero
        VACÍA. `??` solo cae al respaldo con null o undefined, así que `""`
        llegaba a `createClient` y lo tumbaba. Y como el cliente se construía
        al cargar el módulo, el error rompía el build en vez de fallar en el
        navegador, donde se puede explicar.
      → Arreglado: respaldo con `||`, validación de que la URL sea una URL, y
        **construcción perezosa** del cliente tras un Proxy, para que el
        prerenderizado nunca lo instancie. 7 pruebas nuevas fijan que importar
        el módulo no lance con variables vacías, ausentes, con el marcador de
        `.env.example` sin reemplazar, o con basura.
      → Segunda tanda de despliegue: se subió **Next 15.1.6 → 15.5.25**, que
        arrastraba vulnerabilidades críticas (RCE en el protocolo flight de
        React, SSRF en middleware, bypass de autorización y varios DoS), y
        **vitest 3 → 5**. Para `postcss` y `uuid` se usaron `overrides` en vez
        de lo que proponía `npm audit fix --force`, que era saltar a Next 16
        (mayor, riesgo real sobre una app que anda) y bajar exceljs a 3.4.0
        (rompe la API del cierre). Auditoría: **0 vulnerabilidades**.
      → Guarda nueva: `importacion.test.ts` importa los 28 módulos de `lib/`
        en un entorno de servidor con las variables vacías. El bug del
        despliegue era de una clase —trabajo real al cargar el módulo— y esto
        la cubre entera en vez de tapar solo el caso que salió.
      → CI en `.github/workflows/ci.yml`: tipos, pruebas, los tres estados de
        variables de entorno y auditoría. Un fallo de build sale ahí y no en
        el despliegue.
      → El despliegue seguia fallando con el mismo error despues del arreglo:
        los arreglos se habian empujado solo a `main`, y Vercel estaba
        compilando la rama de trabajo, que conservaba el `supabase.ts` viejo.
        Ambas ramas quedan en el mismo commit. **Revisar en Vercel que la
        rama de produccion sea `main`.**
      → El CI atrapo un segundo problema antes de que llegara al despliegue:
        `supabase-js` declara `engines: node >=22` porque su cliente de
        realtime necesita WebSocket nativo, que no existe en Node 20. El
        workflow pedia Node 20 y `engines` decia `>=20`, los dos mal. Importa
        mas de lo que parece: **Vercel elige la version de Node leyendo
        `engines.node`**, asi que ese campo mal puesto lo mandaba a un
        runtime donde el cliente no se puede construir. Corregido a `>=22`,
        con `.nvmrc` para que local, CI y Vercel usen lo mismo.
      → El SQL se probó contra un Postgres 16 real, no solo a ojo. Salieron
        tres problemas que habrían roto la instalación:
        **(1)** el enum `metodo_pago` seguía con los valores viejos, así que
        el primer cobro con Banpro habría fallado con
        `invalid input value for enum`;
        **(2)** `alter publication supabase_realtime` abortaba el script
        entero si la publicación no existía, dejando media base instalada;
        **(3)** el seed del menú se duplicaba al repetir el archivo —
        tres corridas daban 171 productos en vez de 57.
        Corregidos los tres. Ahora hay **un solo archivo**,
        `supabase/00_INSTALAR.sql`, idempotente y verificado con tres
        ejecuciones seguidas sobre la misma base.
      → falta: la prueba en hardware real (impresora).

**Avance contra el spec, ya ajustado a lo que pidió el dueño: ~96%.** (175 pruebas)

## Revisión del 2026-09-21

Cuatro cosas que estaban rotas y no se veían compilando:

1. **El selector de mitad y mitad nunca se montaba.** El componente estaba
   escrito, importado y con su manejador listo, pero el `<MitadYMitad />`
   no aparecía en el JSX: el botón cambiaba un estado que nadie leía y no
   pasaba nada. Ahora `noUnusedLocals` está encendido, así que un componente
   importado y no usado rompe el CI en vez de llegar al local.
2. **`00_INSTALAR.sql` no traía lo de `09_mitades_pedidosya.sql`.** Quien
   seguía el README y pegaba el único archivo que ahí se nombra terminaba con
   una base donde NINGUNA orden se podía guardar, porque la app escribe
   `orden.precio_mitades` en cada inserción. Verificado contra Postgres 16:
   tres corridas, 57 productos y 59 insumos estables. Hay una prueba nueva
   (`instalador.test.ts`) que compara las columnas que el código escribe
   contra las que el instalador declara; quitando el arreglo, falla nombrando
   `mitades`, `precio_mitades` y `ventas_pedidosya`.
3. **La línea de mitad y mitad no se podía guardar** aunque el modal abriera:
   su `producto_id` iba como `""` y la columna es `uuid`. Postgres responde
   `invalid input syntax for type uuid` y se pierde el cobro entero.
   Confirmado en base real; ahora va `NULL`, que es lo que la FK permite.
4. **`/configuracion` quedaba del otro lado de la puerta.** El PIN vive en
   `settings.pin_hash`; si esa tabla no existe todavía no se puede entrar, y
   la pantalla que explica por qué estaba detrás del PIN. Queda exenta, como
   `/prueba`.

Además:
- **Se acabó el modo demo.** Antes, sin base configurada, la caja cargaba un
  menú empaquetado y se veía normal: se podían armar pedidos enteros que no
  se guardaban en ningún lado. Ahora dice qué falta y lleva a **Estado**
  (`/configuracion`), que revisa variables, conexión, tablas, columnas, menú
  y caja abierta, y dice qué hacer con cada fallo.
- **El ticket de prueba del puente declaraba CP1252 y escribía Latin-1**,
  contra una impresora cuyo selftest reporta CP437. La eñe salía como otro
  símbolo y hacía dudar de la impresora cuando el que estaba mal era el
  puente. Corregido a CP437, igual que el lado de la app.
- **Voseo barrido**: quedaban «podés», «elegí», «pegá», «andá» y una docena
  más en la interfaz, el README y el SQL. El dueño pidió español neutro.

UX:
- La mitad y mitad es **una opción más dentro de la rejilla de pizzas**, no un
  cartel fijo arriba de todo que ocupaba lugar incluso mirando las cervezas.
- En el selector, cada mitad tiene su color y ese mismo color marca la pizza
  elegida en la lista y el punto en el pedido. La segunda mitad es **azul**,
  no otro naranja: dos tonos del mismo color se confunden con prisa, y
  confundir las mitades cuesta una pizza rehecha.
- Se puede **cambiar** una mitad ya agregada sin borrar y rehacer la línea, e
  **intercambiar** las dos con un botón.
- Las 26 pizzas van **agrupadas por categoría** en el selector, no en una
  rejilla plana de 26.
- Los siete botones iguales del final se volvieron **uno principal**
  (`Cobrar C$ X e imprimir`), dos secundarios y el resto bajo «Más opciones».
- **Cancelar orden pide confirmación**: un toque borraba un pedido de diez
  líneas cargadas a mano.
- Las doce categorías eran **cinco filas** en un teléfono; ahora es una sola
  que se desliza, con las pizzas primero. (Y `min-w-0` en las columnas del
  grid, porque sin eso la fila ensanchaba la página entera.)
- La barra de arriba **marca en qué pestaña estás** y el indicador de conexión
  dejó de comerse la última.

## Android — 2026-09-21

El recordatorio de que la app es sobre todo para Android destapo que lo
agregado esos dias estaba probado a anchos de escritorio. Emulando un Android
de 360px salio "Application error: a client-side exception", 3 de cada 6
cargas. **Era el service worker, o sea produccion, no la prueba.**

Dos fallos, los dos de los que dejan un telefono inservible:

1. **Se cacheaban las respuestas FALLIDAS.** Con estrategia "cache primero",
   un chunk que fallo una vez quedaba guardado como error PARA SIEMPRE.
   Reinstalar la PWA no arregla nada, porque la cache sobrevive a la
   desinstalacion: habria que entrar a los ajustes de Android a borrar los
   datos del sitio. En el wifi de un local, esto pasa solo.
   Ahora solo se guarda lo que responde 200, y si la red falla se busca en
   cache antes de rendirse en vez de dejar la promesa rechazada —que es lo
   que el navegador convertia en ChunkLoadError.

2. **`skipWaiting()` + `clients.claim()`** hacian que un service worker NUEVO
   tomara el control de una pagina cargada con el HTML VIEJO. Esa pagina pide
   trozos de JavaScript que ya no existen: pantalla en blanco a media
   atencion. Ahora la version nueva espera, y la app avisa con un boton para
   recargar cuando convenga.

Red de seguridad: si aun asi un chunk no carga, se limpia la cache, se
desregistra el worker y se recarga UNA vez. Los telefonos que ya tengan la
cache envenenada por la version vieja se curan solos.

Verificado: 0 de 8 cargas rotas (antes 3 de 6), en 360, 412 y 480px.

**Objetivos tactiles.** Android pide 48dp y WCAG 44px; habia botones de 24,
30, 34 y 36. Los que se tocan todo el dia —tipo de orden, pestañas, el
indicador de conexion (que fuerza la subida de pendientes), Salir— pasan a
40px minimo. Cero desbordamiento horizontal en los tres anchos.

**"Desvincular" estaba pegado a "Salir".** En un telefono, con los dedos y a
media atencion, tocar el de al lado dejaba el aparato fuera de la base y
volver exigia la contrasena del dueno, en plena atencion. Se muda a Estado,
que es donde se busca a proposito, y con confirmacion.

**Ver la contrasena al vincular.** Una contrasena larga a ciegas en un teclado
de telefono se escribe mal mas veces de las que se escribe bien.

## Revision del 2026-09-21 (segunda)

Revisando el despliegue REAL, no una simulacion, salieron tres fallos:

1. **El diagnostico buscaba el codigo de error equivocado.** PostgREST no
   siempre deja pasar el de Postgres: cuando la tabla no esta en su cache de
   esquema responde con codigo PROPIO, `PGRST205`. Mirando solo `42P01`, una
   base COMPLETAMENTE VACIA pasaba la prueba y el diagnostico decia "las 12
   tablas existen". Comprobado contra el proyecto real del dueno, que estaba
   sin instalar: antes detectaba 0 faltantes, ahora las 12.

2. **El diagnostico seguia exigiendo vinculacion.** Al hacer la cuenta
   opcional se actualizo `Acceso.tsx` pero no `diagnostico.ts`, asi que
   Estado pedia en rojo una contrasena que nadie necesitaba, justo lo
   contrario de lo que hacia la pantalla de Caja. Ahora las dos le preguntan
   a la base.

3. **Quitar `skipWaiting()` dejaba aparatos varados.** Se habia quitado para
   evitar el ChunkLoadError, pero un aparato con la v1 instalada seguia con
   ella hasta cerrar TODAS las pestañas, sirviendo su cache envenenada y una
   version de hace dias sin que nadie lo notara. Varado en silencio es peor
   que un error visible. Vuelve `skipWaiting`, porque lo que lo hacia
   peligroso ya no esta: un chunk que falta devuelve 504 en vez de reventar,
   y la app se limpia la cache y recarga una vez si aun asi falla.

## Seguridad — 2026-09-21

La clave publishable viaja dentro del codigo que descarga el navegador.
Cualquiera que abriera la pagina podia, con las politicas del instalador
(`for all using (true)`), borrar las ventas del mes, poner en cero el total
de una orden cobrada, leer todo el historico e insertar ordenes falsas. El
PIN no lo impedia: el PIN vive en el navegador.

**`BLINDAR.sql`** cierra las dos capas:

1. **El rol `anon` se queda sin nada.** Ni leer el menu. Quitarle los
   permisos al rol es mas fiable que cubrirlo con politicas: una politica que
   se olvide deja un hueco, un permiso que no existe no lo deja.
2. **Ya autenticado**, los permisos se acotan a lo que la app de verdad hace,
   sacado de leer cada llamada del codigo: nadie borra nada en ninguna tabla;
   una orden cobrada solo admite que se la anule (GRANT por columna, no por
   tabla); las lineas son inmutables; un turno cerrado no se reabre —lo pedia
   el spec y no se cumplia—; el fondo inicial no cambia despues de abrir la
   caja; el menu es de solo lectura; la bitacora solo admite que se le
   agregue.

**La cuenta quedo OPCIONAL, y apagada por defecto.** Se implemento el cierre
del acceso anonimo y despues el dueno decidio que no queria escribir un correo
y una contrasena en cada telefono. Es su decision y es defendible: lo que no
tiene vuelta atras —borrar ventas, cambiar totales, reabrir turnos— sigue
cerrado pase lo que pase. Lo que queda abierto es leer e insertar.

No se borro el trabajo: `EXIGIR_CUENTA.sql` lo enciende y `PERMITIR_ANONIMO.sql`
lo apaga, y **la app lo detecta sola preguntandole a la base**, sin ajuste que
tocar ni despliegue. Se pregunta en vez de guardarlo en una variable porque
una variable se desincroniza: alguien corre el SQL y la app sigue creyendo lo
contrario. El puente hace lo mismo: solo entra si la cola le responde
"permission denied".

**Cuenta de dispositivo, no cuentas por persona.** Se descarto la matriz de
usuarios: el dueno pidio acceso general, los telefonos se comparten, y la
trazabilidad por persona ya existe donde sirve (PIN + nombre -> bitacora y
recibo). Una sola cuenta del local, cuya contrasena NO esta en el codigo: se
escribe una vez por aparato. Lo que aporta no es saber QUIEN, es que un
desconocido no pueda ni asomarse.
Sin conexion sigue funcionando: la sesion vive en localStorage y el token se
renueva cuando vuelve la senal.

**`VERIFICAR_BLINDAJE.sql`**: 33 operaciones con los dos roles, 33 en verde
contra Postgres 16. Corre dentro de una transaccion que termina en rollback,
asi que se puede pasar en produccion y con una caja abierta — verificado que
no deja ni una fila.

Escribiendo esa verificacion salieron dos falsos positivos propios:
- Con RLS y sin politica, un update o un delete NO fallan: tocan 0 filas y
  devuelven exito. Contarlo como "permitido" daba por abierta una puerta
  cerrada.
- `un_solo_turno_abierto` hace fallar el caso de abrir caja en cualquier base
  viva. Se cierra en la preparacion, dentro de la transaccion que se deshace.
Y un bloqueo silencioso de verdad: `audit_log` no tenia politica de update,
asi que el intento devolvia exito con 0 filas. Ahora se revoca el permiso.

**Claves de API.** El diagnostico detecta la unica equivocacion que no da
sintomas: pegar la clave secreta en vez de la publica. La app funciona MEJOR
con ella —salta las politicas—, asi que nadie se entera. Reconoce los dos
formatos que conviven (sb_publishable_/sb_secret_ y el JWT heredado, leyendo
el rol de su carga) y corta ahi mismo, con la instruccion de revocarla:
quitarla de la app no basta.

**Lo que sigue abierto:** nada del acceso anonimo. Queda el riesgo normal de
cualquier POS — un aparato robado sigue vinculado hasta que se cambie la
contrasena de la cuenta del local.

## Cinco cambios pedidos por el dueno — 2026-09-21

1. **Empaque por pizza.** C$30 por PIZZA (no por linea: tres Criollas en una
   sola linea son tres cajas) cuando la orden sale del local — para llevar,
   delivery o retiro. En mesa no aparece la opcion. Se calcula como el envio:
   sin descuento y sin propina encima, con su IVA aparte. La **tarifa usada**
   se guarda en cada orden, no solo el monto: si manana sube a C$40, reimprimir
   una orden de ayer tiene que seguir dando C$30. Sale en el recibo como
   `Empaque x3`, con el conteo, porque un total C$90 mas alto sin linea que lo
   explique es lo que el cliente reclama en la puerta.
2. **El Excel del cierre integra el IVA en consumibles.** La tabla sumaba el
   neto pelado mientras que "total cobrado" mas abajo si lo llevaba: los dos
   bloques nunca cuadraban y parecia que faltaba plata. Ahora van las seis
   columnas (Cant., Producto, P. unitario, Subtotal, IVA, Total), el total de
   linea es la formula `D+E` y los totales son `SUM`, no valores fijos.
3. **PedidosYa editable desde el resumen del cierre**, junto a las formas de
   pago, no solo dentro del bloque de cerrar caja. Es **un solo campo**: dos
   casillas con el mismo numero en la misma pantalla se contradicen sola.
   Ademas, cuando no hay turno abierto se carga **el ultimo turno del rango
   consultado**: antes `turnoAbierto()` devolvia null pasado el cierre y
   re-descargar el Excel de un dia cerrado salia sin bloque de arqueo y sin
   PedidosYa. Limite honesto: `BLINDAR.sql` bloquea escribir sobre un turno ya
   cerrado (`turno_upd ... using (cerrado_at is null)`), asi que editar la
   cifra despues del cierre sale en el Excel que se descargue en ese momento
   pero **no se guarda en la base**. La pantalla lo dice.
4. **Inventario: fuera la "zona de datos".** La hoja aparte no la abria nadie.
5. **La nota del inventario es ahora un "pedido"**: una cantidad por insumo,
   y abajo, **en la misma hoja**, un bloque `PEDIDO (n)` con solo lo que tiene
   cantidad — Insumo, Pedir, Unid. de medida, Hay. Se decide mirando lo que se
   acaba de contar, asi que es el mismo papel y el mismo momento.

**SQL nuevo:** `supabase/10_empaque.sql` (o volver a correr `00_INSTALAR.sql`,
que ya lo trae). Idempotente. Sin el, la app no puede guardar ordenes: escribe
`empaque` en cada insercion.

**201 pruebas.**

## Hoja de consumo y reimpresion — 2026-09-22

1. **El recibo ya no imprime el metodo de pago.** Para el arqueo vive en la
   base, que es donde se cuadra la caja. `Recibido` y `Cambio` en efectivo se
   quedan: eso no es la etiqueta del metodo, es la cuenta que el cliente
   revisa en el mostrador.
2. **La leyenda es ahora solo "Hoja de consumo"**, sin el "no es factura
   fiscal". Sigue sin afirmar que sea una factura, pero **la negacion
   explicita ya no esta**: queda como riesgo abierto hasta que lo valide el
   contador. Se apaga entera con `mostrarLeyendaFiscal: false` en settings.
3. **La comanda de cocina dejo de imprimirse.** Del cobro sale solo la hoja
   de consumo. El camino sigue en `repo.ts` (`imprimirCocina`) y
   `reimprimir(id, true)` la saca a pedido, asi que volver a encenderla es
   una linea. Borde conocido: una orden que quedo en la cola LOCAL antes de
   este cambio conserva `imprimirCocina: true` y sacara comanda al subir.
4. **Reimprimir sin rehacer el pedido.** Es la razon de todo lo anterior:
   cuando el ticket no salia, la unica salida visible era cargar el pedido
   otra vez y cobrarlo de nuevo. Esa segunda orden es real para la base, asi
   que el cierre salia con la venta DUPLICADA y el efectivo no cuadraba.
   Ahora hay dos caminos, los dos sin tocar la base: el aviso del cobro trae
   **Reimprimir** durante 5.5 s, y un panel **Ultimas ordenes** (las 10
   ultimas, con la mas reciente siempre a la vista) lo permite despues. Sale
   marcada COPIA y queda en la bitacora.

Probando el cobro en un Android emulado de 360px salieron tres fallos que
explican por que alguien rehacia el pedido:
- **La hoja del pedido quedaba abierta y VACIA** tras cobrar, con
  `TOTAL C$ 0.00` y el boton «Cobrar e imprimir» todavia activo.
- **En telefono no habia confirmacion del cobro.** El mensaje «Orden #N
  cobrada» se escribia dentro del bloque del pedido, que en esa disposicion
  no se ve. Lo ultimo que decia la pantalla era «Agregado — Pepperoni».
- El boton de cobrar se podia tocar con el pedido vacio.
Los tres corregidos: la hoja se cierra, el cobro se confirma en un aviso a la
vista y el boton se deshabilita sin lineas.

Verificado a 360 y 412px contra un PostgREST simulado: cero desbordamiento
horizontal, boton de 40px (el minimo de Android) y el flujo completo de
cobrar -> aviso con Reimprimir -> la orden encabezando «Ultimas ordenes».

**204 pruebas.**

## Quitar ordenes del historial — 2026-09-22

Pedido: poder **borrar** pedidos del historial sin que figuren como
cancelados ni salgan en el cierre.

**Se hizo lo segundo y lo tercero; la fila NO se borra.** La orden desaparece
del listado, de los totales, del Excel y de «Ultimas ordenes», y no dice
«anulada» en ninguna pantalla — que es lo que se pidio. Pero la fila sigue en
la base, marcada con `oculta_at / oculta_por / oculta_motivo`.

La razon de no borrarla no es prudencia general, es una concreta: si una orden
cobrada en EFECTIVO se puede hacer desaparecer sin rastro, el arqueo deja de
servir para lo unico que sirve. Quien cobra se queda con la plata, borra la
orden, y la caja cuadra perfecto. Marcada, el arqueo da igual —la orden no
cuenta— pero queda de donde salio. Y se puede **devolver**; un delete no.

- Boton **Quitar** por fila en Cierres, con motivo (sugiere «Prueba»).
- Interruptor **Ver quitadas / Ver el cierre**. En esa vista cada fila dice
  «Quitada por <quien> · <motivo>», hay boton **Devolver**, no hay **Anular**
  y **el Excel queda deshabilitado**, con un aviso de que los totales de
  arriba son los de esa lista y no los del dia.
- En la bitacora quedan dos acciones nuevas: `exclusion` y `restauracion`.

**Para borrar de verdad las pruebas antes de abrir**: `LIMPIAR_PRUEBAS.sql`,
que se corre a mano una sola vez. Muestra primero cuanto va a borrar, el
borrado va comentado para que haya que descomentarlo a proposito, y reinicia
el correlativo para que la primera venta real sea la #1.

**SQL nuevo:** `supabase/11_ocultar.sql` (ya incluido en `00_INSTALAR.sql`) y
un `BLINDAR.sql` actualizado, que ahora concede el UPDATE de esas tres
columnas y **sigue negando el DELETE**.

Verificado contra Postgres 16.13 real, con `BLINDAR.sql` aplicado y los
GRANT por defecto de Supabase:
quitar ✓, el cierre deja de contarla ✓, no figura como anulada ✓, devolver ✓,
**borrar la fila denegado** ✓, **cambiar el total denegado** ✓, la bitacora
acepta las acciones nuevas ✓ y **sigue sin poder editarse ni borrarse** ✓.
El instalador corre tres veces seguidas: 12 tablas, 57 productos, 59 insumos.

Un fallo propio, encontrado manejando la pantalla y no leyendola: la edicion
de las dependencias de `buscar` no llego a aplicarse, asi que «Ver quitadas»
cambiaba de vista **sin volver a consultar**. Mostraba la MISMA lista del
cierre con los botones cambiados, y se habria podido «devolver» una orden que
nunca se quito. Corregido y comprobado: la consulta pasa de `oculta_at=is.null`
a `oculta_at=not.is.null`, 3 filas contra 1.

**204 pruebas.**

## Promociones de dos pizzas — 2026-09-23

Tres promos nuevas, cada una de **dos pizzas 14" enteras**:
`Promo Jamón + Pepperoni`, `Promo Jamón + Hawaiana` y `Promo 2 Hawaianas`.

**El precio son C$500 que el cliente PAGA**, con las cajas y el IVA adentro
(lo confirmo el dueno). Eso obliga a guardar la BASE y no los 500: la columna
`producto.precio` es sin IVA, asi que guardar 50000 haria que el motor les
sumara el 15% y el cliente pagara C$575.

    50000 / 1.15 = 43478.26 centavos  ->  se guarda 43478
    43478 + 15%  = C$500.00 exactos

**Defecto conocido y a proposito:** dos promas en la misma linea dan
**C$999.99**, no C$1000.00, porque 500/1.15 no cae en centavos enteros. Esta
fijado con una prueba para que nadie lo "arregle" de las dos formas malas:
marcar la promo exenta de IVA le mentiria al contador (el IVA del cierre
saldria por debajo), y redondear cada linea rompe «redondeo solo en el total
final», que afecta a toda la carta. Un centavo sobre C$1000, donde no circulan
monedas de ese tamano, cuesta menos que cualquiera de las dos.

**`grupo_descuento` es `otro`, no `pizza`**, y no es descuido:
1. El empaque se cobra por PIZZA y la promo ya trae sus cajas; con `pizza` se
   le sumarian C$30 encima de un precio que ya los incluye.
2. Un descuento de categoria «pizzas» no deberia caerle a una promo, que ya
   es el descuento.
3. No sale en el selector de mitad y mitad, que es lo correcto: dos pizzas
   enteras no se parten.

Dos cosas que salieron al verlo en pantalla, no leyendo el codigo:
- **«Promociones» quedaba al fondo**, entre Bar y Postres, porque el orden de
  categorias pone primero las de grupo `pizza` y la promo es `otro`. Una
  promocion que hay que ir a buscar no se vende. Ahora va primero, a mano.
- **La tarjeta mostraba C$434.78**, la base. Es el numero que alguien termina
  diciendo por telefono. Solo en Promociones la tarjeta muestra ahora el
  precio CON IVA (C$500), que es como se cotiza una promo; el resto de la
  carta sigue en base porque es lo que dice el menu impreso que el personal
  tiene al lado. Hay una prueba que fija que ese numero y el total del cobro
  sean el mismo.

**SQL nuevo:** `supabase/12_promos.sql` (ya incluido en `00_INSTALAR.sql`).
El instalador pasa de 57 a **60 productos**; su consulta final y el README
dicen `12 / 60 / 59`. Verificado con tres corridas seguidas contra Postgres
16.13 real: 12 / 60 / 59 estable.

Cambiar el precio es un solo numero por fila: para C$550 finales seria
`round(55000 / 1.15) = 47826`.

**210 pruebas.**

## Extras de pizza — 2026-09-23

Nueve extras de la lista del dueno: Bacon, Chorizo, Pina, Aceitunas, Brocoli
y Pepperoni a C$60; Queso y Hongos a C$70; Borde de queso a C$85. **Precios
SIN IVA, como el resto de la carta**: C$60 de extra son C$69 para el
cliente. Si la lista ya traia el IVA adentro, cada precio se divide entre
1.15 (C$60 -> 5217) en `13_extras.sql`.

El motor, la base, la reimpresion y el ticket ya soportaban extras desde la
fase 2 (`modificadores`); lo que nunca existio fue la forma de agregarlos.

**Como se usa:** cada linea de pizza tiene «+ Extras». Abre una rejilla de
botones con nombre y precio; tocar pone o quita, con aviso. Lo que lleva queda
escrito debajo de la pizza («+ Bacon · + Borde de queso») y el boton pasa a
«Extras (2)». Solo en pizzas —incluida la mitad y mitad—: una promo ya trae
lo suyo. Con cantidad 2 o mas, el extra va en todas las de la linea, y el
selector lo dice.

**Por que en `producto` y no en una tabla propia.** Una tabla nueva obliga a
tocar BLINDAR, PERMITIR_ANONIMO, EXIGIR_CUENTA, el diagnostico y la copia
offline, y olvidar UNO deja el selector vacio en produccion sin ningun error.
Como productos de la categoria «Extras» heredan todo eso ya probado; la caja
no los muestra en la rejilla. Verificado con BLINDAR y PERMITIR_ANONIMO
aplicados: `anon` y `authenticated` ven los 9, y ninguno cambia un precio
(`authenticated` -> permission denied; `anon` -> 0 filas).

**Los nombres llevan «Extra» delante** porque `nombre` es unico y la pizza
«Pepperoni» ya existe. Comprobado contra Postgres: un extra llamado solo
«Pepperoni» se descarta EN SILENCIO por el `on conflict do nothing`.

Tres defectos que habrian salido con el primer extra cobrado:
1. **El recibo no sumaba.** La linea de la pizza imprimia `bruto`, que ya trae
   los extras, y debajo cada extra volvia a imprimir su precio: una Diabla con
   bacon salia «360.00» y «+ Extra Bacon 60.00». Ahora la pizza imprime su
   importe solo y la columna suma exactamente el subtotal.
2. **El Excel escondia los extras.** Una Diabla con bacon entraba entera a la
   fila «Diabla» (P. unitario C$300 con el bacon en el subtotal) y el bacon
   vendido no aparecia. Ahora cada extra tiene su fila y el neto y el IVA de
   la linea se reparten en proporcion, al centavo. Los pesos son
   precio × cantidad: `repartirProporcional` topa en el total de los pesos, y
   con precios unitarios dos Diablas con bacon quedaban a la mitad.
3. **Tocar la misma pizza otra vez la fundia con la que ya tenia extras**: una
   segunda Diabla despues de ponerle bacon a la primera daba «2 Diablas con
   bacon». Ahora solo se suma a una linea sin nota ni extras.

Y uno que no era de los extras: **la caja abria en «Bar»**. La categoria
inicial salia del primer producto que devuelve la base, que ordena
alfabeticamente, mientras la fila mostraba Promociones primero. El simulador
de la vez anterior tenia las promos al principio de la lista y lo escondio;
esta vez sirve el menu REAL exportado de Postgres, en el orden de la base.

Verificado en un Android de 360px contra ese menu: abre en Promociones, la
categoria «Extras» no aparece, Diabla + Bacon + Borde = C$511.75, botones de
40px, cero desbordamiento, la segunda Diabla sale en su propia linea, y la
promo no ofrece extras. Instalador: tres corridas, **12 / 69 / 59**.

**220 pruebas.**

## BLINDAR cortado y una base atrasada — 2026-09-23

El dueno pego `BLINDAR.sql` y Supabase respondio `unterminated dollar-quoted
string ... LINE 46: do $$`. El texto que llego terminaba EXACTAMENTE en la
linea 100 de 216: se copio de la vista normal de GitHub, que en archivos
largos solo carga un trozo. Reproducido: las primeras 100 lineas dan ese
mismo error, el archivo entero corre limpio. No se aplico nada (antes de la
linea 46 solo hay comentarios, y un error de sintaxis frena todo).

Revisando la base REAL con la clave publica, en solo lectura, salio algo peor:
la app en produccion ya era la version nueva, pero la base seguia en la de
antes — con `orden.empaque`, sin `orden.oculta_at`, sin promos ni extras
(57 productos en vez de 69). En ese estado **la pantalla de Cierres y «Ultimas
ordenes» fallaban** con `column orden.oculta_at does not exist`, y `BLINDAR`
habria fallado aunque se pegara completo, porque da permisos sobre esa columna.

Cuatro arreglos:
1. **`BLINDAR.sql` termina con una comprobacion**: tiene que mostrar
   `BLINDAR aplicado completo`. Hacia falta porque un corte que cae ENTRE dos
   sentencias no da ningun error: comprobado en una base limpia, cortado al
   final del bloque de permisos el editor dice «Success» y queda la politica
   abierta del instalador y SIN la regla que impide reabrir un turno cerrado.
2. **`BLINDAR.sql` se niega a correr antes del instalador**, con un mensaje
   que dice que correr primero, en vez de un «column does not exist».
3. **Estado no veia las columnas nuevas**: su lista no tenia `empaque`,
   `oculta_at` ni `conteo_item.pedido`, asi que con la base real de ese dia
   decia «estan todas las columnas» mientras Cierres fallaba. Es el mismo
   fallo que `precio_mitades`, otra vez.
4. **«Ultimas ordenes» decia «Sin conexion» ante cualquier error**, con el
   telefono en linea. Ahora, igual que Cierres, dice que la base esta
   desactualizada y que correr.

README: `BLINDAR.sql` tambien se copia del Raw (solo se advertia para el
instalador), con enlace directo, el orden (despues del instalador) y que
resultado tiene que verse.

Verificado contra Postgres 16.13 real, los cuatro casos: completo (y dos
veces seguidas) -> `BLINDAR aplicado completo`; cortado en la linea 100 -> el
mismo error del dueno; cortado entre sentencias -> sin tabla de confirmacion;
antes del instalador -> «Primero corre 00_INSTALAR.sql completo…».

**223 pruebas.**

## Promociones con IVA incluido — 2026-09-23

Pedido: que la promo salga «de un solo 500» y que el IVA se cobre solo a lo
demas (gaseosa, pizzas, bebidas), no a la promo.

**Al cliente ya se le cobraba eso**: promo + gaseosa daba C$546 = 500 + 40 +
6. Lo que estaba mal era COMO se mostraba: la promo se guardaba a su base
(C$434.78) y el motor le sumaba el 15%, asi que el recibo ponia la promo a
434.78 y metia sus C$65.22 en la linea «IVA» (con una gaseosa: «IVA 71.22»).
Parecia que a la promo le habian cobrado IVA. Y dos promos daban C$999.99.

**Arreglo de raiz, no de maquillaje:** el producto se marca «precio con IVA
incluido» (`producto.precio_incluye_iva`). La promo guarda C$500 de verdad y
el motor le saca el IVA de adentro en vez de sumarlo, igual que el modo global
que ya existia pero por linea. `desglosarIva` da base + IVA = precio exacto,
asi que dos promos son **C$1000.00** justos. Los totales separan `ivaIncluido`
(el de adentro) de `ivaAgregado` (el que se suma); el recibo y la caja
muestran en «IVA» solo el agregado.

    1  Promo 2 Hawaianas      500.00
    1  Gaseosa                 40.00
    1  Jamón                  260.00
    Subtotal               C$ 800.00
    IVA 15%                C$  45.00      <- solo Jamón + gaseosa
    TOTAL                  C$ 845.00

Promo sola: `Subtotal 500 / TOTAL 500`, sin linea de IVA.

**El IVA de adentro se sigue declarando en el cierre** (C$65.22 por promo),
porque el dueno dijo que la promo incluye el IVA. Si el contador dice que es
exenta: `update producto set aplica_iva = false where categoria =
'Promociones'`, y el cliente paga exactamente lo mismo.

Dos cosas que se habrian roto sin cuidarlas:
- **Reimprimir.** Si la linea no guarda que traia el IVA incluido, la
  reimpresion recalcula la promo como base + 15%: C$575. Se guarda en cada
  linea (`orden_item.iva_incluido_snapshot`), como `aplica_iva_snapshot`. La
  prueba del instalador lo atrapo: sin la columna en `00_INSTALAR.sql`,
  NINGUN cobro se habria guardado. Tambien quedo en Estado.
- **El Excel.** La columna Subtotal usaba el neto, que en una promo ya trae el
  IVA: la fila salia 500 + 65.22 = 565.22 e inflaba consumibles. Ahora usa la
  base.

La tarjeta del menu ya no necesita calcular nada (se quito el caso especial de
Promociones): el precio guardado es el que paga el cliente.

Verificado contra Postgres 16.13 con el camino EXACTO del dueno: una base
armada con el instalador de `12c4244` (57 productos, sin `oculta_at`), luego
el instalador nuevo (69 productos, promos a 50000 con IVA incluido), luego
BLINDAR (`BLINDAR aplicado completo`). Una base con las promos viejas a 43478
se corrige sola, sin pisar un precio que ya se haya cambiado. Un cobro con
promo se guarda como `anon` con BLINDAR aplicado. En un Android de 360px:
promo sola 500 sin IVA; + gaseosa 540 / IVA 6 / 546; + Jamón 800 / IVA 45 /
845.

**230 pruebas.**

## Extras en las promociones — 2026-09-23

Las promos ofrecen «+ Extras» igual que las pizzas. Como una promo son DOS
pizzas y el extra se cobra una vez, va en una sola: el selector lo dice y pide
anotar en cual con «+ Nota».

El problema de plata que habia que resolver antes de la interfaz: la promo
trae su IVA ADENTRO, pero el extra tiene precio SIN IVA como toda la carta.
Desglosando la linea entera, un bacon de C$60 sobre una promo se cobraba a
C$60 y no a C$69. Ahora el motor parte esa linea: la promo se desglosa hacia
atras y los extras pagan su IVA encima; el neto (ya con descuentos) se reparte
entre las dos en proporcion a su bruto, asi que un 10% cae parejo.

    1  Promo 2 Hawaianas      500.00
       + Extra Bacon           60.00
    Subtotal               C$ 560.00
    IVA 15%                C$   9.00      <- solo el del bacon
    TOTAL                  C$ 569.00

El Excel reparte la base de esa linea entre la promo y el bacon pesando la
promo por su precio SIN IVA: por precio (500 contra 60) la promo se quedaba
con base de mas. Promo 434.78 + 65.22, bacon 60 + 9.

**Limite conocido:** para poner el mismo extra en LAS DOS pizzas de la promo
no hay forma todavia (cada extra se pone o se quita una vez).

Sin SQL nuevo. Verificado en un Android de 360px: la promo ofrece extras, el
aviso de la pizza aparece, promo + bacon = 560 / IVA 9 / 569, sin
desbordamiento.

**236 pruebas.**

## Interfaz nueva y editar órdenes — 2026-10-06

Pedido: mejorar toda la interfaz, limpiarla, cambiar la paleta, el sistema de
desplazarse y el de marcar casillas, y poder **editar un pedido ya agregado
sin rehacerlo**.

**Un fallo de plata encontrado antes de empezar.** «Guardar sin cobrar»
escribía la orden como **PAGADA en efectivo** (`estado: "pagada"`, con
`cerrada_at`). El cierre la contaba como plata que nunca entró a la caja, y
además imprimía la hoja de consumo. Ahora guarda `estado = 'abierta'`: no
cuenta en el cierre, no imprime, y se cobra después abriéndola. Las órdenes
ya guardadas así en la base siguen como pagadas; no se tocan.

**Editar una orden guardada.** En la Caja, «Órdenes guardadas» muestra
primero las **sin cobrar** (botón «Abrir») y debajo las últimas cobradas
(«Editar» y «Reimprimir»). Abrir carga la orden en la caja tal como se
guardó —líneas, extras, mitades, notas, descuentos, tipo, cliente—, se
cambia lo que haga falta y se guarda **sobre la misma orden, con el mismo
número**.
- Sin cobrar → «Guardar cambios» (sigue abierta) o «Cobrar» (pasa a pagada e
  imprime). Sin bitácora: todavía no es plata.
- Cobrada → «Guardar corrección e imprimir». Muestra cuánto cambia
  (`Cobrar C$ X más` / `Devolver C$ X`), **exige motivo** y reimprime la hoja
  corregida.

Pasa por una función de la base, `editar_orden` (`15_editar_orden.sql`, ya
dentro de `00_INSTALAR.sql`), **no por permisos nuevos**: BLINDAR sigue
negando cambiar el total o las líneas con un update. La función reemplaza
todo junto o nada, y se niega a: tocar una orden anulada; devolver una
cobrada a «sin cobrar»; corregir una cobrada sin motivo; dejar una orden sin
líneas; y **corregir una cobrada de un turno ya cerrado** (ese efectivo ya se
contó y se firmó: se anula y se vuelve a cargar). Cada corrección de una
cobrada queda en la bitácora como `edicion`, con total, método y líneas de
ANTES y DESPUÉS y la diferencia. Bajar el total de una venta en efectivo
después de cobrarla es la forma clásica de quedarse con la diferencia: se
puede, pero queda escrito quién y cuánto.
Ejecutable por `authenticated` siempre y por `anon` solo si la base está en
modo sin cuenta: correr el instalador no reabre lo que cerró
`EXIGIR_CUENTA.sql`, y `PERMITIR_ANONIMO.sql` la vuelve a conceder.

Verificado contra Postgres 16 con BLINDAR aplicado, como `anon` y con el
contenido EXACTO que arma la app (capturado de `repo.ts`, no escrito a mano):
crear abierta 851.00 → cobrar con 3 pizzas 1207.50 y cambio 292.50 ✓;
volver a abierta ✗; corregir sin motivo ✗; corregir con motivo ✓ y bitácora
con antes/después/diferencia ✓; sin líneas ✗; turno cerrado ✗; anulada ✗;
`update orden set total = 0` y `delete from orden_item` siguen denegados ✓.
Permiso de `anon`: con cuenta exigida no, reinstalando con cuenta exigida
sigue que no, tras PERMITIR_ANONIMO + BLINDAR sí ✓.

Nueva guarda en `instalador.test.ts`: la lista de columnas que la app
escribe es UNA sola función (`columnasOrden` / `filasItems`, compartida por
crear y editar), y la prueba exige que `editar_orden` actualice cada una.
Quitando `empaque` de la función, falla nombrándola: es el mismo fallo
silencioso que `precio_mitades`, ahora en editar.

Estado detecta si falta la función, y la caja dice «a la base le faltan
partes de la versión nueva» en vez del error crudo de PostgREST.

**Paleta: «cartel de serigrafía».** Tinta violeta casi negra, texto color
papel y una sola tinta fuerte, **amarillo queso** (`#ffc83d`), reservada a
lo que se toca. No es rojo a propósito: en una caja el rojo es peligro
(cancelar, anular, sin conexión) y el botón de cobrar no puede parecerse al
de cancelar. La segunda mitad de la pizza pasa a cian, que no se confunde
con el amarillo. Contrastes medidos: texto 15.4:1, secundario 8.3:1, el más
tenue 5.2:1, amarillo 11.3:1 — todo AA con margen. Ya no queda un color
escrito a mano fuera de `globals.css`; la barra de Android y el ícono usan
los mismos.

**Tipografía.** Atkinson Hyperlegible (la diseñó el Braille Institute para
que I, l y 1, o 0 y O no se confundan) para el texto y su versión mono para
los montos; Big Shoulders, condensada de cartel, solo en títulos y el TOTAL.
Se descargan al compilar: funcionan sin internet.

**Navegación.** Las seis pestañas de arriba —dos fuera de la pantalla a
360px y lejos del pulgar— pasan a una **barra abajo**: Caja, Cierres,
Inventario y «Más» (Estación, Probar impresora, Estado). En PC siguen arriba.

**Desplazamiento del menú.** Ya no es una categoría a la vez: todo el menú
es una lista continua y la fila de categorías queda **pegada arriba,
siguiendo sola** dónde se está. Tocar una categoría salta a ella. Y hay
**buscador** (lo pedía el spec): «pina» encuentra «Piña», sin tildes.

**Casillas y selección.** Antes todo era un chip y elegir, prender y marcar
se veían igual. Ahora tres controles, uno por tipo de decisión:
**segmentado** para una opción de varias (tipo de orden, forma de pago,
propina, %/C$), **interruptor** para sí/no (propina, empaque, opciones de la
impresora) y **casilla con palomita** para varias a la vez (extras). La
casilla nativa del empaque, de 13px, desapareció. Los tres anuncian su
estado al lector de pantalla.

**Limpieza.**
- `page.tsx` de la caja: el bloque de tipo de orden y datos del cliente
  estaba DUPLICADO (teléfono y PC). Ahora es uno, y va dentro del pedido.
  La línea del pedido y el menú son componentes propios.
- En Cierres, los botones de cada orden estaban escritos una vez; las
  tarjetas para teléfono los reusan en vez de copiarlos.
- `reimprimir` y editar comparten `cargarOrden`; crear y editar comparten
  `columnasOrden`.
- La línea del pedido: arriba qué y cuánto, abajo Nota · Extras · Mitades y
  la cantidad. Bajar desde 1 muestra el tacho y quita la línea (con
  deshacer).
- El tipo de orden en UNA fila con nombres cortos (Mesa · Llevar · Delivery
  · Retiro): en dos ocupaba media hoja antes de llegar al pedido.
- En Cierres, en teléfono, las órdenes son tarjetas; la tabla dejaba filas
  de 130px con los botones saliéndose de la pantalla. Las sin cobrar se
  marcan, se pueden anular, y un aviso arriba dice cuántas hay y cuánto
  suman antes de cerrar.

**Tres fallos que salieron mirando la pantalla, no el código:**
1. **El botón de cobrar salía DOS veces en la hoja del teléfono.** Las
   clases propias estaban fuera de una capa de CSS, y en Tailwind 4 eso les
   gana a las utilidades: `btn hidden lg:flex` nunca se ocultaba. Ahora
   viven en `@layer components`.
2. **«Hay una versión nueva» salía en un teléfono recién estrenado.** El
   service worker pasa un instante por «waiting» también en la primera
   instalación. Ahora solo avisa si ya había una versión controlando.
3. **Corregir sin motivo parecía no hacer nada**: el aviso quedaba abajo,
   fuera de la pantalla, y el campo arriba. Ahora lleva la vista al campo.
4. **Corregir una orden cobrada en efectivo que subió de total quedaba
   bloqueada en silencio**: trae el «recibido» de entonces (C$700), el
   nuevo total es C$1,104, y el «recibido menor que el total» se escribía
   en el mismo lugar invisible. Ahora todo error del cobro sale como aviso
   flotante y lleva la vista al campo que hay que corregir.

Además: el texto de los extras se montaba sobre el precio a 360px
(«Aceitunas+60»); un `<select>` de la Estación ensanchaba la página a 382px;
quedaba un «probá» en la Estación; y cada carga daba un 404 por
`/favicon.ico`, que no existía (ahora se declara el ícono SVG).

Verificado en un Android de 360px y en PC de 1366px contra un PostgREST
simulado con el menú real: cero desbordamiento en las seis pantallas, flujo
completo agregar → guardar sin cobrar → abrir → cobrar → editar cobrada →
sin motivo (bloquea) → recibido insuficiente (bloquea, a la vista) →
corregido (guarda y reimprime), y los totales
(Diabla + Piña + gaseosa para llevar = 494.50; Diabla + promo = 845.00).

**SQL nuevo:** `supabase/15_editar_orden.sql`, ya dentro de `00_INSTALAR.sql`.
Sin él, la app sigue cobrando normal; lo que falla es abrir una orden
guardada, y Estado lo dice.

**241 pruebas.**

## Fase 2 (demo unificada) — 2026-10-08

Rama `demo-unificada`. Decisiones: backend Supabase (confirmado), demo para
el dueño en ~2 meses con la base preparada para varios restaurantes, y las
promos son SOLO las tres del POS (Jamón + Pepperoni, Jamón + Hawaiana,
2 Hawaianas); el «elige tus 2 pizzas» del sitio viejo desaparece.

### F2.1 — Doble cobro, orden sin líneas y orden atascada

Tres fallos de plata que ya afectaban a Rock Munchies:

1. **Doble cobro.** Cada toque en «Cobrar» inventaba un `id_local` nuevo:
   si la orden entraba pero la respuesta se perdía, el segundo toque creaba
   OTRA orden. Y si la impresión fallaba después de guardar, la caja decía
   «no se pudo guardar» de una orden que SÍ estaba guardada.
   Ahora la caja guarda un identificador por pedido, el mismo en todos los
   intentos, y se renueva solo al terminar o cancelar. El reintento devuelve
   la misma orden («ya estaba guardada, no se cobró dos veces»), y un fallo
   de impresión se dice como lo que es: «cobrada, sin ticket», con
   Reimprimir. Si el primer intento guardó pero no encoló el ticket, el
   reintento lo encola; si ya estaba, no imprime otro.
2. **Orden sin líneas.** Orden y líneas iban en dos pedidos separados.
   Ahora van juntas por `crear_orden` (`16_crear_orden.sql`, ya en el
   instalador): todo o nada, idempotente por `id_local`, y si encuentra una
   orden vieja que quedó sin líneas, se las completa. Si la base todavía no
   tiene la función, la app guarda por el camino viejo en vez de pararse.
3. **Orden atascada sin internet.** Una subida que moría a la mitad dejaba
   la orden en «subiendo» para siempre: ni se reintentaba ni se contaba en
   el indicador. Ahora se reintenta pasado un minuto y cuenta como
   pendiente. Reintentar es seguro por lo anterior.

Verificado contra Postgres 16, como `anon` con BLINDAR y con el contenido
EXACTO que arma la app: guardar ✓; reintento → misma orden, 1 sola ✓; una
línea inválida → no queda la orden a medias ✓; estado anulada, sin
`id_local` y sin líneas → rechazados ✓; la función interna de líneas no se
puede llamar directo ✓; orden huérfana reparada ✓; **dos guardados
simultáneos del mismo pedido → una orden** (el segundo esperó al primero y
devolvió «ya existía») ✓. Permisos según el modo de cuenta, igual que
`editar_orden` ✓. En pantalla (360px, cola de impresión caída a propósito):
«Orden #151 cobrada, sin ticket» con Reimprimir, pedido limpio, una sola
llamada a la base.

Pruebas nuevas: `repo.guardar.test.ts` (10), `offline/servicio.test.ts` (6),
6 más en `sync.test.ts` y 3 en `instalador.test.ts`. Comprobadas al revés:
con un `id_local` nuevo por intento fallan 5; con el error de impresión
propagado fallan 2; quitando una columna de la función, la prueba la nombra.

**266 pruebas.**

### Impresión: solo por internet, al tocar imprimir

Pedido del dueño: quitar la «zona de impresiones», dejar solo la conexión por
internet, y que imprima en el momento de darle imprimir.

- **Se fue la Estación de impresión** (`/estacion`) con sus seis modos (RawBT
  por Bluetooth, USB, puerto COM, Web Bluetooth, navegador y puente) y la
  pantalla que había que dejar abierta en un aparato para vaciar la cola. Se
  borraron sus adaptadores. **«Probar impresora»** (`/prueba`) también se fue:
  conectaba por Web Bluetooth y puerto COM.
- **Un solo camino:** cualquier aparato deja el ticket en la cola y lo
  imprime la PC de caja con el puente. Hay **un solo punto de salida**
  (`imprimirDocumento`) para cobro, reimpresión, pre-cuenta y prueba.
- **Al instante:** el puente ahora escucha en tiempo real los tickets nuevos
  y los imprime apenas entran. Antes esperaba a la consulta de cada 3 s, que
  queda de respaldo. Si llega un ticket mientras imprime otro, vuelve a mirar
  la cola al terminar en vez de esperar la siguiente consulta.
- **Pantalla nueva «Impresora»** (`/impresora`, en «Más»): dice si la PC de
  caja está respondiendo, y tiene ancho del papel, hoja de acentos, «quitar
  acentos» y recibo de prueba. Esas preferencias ahora se usan en TODO lo que
  se imprime; antes la cola ignoraba el juego de caracteres elegido.
- Se quedan «Imprimir aquí» y «Descargar recibo» en la caja (Más opciones):
  no son un modo de impresión sino el respaldo desde el navegador cuando no
  hay internet o la PC está apagada.

**Fallo encontrado de paso:** con la versión actual de supabase-js, **el
puente no arranca en Node 18 ni 20** (se cae al construir el cliente: le
falta el WebSocket nativo), aunque su `package.json` decía `>=18`. Es el mismo
fallo que ya se había corregido en la app. Ahora pide `>=22` y el README de
`bridge/` lo dice como paso 0. El tiempo real se comprobó contra un servidor
sin WebSocket: avisa que está caído y sigue con la consulta, sin caerse.

Riesgo que queda, y es de diseño: sin internet o con la PC apagada no sale
ningún ticket.

`docs/PROBAR.md` reescrito para este flujo; `bridge/README.md` y el
`README` actualizados, y sin voseo.

**256 pruebas** (se fueron las de RawBT y de selección de modo).

## Fuera del spec original
- [x] **Pizza mitad y mitad.** Precio = suma de las dos ÷ 2, por decisión del
      dueño. Queda como ajuste `precioMitades` por si conviene cambiar a
      "la más cara": con el promedio, mitad Criolla (C$250) + mitad La
      Fabulosa (C$450) sale C$350, o sea media pizza de mariscos por debajo
      del precio de la entera.
      Selector visual: una pizza partida que muestra qué lleva cada lado
      mientras se elige, y el precio con su cuenta a la vista. En el recibo
      encabeza `MITAD Y MITAD` con las dos mitades debajo; en la comanda van
      a doble altura y separadas, que es donde una mala lectura cuesta una
      pizza rehecha.
- [x] **PedidosYa deja de ser método de pago.** Esa plata nunca pasa por la
      caja: la plataforma cobra, descuenta comisión y deposita días después.
      Ahora se anota el total que reporta la plataforma al cerrar el turno, y
      sale en su propio bloque del Excel para que nadie intente cuadrarlo
      contra el efectivo.
- [x] **Inventario** (`/inventario`): 59 insumos de Plantilla_Inventario.xlsx,
      conteo con borrador local, y exportación a Excel fiel a la plantilla
      (mismos anchos, mismo encabezado Arial 12 sobre #2A3F54, mismos bordes).
      La fecha y quién contó van en el encabezado de impresión, para no
      alterar la estructura de la hoja.
- [x] **Formato del recibo** rehecho según el modelo del dueño: abre con la
      línea de separación, `Orden #` en vez de `Recibo #`, fecha corta,
      montos con `C$` y sin separador de miles, `Cambio` en vez de `Vuelto`,
      TOTAL sin doble ancho, y el importe del ítem en la última línea del
      nombre partido. Se quitó el desglose de base gravable/exenta y el
      precio unitario por línea, que recargaban el ticket.

## Decisiones tomadas
- Métodos de pago: **Efectivo, Banpro, BAC y PedidosYa**, reemplazando
  tarjeta/transferencia/mixto. PedidosYa se reporta aparte porque esa plata
  no entra a la caja el mismo día: la plataforma deposita después y con
  comisión descontada. Meterla en el arqueo hace que la caja nunca cuadre.
- Stack: Next.js + TypeScript + Tailwind. ✅ ya implementado.
- Backend: **se queda en Supabase**, decidido por el dueño. El spec dice
  Appwrite, pero Postgres hace GROUP BY y el cierre pide agregaciones (top
  productos, ticket promedio, totales por tipo y método) que en una base
  documental obligan a traerse todas las filas y agregar en JS.
- Sin Clerk ni Heroku. (Nota: el MCP de Clerk sí está disponible en esta
  sesión, pero se respeta la decisión de no usarlo.)
- Dinero en enteros de centavos, nunca floats. ✅
- Cálculo en una sola función pura con tests. ✅
- Descuentos por alcance: general / pizzas / bebidas, en % o monto fijo,
  con reparto por mayor resto para que las líneas cuadren con el total. ✅
- Registro de la UI: "tú" al personal, "usted" al cliente en el recibo. ✅

## Pendientes / riesgos abiertos
- Validar con contador requisitos DGI (recibo vs factura fiscal). La leyenda
  "no es factura fiscal" se sigue imprimiendo; se apaga con
  `mostrarLeyendaFiscal: false` si el contador dice que no hace falta.
- **37 de los 59 insumos del inventario no traen unidad de medida** en la
  plantilla original. Sin unidad, dos conteos del mismo insumo no se pueden
  comparar. La app los marca en naranja para que alguien de la cocina los
  complete una vez.
- Validar con contador la base de la propina y si el envío paga IVA.
  **Resuelto como ajuste opcional** (`envioGravado`), apagado por defecto
  para seguir al spec. Se cambia en `settings` sin tocar código.
- Precios de la carta: **confirmado que son base**, el IVA se suma encima.
  La Jamón de C$260 se cobra a C$299. El seed queda como está.
- iOS sin Web Bluetooth → **resuelto**: el puente de `bridge/` imprime por
  el iPhone. Queda el límite conocido de que el puente necesita internet.
- Codepage de la PT-210: **verificado en hardware**. El selftest reporta
  `Code page: CP437`, que es justo el predeterminado. Resuelto.
- **La PT-210 del local solo habla Bluetooth CLÁSICO (SPP), no BLE.** Lo
  confirman el `PIN: 0000` del selftest y que Android pida PIN al vincularla:
  BLE nunca pide PIN de cuatro dígitos. Web Bluetooth habla exclusivamente
  BLE, así que **nunca va a poder imprimir en esta impresora**, y no es algo
  que se arregle en código: el canal no existe.
  Salidas implementadas, en orden de preferencia en Android:
  **RawBT** (app puente que sí habla SPP, se le entrega el ticket por intent),
  **WebUSB** (el selftest reporta `Interface: USB&BT`, así que con cable OTG
  Chrome le habla directo), y el **puente de la PC**.
- Emparejar con PIN desde la página es **imposible**: ningún navegador tiene
  API para Bluetooth Clásico. El emparejamiento vive en los ajustes de
  Android o dentro de RawBT, y ninguna web puede abrir ese diálogo.
- **El puente sigue necesitando internet para imprimir.** El offline resuelve
  tomar órdenes sin señal, pero las comandas de cocina no salen hasta que
  vuelva la conexión, porque el puente consulta la cola en la nube. Cerrarlo
  del todo exige un servidor local, que choca con mixed content (GAP.md §1.3).
  Mitigación disponible hoy: el fallback HTML imprime desde el navegador.
- "Enteros en centavos" vs "redondeo solo en el total final":
  **resuelto** calculando en milésimas de centavo (enteros) y redondeando
  solo al construir los totales visibles.
