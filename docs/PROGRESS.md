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
