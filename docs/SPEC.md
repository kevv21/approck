# Proyecto: POS para restaurante — PWA (teléfono + PC)

## Contexto
Sistema POS como PWA instalable para teléfonos Android/iOS y PC (Windows, Chrome/Edge). Lo usan meseros (teléfono), caja (PC) y administrador.

- Negocio: Rock Munchies, RUC [PENDIENTE], dirección [PENDIENTE], teléfono [PENDIENTE]
- País: Nicaragua. Moneda principal: córdobas (C$). Secundaria: dólares (US$), tipo de cambio configurable por día.
- IVA: 15%, configurable. Los precios del menú NO INCLUYEN IVA (confirmado por el dueño; el motor debe soportar ambos modos como ajuste).
- Propina/servicio: 10% opcional; configurable, no gravada con IVA, el cliente puede rechazarla. Base de cálculo pendiente de validar con contador (ver GAP.md).

## Stack (obligatorio)
- Next.js (App Router) + TypeScript + Tailwind, PWA con service worker.
- Appwrite Cloud: auth, base de datos, realtime, functions, storage. Usar el MCP de Appwrite.
- Sentry para errores en cliente y servidor.
- Exportación Excel con ExcelJS.
- Dinero en enteros (centavos). Nunca floats.

## Roles y permisos (Appwrite Teams/Labels)
- Mesero: crea/edita órdenes abiertas, envía a cocina, solicita cuenta. No cobra, no anula órdenes cobradas, no ve cierres.
- Caja: cobra, imprime recibos, descuentos hasta [X]%, abre y cierra caja.
- Admin: todo lo anterior + productos/precios, descuentos sin límite, anulaciones, reportes, configuración, historial de cierres.
- Toda anulación o descuento registra usuario, fecha/hora y motivo obligatorio.

## Modelo de datos (mínimo)
- products: nombre, categoría, precio_centavos, aplica_iva, activo, modificadores opcionales.
- orders: número correlativo, tipo (mesa | para_llevar | retiro | delivery), mesa (si aplica), datos cliente/dirección/costo envío (delivery), estado (abierta | enviada_cocina | por_cobrar | pagada | anulada), mesero, caja_session_id, timestamps.
- order_items: producto, cantidad, precio_unitario (congelado al momento de venta), modificadores, nota, descuento, subtotal línea.
- payments: order_id, método (efectivo | tarjeta | transferencia | mixto), moneda, monto, tipo de cambio usado, vuelto, referencia.
- cash_sessions: apertura (usuario, fecha, fondo inicial), cierre (usuario, fecha, efectivo contado, diferencia, observaciones), estado.
- settings: datos del negocio, IVA, propina, tipo de cambio, ancho de papel, pie de recibo.
- audit_log: anulaciones, descuentos, cambios de precio, reimpresiones.

## Cálculo del recibo (una sola función pura, con tests)
Orden: subtotal (suma de líneas) → descuentos → base gravable → IVA 15% (solo ítems gravados) → propina (sobre subtotal sin IVA, si aplica) → envío (si delivery) → total.
- Precios con IVA incluido: desglosar IVA hacia atrás.
- Redondeo al centavo solo en el total final.
- Tests: precios con y sin IVA incluido, productos exentos, descuento por línea y por total, propina, delivery, pago mixto C$/US$.

## Recibo de consumo (impreso)
Formato térmico 58mm y 80mm (configurable). Contenido en orden:
1. Encabezado: logo, nombre, RUC, dirección, teléfono.
2. N.º de recibo correlativo, fecha/hora, tipo de orden (Mesa X / Para llevar / Retiro / Delivery), mesero, cajero.
3. Datos del cliente si es delivery.
4. Detalle: cantidad, descripción (con modificadores y notas), precio unitario, importe.
5. Subtotal, descuentos, IVA 15%, propina, envío, TOTAL.
6. Método(s) de pago, monto recibido, vuelto, equivalente en US$.
7. Pie configurable + leyenda "Recibo de consumo — no es factura fiscal" hasta integrar facturación autorizada por la DGI.
8. Reimpresiones marcadas como "COPIA".
Además: pre-cuenta (antes de cobrar) y comanda de cocina (sin precios).

## Capa de impresión (crítico)
Interfaz `PrinterAdapter` con implementaciones intercambiables:
1. ESC/POS por red (LAN/IP) mediante un puente local (servicio Node en la PC de caja) que recibe trabajos desde los teléfonos por red local. Opción principal: funciona en iPhone.
2. Web Serial / WebUSB / Web Bluetooth: solo Chrome en Android y PC. Detectar soporte en runtime.
3. Fallback: vista HTML optimizada con window.print() y PDF descargable.
- iOS no soporta Web Bluetooth: detectarlo y usar opción 1 o 3 sin romperse.
- Cola de impresión con reintento y estado visible (enviado, impreso, error).

## Offline
- Órdenes se crean/editan sin internet: cola local en IndexedDB que sincroniza al reconectar.
- Números de orden temporales se reemplazan al sincronizar, sin duplicados.
- Indicador visible de conexión y pendientes por sincronizar.
- Cobro y cierre requieren conexión: bloquearlos con mensaje claro.

## Cierre de caja
Flujo: apertura con fondo inicial → pagos asociados a la sesión → cierre: el cajero cuenta efectivo por denominación (C$ y US$), el sistema calcula esperado y muestra diferencia (sobrante/faltante) → sesión bloqueada → imprime resumen y descarga Excel.

Pantalla de cierre:
- Ventas brutas, descuentos, IVA, propinas, envíos, ventas netas.
- Totales por método de pago y por moneda.
- Totales y cantidad de órdenes por tipo: mesa, para llevar, retiro, delivery.
- Anulaciones (cantidad, monto, quién, motivo).
- Top productos por cantidad e ingreso.
- Ticket promedio.

## Excel del cierre (.xlsx, una hoja por sección)
1. Resumen: datos de sesión, fondo inicial, esperado vs contado, diferencia, totales generales.
2. Ventas detalle: una fila por línea vendida: N.º orden, fecha/hora, tipo (mesa/para llevar/retiro/delivery), mesa, mesero, producto, cantidad, precio unitario, descuento, subtotal, IVA, total línea, método de pago.
3. Por tipo de orden: cantidad de órdenes y monto por tipo.
4. Por producto: cantidad total, ingreso, % del total.
5. Pagos: cada pago con método, moneda, monto, tipo de cambio, referencia.
6. Anulaciones y descuentos: con usuario y motivo.
- Formato moneda, encabezados congelados, totales con fórmulas de Excel (no valores fijos).
- Nombre: Cierre_[AAAA-MM-DD]_[caja]_[n.º sesión].xlsx

## Interfaz
- Mesero (teléfono): mapa/lista de mesas con estado, selector de tipo de orden, menú por categorías con búsqueda, botones grandes, uso con una mano.
- Caja (PC): órdenes por cobrar, cobro con cálculo de vuelto y pago mixto, impresión, apertura/cierre.
- Admin: productos, usuarios, configuración, historial de cierres (re-descargar Excel), reportes por rango de fechas.
- Español en toda la UI.

## Fases (entregar y validar cada una antes de seguir)
1. Setup: proyecto, Appwrite (colecciones, permisos), auth con roles, Sentry.
2. Productos + creación de órdenes (4 tipos) + función de cálculo con tests.
3. Cobro + recibo HTML/PDF + pre-cuenta + comanda.
4. Capa de impresión: puente LAN ESC/POS + fallbacks.
5. Sesiones de caja + cierre + Excel.
6. Offline + sincronización.
7. Reportes admin + auditoría.
8. Pruebas en dispositivos reales (Android, iPhone, PC) + despliegue.

## Reglas de trabajo
- Antes de cada fase: plan y archivos a crear.
- No inventar requisitos fiscales; todo lo DGI va en settings como pendiente.
- Si algo es inviable o contradictorio, decirlo antes de implementar.
