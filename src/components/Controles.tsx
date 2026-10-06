"use client";

/**
 * CONTROLES DE SELECCIÓN
 *
 * Antes todo era un chip: elegir el tipo de orden, prender la propina, marcar
 * un extra. Se veían iguales y hacían cosas distintas — unos excluyen a los
 * demás, otros se suman, otros prenden y apagan—, así que había que probar
 * para saber cuál era cuál. Y el empaque usaba la casilla nativa del
 * navegador, de 13px, imposible de acertar con el dedo.
 *
 * Tres formas, una por tipo de decisión:
 *   Segmentado  -> UNA opción de un grupo fijo (tipo de orden, método de pago)
 *   Interruptor -> sí / no (propina, empaque)
 *   Casilla     -> varias a la vez (extras)
 *
 * Los tres anuncian su estado al lector de pantalla con el rol correcto, y
 * el estado se ve con algo más que color (peso, palomita, posición).
 */

export function Segmentado<T extends string | number>({
  opciones, valor, onCambio, etiqueta, className = "",
}: {
  opciones: { valor: T; etiqueta: React.ReactNode }[];
  valor: T;
  onCambio: (v: T) => void;
  /** Para el lector de pantalla: qué se está eligiendo. */
  etiqueta: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className={`seg ${className}`}>
      {opciones.map((o) => (
        <button key={String(o.valor)} type="button" role="radio"
                aria-checked={o.valor === valor}
                onClick={() => onCambio(o.valor)}>
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

export function Interruptor({
  activo, onCambio, children, detalle,
}: {
  activo: boolean;
  onCambio: (v: boolean) => void;
  children: React.ReactNode;
  /** Una línea debajo, en pequeño: el monto o la consecuencia. */
  detalle?: React.ReactNode;
}) {
  return (
    <button type="button" role="switch" aria-checked={activo}
            className="interruptor" onClick={() => onCambio(!activo)}>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-sm font-semibold">{children}</span>
        {detalle && (
          <span className="mt-0.5 block text-xs" style={{ color: "var(--txt-3)" }}>
            {detalle}
          </span>
        )}
      </span>
      <span className="pista" aria-hidden="true" />
    </button>
  );
}

export function Casilla({
  marcada, onCambio, children, extra, className = "",
}: {
  marcada: boolean;
  onCambio: () => void;
  children: React.ReactNode;
  /** A la derecha, alineado: normalmente el precio. */
  extra?: React.ReactNode;
  className?: string;
}) {
  return (
    <button type="button" role="checkbox" aria-checked={marcada}
            className={`casilla ${className}`} onClick={onCambio}>
      <span className="marca" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
             strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
        </svg>
      </span>
      {/* El precio va DEBAJO del nombre y no al lado: a 360px, en dos
          columnas, «Aceitunas» y «+60» se montaban uno encima del otro. */}
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-sm font-semibold">{children}</span>
        {extra && <span className="mono block text-xs" style={{ color: "var(--txt-2)" }}>{extra}</span>}
      </span>
    </button>
  );
}
