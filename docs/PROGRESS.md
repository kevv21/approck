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
- [ ] 8. Pruebas en dispositivos reales + despliegue — sin empezar

**Avance contra el spec, ya ajustado a lo que pidió el dueño: ~92%.** (105 pruebas)

## Fuera del spec original
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
