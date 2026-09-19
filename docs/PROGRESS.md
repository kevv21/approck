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
- [ ] ¿Impresora LAN? → **decisión abierta**, ver GAP.md §1.2 y §1.3.
      La PT-210 es solo Bluetooth: no tiene IP.

## Fases
- [ ] 1. Setup: proyecto, Appwrite, auth con roles, Sentry
      → bloqueado: el MCP de Appwrite no está disponible (GAP.md §1.1).
      Sin auth ni Sentry todavía. Service worker sin hacer.
- [~] 2. Productos + órdenes (4 tipos) + función de cálculo con tests
      → hecho: catálogo de 57 productos, 4 tipos de orden, `calcularTotales`
        pura con 13 pruebas, precio congelado por línea.
      → falta: `aplica_iva` por producto, modo "precios con IVA incluido",
        descuento por línea, modificadores, flujo de estados de la orden.
- [~] 3. Cobro + recibo HTML/PDF + pre-cuenta + comanda
      → hecho: recibo térmico 58mm con desglose, comanda de cocina.
      → falta: pre-cuenta, leyenda "no es factura fiscal", "COPIA" en
        reimpresiones, 80mm configurable, fallback PDF/HTML, US$.
- [~] 4. Capa de impresión (puente LAN ESC/POS + fallbacks)
      → hecho: Web Bluetooth para PT-210, cola con estado y reintentos,
        detección de iOS, prueba de codepage.
      → falta: interfaz `PrinterAdapter`, puente LAN, fallback PDF.
- [~] 5. Sesiones de caja + cierre + Excel
      → hecho: turnos con fondo inicial y arqueo, Excel de 4 hojas.
      → falta: conteo por denominación en C$ y US$, hojas `Pagos` y
        `Anulaciones`, fórmulas de Excel, nombre de archivo del spec,
        top productos, ticket promedio, bloqueo de sesión cerrada.
- [ ] 6. Offline + sincronización — sin empezar
- [ ] 7. Reportes admin + auditoría — sin empezar, falta `audit_log`
- [ ] 8. Pruebas en dispositivos reales + despliegue — sin empezar

**Avance real contra el spec completo: ~30%.**

## Decisiones tomadas
- Stack: Next.js + TypeScript + Tailwind. ✅ ya implementado.
- Backend: el spec dice Appwrite. **Lo construido usa Supabase.**
  Decisión pendiente del dueño: migrar a Appwrite o quedarse en Supabase.
- Sin Clerk ni Heroku. (Nota: el MCP de Clerk sí está disponible en esta
  sesión, pero se respeta la decisión de no usarlo.)
- Dinero en enteros de centavos, nunca floats. ✅
- Cálculo en una sola función pura con tests. ✅
- Descuentos por alcance: general / pizzas / bebidas, en % o monto fijo,
  con reparto por mayor resto para que las líneas cuadren con el total. ✅
- Registro de la UI: "tú" al personal, "usted" al cliente en el recibo. ✅

## Pendientes / riesgos abiertos
- Validar con contador requisitos DGI (recibo vs factura fiscal).
- Validar con contador la base de la propina y **si el envío paga IVA**:
  el spec lo deja fuera del IVA, el código actual lo grava (GAP.md §2.2).
- **Confirmar si los precios de la carta son base o finales.** Hoy el sistema
  cobra C$299 por la Jamón de C$260. Si el cliente hoy paga C$260 en total,
  hay que recalcular el seed antes de operar.
- iOS sin Web Bluetooth → resuelto por cola de impresión, pero el puente LAN
  del spec choca con mixed content desde una PWA en HTTPS (GAP.md §1.3).
- El codepage de la PT-210 **sigue sin verificarse en hardware real**.
- "Enteros en centavos" y "redondeo solo en el total final" se contradicen
  tal como están escritos en el spec (GAP.md §2.1).
