"use client";

import { useState } from "react";
import { Casilla } from "@/components/Controles";
import { fmt, fmtC } from "@/lib/money";
import type { LineaCalculada, Producto } from "@/lib/types";

/** «Extra Bacon» → «Bacon» donde ya se sabe que es un extra. */
export const nombreCortoExtra = (nombre: string) => nombre.replace(/^Extra\s+/i, "");

/** «+60» y no «+60.00»: los centavos no aportan en un botón. */
const precioCorto = (c: number) => (c % 100 === 0 ? String(c / 100) : fmt(c));

/**
 * UNA LÍNEA DEL PEDIDO
 *
 * Todo lo que se le puede cambiar a una línea está en la línea: cantidad,
 * nota, extras, mitades. Nada obliga a borrarla y volver a agregarla, que es
 * donde se cuelan los errores (la nota que se olvida, el extra que se pierde).
 */
export default function LineaPedido({
  l, extras, admiteExtras, esPromo, onCantidad, onNota, onExtra, onMitades,
}: {
  l: LineaCalculada;
  extras: Producto[];
  admiteExtras: boolean;
  esPromo: boolean;
  onCantidad: (delta: number) => void;
  onNota: (nota: string) => void;
  onExtra: (extra: Producto) => void;
  onMitades: () => void;
}) {
  const [nota, setNota] = useState(Boolean(l.notas));
  const [verExtras, setVerExtras] = useState(false);
  const nExtras = l.modificadores?.length ?? 0;

  return (
    <div className="rounded-xl p-2.5" style={{ background: "var(--panel-2)" }}>
      {/* Arriba lo que se lee: qué y cuánto. Abajo lo que se toca. */}
      <div className="flex items-baseline gap-2 px-0.5">
        <span className="flex-1 text-sm font-semibold leading-tight">{l.nombre}</span>
        <span className="mono shrink-0 text-sm font-bold">{fmtC(l.bruto)}</span>
      </div>

      {l.mitades && (
        <div className="mt-1 flex flex-col gap-0.5 px-0.5 text-xs" style={{ color: "var(--txt-2)" }}>
          {l.mitades.map((m, k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: k === 0 ? "var(--acc)" : "var(--mitad-b)" }} />
              ½ {m.nombre}
            </span>
          ))}
        </div>
      )}

      {nExtras > 0 && (
        <div className="mt-1 px-0.5 text-xs font-semibold leading-snug" style={{ color: "var(--acc-2)" }}>
          {l.modificadores!.map((m) => `+ ${nombreCortoExtra(m.nombre)}`).join("  ·  ")}
        </div>
      )}

      {l.descTotal > 0 && (
        <div className="mono mt-1 px-0.5 text-xs" style={{ color: "var(--acc-2)" }}>
          desc. −{fmtC(l.descTotal)} → {fmtC(l.neto)}
        </div>
      )}

      {nota && (
        <input className="input mt-2 !min-h-10 !text-sm" autoFocus={!l.notas}
               placeholder="Nota (sin cebolla, bien cocida…)"
               value={l.notas ?? ""}
               onChange={(e) => onNota(e.target.value)}
               onBlur={() => { if (!l.notas) setNota(false); }} />
      )}

      {verExtras && (
        <div className="mt-2">
          {(esPromo || l.cantidad > 1) && (
            <p className="mb-2 px-0.5 text-xs leading-snug" style={{ color: "var(--txt-2)" }}>
              {esPromo
                ? "Cada extra va en una de las dos pizzas: anota en cuál con «Nota»."
                : `Se aplica a las ${l.cantidad} pizzas de esta línea.`}
            </p>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            {extras.map((e) => (
              <Casilla key={e.id}
                       marcada={(l.modificadores ?? []).some((m) => m.nombre === e.nombre)}
                       onCambio={() => onExtra(e)}
                       extra={`+${precioCorto(e.precio)}`}>
                {nombreCortoExtra(e.nombre)}
              </Casilla>
            ))}
          </div>
        </div>
      )}

      {/* Acciones a la izquierda, cantidad a la derecha, siempre en el mismo
          lugar. Bajar desde 1 quita la línea (con deshacer). */}
      <div className="mt-1.5 flex items-center gap-1">
        <div className="flex min-w-0 flex-1 flex-wrap items-center">
          {!nota && (
            <button className="btn-texto" onClick={() => setNota(true)}>
              <IconoNota /> Nota
            </button>
          )}
          {admiteExtras && extras.length > 0 && (
            <button className="btn-texto" aria-expanded={verExtras}
                    style={nExtras > 0 || verExtras ? { color: "var(--acc)" } : undefined}
                    onClick={() => setVerExtras((v) => !v)}>
              <IconoMas /> {verExtras ? "Listo" : nExtras > 0 ? `Extras (${nExtras})` : "Extras"}
            </button>
          )}
          {l.mitades && (
            <button className="btn-texto" onClick={onMitades}>
              <IconoMitad /> Mitades
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center overflow-hidden rounded-xl"
             style={{ background: "var(--bg)", border: "1px solid var(--borde)" }}>
          <button className="grid h-10 w-10 place-items-center text-lg font-bold"
                  aria-label={l.cantidad === 1 ? `Quitar ${l.nombre}` : `Una ${l.nombre} menos`}
                  style={{ color: l.cantidad === 1 ? "var(--mal)" : "var(--txt)" }}
                  onClick={() => onCantidad(-1)}>
            {l.cantidad === 1 ? <IconoQuitar /> : "−"}
          </button>
          <span className="mono w-6 text-center font-bold" aria-live="polite">{l.cantidad}</span>
          <button className="grid h-10 w-10 place-items-center text-lg font-bold"
                  aria-label={`Una ${l.nombre} más`}
                  onClick={() => onCantidad(+1)}>+</button>
        </div>
      </div>
    </div>
  );
}

const ico = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
       strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const IconoNota = () => ico(<><path d="M4 20h4L19 9l-4-4L4 16Z" /><path d="m13 7 4 4" /></>);
const IconoMas = () => ico(<path d="M12 5v14M5 12h14" />);
const IconoMitad = () => ico(<><circle cx="12" cy="12" r="8" /><path d="M12 4v16" /></>);
const IconoQuitar = () => ico(<><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>);
