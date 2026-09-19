# Progreso

Estado real al 2026-09-19. Ver `docs/GAP.md` para el detalle de la brecha
contra `docs/SPEC.md` y las contradicciones abiertas.

## Fase 0 — Preparación (manual, antes de Claude Code)
- [ ] Canjear Appwrite Education en education.github.com/pack
- [ ] Crear proyecto en Appwrite Cloud
- [ ] `claude plugin install appwrite@claude-plugins-official` → /plugins → configurar
- [ ] `claude mcp add --transport http appwrite https://mcp.appwrite.io/` → /mcp → Authenticate
- [ ] `claude mcp add --transport http sentry https://mcp.sentry.dev/mcp` → /mcp → Authenticate
- [ ] Llenar los [CORCHETES] que quedan en docs/SPEC.md: RUC, dirección,
      teléfono y el tope de descuento del rol Caja
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
- [~] 5. Sesiones de caja + cierre + Excel
      → hecho: turnos con fondo inicial y arqueo, Excel de 4 hojas.
      → falta: conteo por denominación en C$ y US$, hojas `Pagos` y
        `Anulaciones`, fórmulas de Excel, nombre de archivo del spec,
        top productos, ticket promedio, bloqueo de sesión cerrada.
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
- [ ] 7. Reportes admin + auditoría — sin empezar, falta `audit_log`
- [ ] 8. Pruebas en dispositivos reales + despliegue — sin empezar

**Avance real contra el spec completo: ~72%.** (69 pruebas)

## Decisiones tomadas
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
- Validar con contador requisitos DGI (recibo vs factura fiscal).
- Validar con contador la base de la propina y si el envío paga IVA.
  **Resuelto como ajuste opcional** (`envioGravado`), apagado por defecto
  para seguir al spec. Se cambia en `settings` sin tocar código.
- Precios de la carta: **confirmado que son base**, el IVA se suma encima.
  La Jamón de C$260 se cobra a C$299. El seed queda como está.
- iOS sin Web Bluetooth → **resuelto**: el puente de `bridge/` imprime por
  el iPhone. Queda el límite conocido de que el puente necesita internet.
- El codepage de la PT-210 **sigue sin verificarse en hardware real**.
  Se verifica con `cd bridge && npm run prueba`.
- **El puente sigue necesitando internet para imprimir.** El offline resuelve
  tomar órdenes sin señal, pero las comandas de cocina no salen hasta que
  vuelva la conexión, porque el puente consulta la cola en la nube. Cerrarlo
  del todo exige un servidor local, que choca con mixed content (GAP.md §1.3).
  Mitigación disponible hoy: el fallback HTML imprime desde el navegador.
- "Enteros en centavos" vs "redondeo solo en el total final":
  **resuelto** calculando en milésimas de centavo (enteros) y redondeando
  solo al construir los totales visibles.
