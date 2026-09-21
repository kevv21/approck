"use client";

import { useState } from "react";

/**
 * Una sección que se abre solo cuando hace falta.
 *
 * Los descuentos ocupaban media pantalla del pedido —tres bloques con su
 * selector, su campo y cinco atajos cada uno— y empujaban el total y el botón
 * de cobrar fuera de la vista. En una caja el descuento es la excepción y el
 * total es el punto; la pantalla tiene que decir eso.
 *
 * `resumen` es lo que se ve cerrado: si hay algo aplicado, se ve sin abrir.
 */
export default function Plegable({
  titulo, resumen, activo, children,
}: {
  titulo: string;
  resumen?: string;
  /** Hay algo puesto aquí dentro: se marca y se abre de entrada. */
  activo?: boolean;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(Boolean(activo));

  return (
    <div className="panel overflow-hidden"
         style={activo ? { borderColor: "var(--acc)" } : undefined}>
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 px-3.5 text-left"
        style={{ minHeight: "52px" }}
      >
        <span className="text-sm font-bold uppercase tracking-wide"
              style={{ color: activo ? "var(--acc)" : "var(--txt-2)" }}>
          {titulo}
        </span>
        {resumen && (
          <span className="mono ml-auto text-sm font-bold"
                style={{ color: "var(--acc-2)" }}>{resumen}</span>
        )}
        <span aria-hidden="true"
              className={`transition ${resumen ? "" : "ml-auto"}`}
              style={{ color: "var(--txt-3)",
                       transform: abierto ? "rotate(180deg)" : undefined,
                       transitionDuration: "150ms" }}>
          ▾
        </span>
      </button>
      {abierto && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
