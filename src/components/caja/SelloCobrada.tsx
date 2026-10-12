"use client";

import { useEffect } from "react";
import { fmtC } from "@/lib/money";
import { Check } from "@/components/Iconos";

/** Lo bastante para leerlo y tocar Reimprimir; menos que lo que tarda el siguiente pedido. */
const DURACION = 4500;

/**
 * EL SELLO DE «COBRADA»
 *
 * Antes el cobro se confirmaba con el mismo aviso que «Agregado», abajo y
 * pequeño. El cobro es el momento que más importa de la caja y el que más
 * dudas deja («¿entró?, ¿lo cobro otra vez?»), así que se dice distinto: un
 * sticker blanco que se estampa sobre el menú, con el número y el total.
 *
 * No tapa nada que haga falta: el menú de atrás se sigue pudiendo tocar, y
 * agregar el primer producto del siguiente pedido lo quita.
 */
export default function SelloCobrada({
  titulo, numero, total, onCerrar, onReimprimir,
}: {
  titulo: string;
  numero?: number;
  total: number;
  onCerrar: () => void;
  /** Si no salió el papel: evita rehacer el pedido y cobrarlo dos veces. */
  onReimprimir?: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onCerrar, DURACION);
    return () => clearTimeout(t);
  }, [onCerrar]);

  const orden = numero != null ? `#${numero}` : "";

  return (
    <div role="status" aria-live="polite"
         className="pointer-events-none fixed inset-x-0 z-[55] flex flex-col items-center gap-3 px-6"
         style={{ top: "34%" }}>
      <button type="button" className="sello sellar pointer-events-auto"
              aria-label={`Orden ${orden} ${titulo.toLowerCase()}, ${fmtC(total)}. Tocar para cerrar.`}
              onClick={onCerrar}>
        <span className="flex items-center gap-2">
          <span className="sello-ok"><Check size={18} /></span>
          <span className="display text-[34px] leading-9">{titulo}</span>
        </span>
        <span className="mono text-[15px] font-bold">
          {orden && `${orden} · `}{fmtC(total)}
        </span>
      </button>
      {onReimprimir && (
        <button type="button" className="btn btn-ghost btn-chico pointer-events-auto surgir"
                style={{ boxShadow: "var(--sombra)" }}
                onClick={() => { onReimprimir(); onCerrar(); }}>
          Reimprimir
        </button>
      )}
    </div>
  );
}
