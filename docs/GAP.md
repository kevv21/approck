# Análisis de brecha: código actual vs docs/SPEC.md

Fecha: 2026-09-19. Repo en `claude/determined-franklin-kz5981`, 2 commits, 22 pruebas.

Este documento existe porque CLAUDE.md pide señalar contradicciones y cosas
inviables **antes** de implementar. Nada de lo de abajo está inventado: sale
de comparar el spec con el código que ya está en el repo.

---

## 1. Bloqueos duros (no se resuelven escribiendo código)

### 1.1 El MCP de Appwrite no está disponible en esta sesión

El spec ordena: *"Usa el MCP de Appwrite para crear colecciones, índices y
permisos; no los describas, créalos."* En esta sesión los MCP disponibles son
GitHub, Sentry, Clerk, Google Drive, Gmail, Canva y Claude Docs. **Appwrite
no está.** La Fase 0 de PROGRESS.md (canjear Appwrite Education, crear el
proyecto, `claude mcp add appwrite`) sigue sin hacerse.

Consecuencia: la Fase 1 no se puede completar como está escrita. Las opciones
reales son crear el esquema a mano en la consola de Appwrite, o que se corra
la Fase 1 en una sesión local con el MCP configurado.

### 1.2 La PT-210 no tiene puerto de red

El spec define como **opción principal** de impresión: *"ESC/POS por red
(LAN/IP) mediante un puente local… Opción principal: funciona en iPhone."*

La impresora del local es una GOOJPRT PT-210: **solo Bluetooth**, sin
Ethernet ni WiFi. No existe una IP a la que mandarle ESC/POS. El puente tiene
que emparejarse con ella por Bluetooth SPP (puerto COM en Windows) y exponer
HTTP en la LAN. Es viable, pero no es "ESC/POS por red": es un puente
Bluetooth con fachada de red, y el punto único de falla pasa a ser la PC de
caja.

Alternativa: comprar una térmica de 80mm con puerto Ethernet (C$2,000–4,000).
Eso sí implementa el spec literal, resuelve el iPhone, y de paso cubre el
requisito de 80mm configurable.

### 1.3 Mixed content: una PWA en HTTPS no puede hablarle a un puente en HTTP

Este es el problema más serio del diseño propuesto y conviene verlo ahora.

El spec quiere: PWA instalable (requiere HTTPS y service worker) + teléfonos
que mandan trabajos al puente en la LAN. Pero el navegador **bloquea** una
petición desde `https://…` hacia `http://192.168.1.50:9100`: es contenido
mixto, y encima Chrome aplica Private Network Access. No hay flag que lo
arregle del lado del sitio.

Salidas posibles, ninguna gratis:

| Opción | Costo real |
|---|---|
| Puente con certificado válido en la LAN | Requiere dominio + DNS que resuelva a la IP local. Complejo de mantener. |
| Servir toda la PWA desde el puente por HTTP | Se pierde el service worker: sin PWA instalable y sin offline. Choca con el spec. |
| Certificado autofirmado aceptado una vez por dispositivo | Funciona, pero hay que repetirlo en cada teléfono y molesta en iOS. |
| **El puente consulta la nube en vez de recibir** | Los teléfonos escriben en la base; el puente en la PC hace polling y imprime. Mantiene HTTPS y PWA. **Requiere internet para imprimir.** |

La última es la que ya está implementada en el repo, solo que hoy el que
imprime es un Android en vez de la PC. Cambiar el host a la PC es mejor: está
siempre encendida y enchufada.

**Pero choca con el requisito de offline:** el spec pide tomar órdenes sin
internet. Si la impresión pasa por la nube, sin internet no salen comandas de
cocina. Hay que decidir explícitamente qué se prioriza.

---

## 2. Contradicciones dentro del propio spec

### 2.1 "Enteros en centavos" vs "redondeo solo en el total final"

El spec pide las dos cosas. Son incompatibles tal como están escritas: si la
unidad mínima es el centavo entero, **cada** operación con porcentajes
redondea, no solo la última.

Para cumplir ambas hay que trabajar internamente en una escala más fina
(milésimas de córdoba = centavos × 10, siguen siendo enteros) y redondear a
centavos solo al construir los totales visibles. Es lo que propongo, pero
implica refactorizar `src/lib/pricing.ts`, que hoy trabaja en centavos.

### 2.2 ¿El envío paga IVA?

El spec ordena el cálculo así: *"…IVA 15% (solo ítems gravados) → propina →
**envío (si delivery)** → total"*. El envío queda **después** del IVA, o sea
no gravado.

El código actual lo mete en la base gravable (sí paga IVA), porque el
servicio de delivery es un servicio gravado. Cambia el total del cliente.

No voy a decidirlo por mi cuenta: es una cuestión fiscal y el spec dice
"nada fiscal hardcodeado". Propongo dejarlo como ajuste `envioGravado` en
`settings`, con el default puesto en lo que diga el contador.

### 2.3 Propina: el spec ya lo resuelve, el código coincide

*"Propina sobre subtotal sin IVA, no gravada con IVA"* — es exactamente lo
que hace `calcularTotales` hoy. Sin conflicto. Queda validar con el contador
si en Nicaragua la base es esa (ya estaba anotado como pendiente).

---

## 3. Brecha funcional: qué hay y qué falta

### Lo que ya cumple

| Requisito del spec | Estado |
|---|---|
| Next.js + TypeScript + Tailwind | ✅ |
| Dinero en enteros, nunca floats | ✅ (en centavos, falta la escala fina de 2.1) |
| Cálculo en una función pura con tests | ✅ `src/lib/pricing.ts`, 13 pruebas |
| 4 tipos de orden (mesa/para llevar/retiro/delivery) | ✅ |
| Precio congelado al momento de venta | ✅ `precio_snapshot` |
| Descuentos con motivo registrado | ✅ (falta el usuario que lo aplicó) |
| Comanda de cocina sin precios | ✅ |
| Cola de impresión con estado y reintentos | ✅ |
| Detectar que iOS no soporta Web Bluetooth | ✅ |
| Excel del cierre con ExcelJS | ✅ parcial (4 hojas de 6) |
| UI en español | ✅ |

### Lo que falta, por fase del spec

**Fase 1 — Setup (0%)**
- Appwrite: colecciones, índices, permisos → bloqueado por 1.1
- Auth con roles Mesero / Caja / Admin → **no existe nada de auth**
- Límite de descuento por rol (`[X]%` para Caja) → corchete sin llenar
- Sentry en cliente y servidor → no integrado
- Service worker / PWA real → hay `manifest.json` pero **no hay service worker**

**Fase 2 — Productos y órdenes (60%)**
- Falta `aplica_iva` por producto (ítems exentos)
- Falta modo "precios incluyen IVA" con desglose hacia atrás
- Falta descuento **por línea** (hoy solo general/pizzas/bebidas)
- Falta modificadores de producto (hoy solo nota de texto libre)
- Falta el flujo de estados: `abierta → enviada_cocina → por_cobrar → pagada`
  (hoy la orden nace `pagada`)
- Falta pantalla de mesas con estado para el mesero

**Fase 3 — Cobro y recibo (55%)**
- Falta **pre-cuenta** (antes de cobrar)
- Falta la leyenda obligatoria *"Recibo de consumo — no es factura fiscal"*
- Las reimpresiones dicen `** REIMPRESIÓN **`, el spec pide `COPIA`
- Falta ancho 80mm configurable (hoy 32 columnas fijas de 58mm)
- Falta fallback HTML + `window.print()` + PDF descargable
- Falta equivalente en US$ en el recibo

**Fase 4 — Impresión (40%)**
- Falta la interfaz `PrinterAdapter` con implementaciones intercambiables
  (hoy Web Bluetooth está cableado directo)
- Falta el puente LAN → bloqueado por 1.2 y 1.3

**Fase 5 — Cierre de caja (50%)**
- Falta conteo de efectivo **por denominación**, en C$ y US$
- Faltan 2 hojas del Excel: `Pagos` y `Anulaciones y descuentos`
- Los totales del Excel son valores fijos; el spec pide **fórmulas de Excel**
- Falta el nombre `Cierre_[AAAA-MM-DD]_[caja]_[n.º sesión].xlsx`
- Faltan del resumen: anulaciones, top productos, ticket promedio
- Falta bloquear la sesión al cerrarla

**Fase 6 — Offline (0%)**
- No hay IndexedDB, ni cola local, ni números de orden temporales
- No hay indicador de conexión ni de pendientes por sincronizar

**Fase 7 — Reportes y auditoría (0%)**
- No existe `audit_log`
- No hay reportes por rango para admin ni re-descarga de cierres

**Fase 8 — Dispositivos reales (0%)**
- Nada probado en hardware. **El codepage de la PT-210 sigue sin verificarse.**

### Entidades del modelo que no existen todavía

`payments` (el spec pide pagos múltiples por orden, con moneda y tipo de
cambio por pago; hoy el método de pago es un campo de `orden`),
`audit_log`, `settings`, y todo lo de multimoneda US$ con tipo de cambio
configurable por día.

---

## 4. Resumen honesto

Lo construido cubre bien el **núcleo de cálculo y el recibo térmico**, que es
la parte más delicada y la que más caro sale equivocar. Eso se reutiliza casi
entero aunque cambie la base de datos, porque `money.ts`, `pricing.ts`,
`escpos.ts` y `ticket.ts` no dependen del backend.

Lo que **no** se reutiliza si se va a Appwrite: `supabase.ts`, `repo.ts`, los
tres `.sql`, y los `useEffect` de las tres pantallas. Es aproximadamente un
tercio del código.

Contra el spec completo, el avance real está alrededor del **30%**, y las
fases que faltan (auth con roles, offline, multimoneda, auditoría, puente de
impresión) son las más laboriosas.
