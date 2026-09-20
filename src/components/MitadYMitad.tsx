"use client";

import { useMemo, useState } from "react";
import { fmtC } from "@/lib/money";
import {
  precioMitadYMitad, type MitadPizza, type Producto, type ReglaMitades,
} from "@/lib/types";

/**
 * Selector de pizza mitad y mitad.
 *
 * La pizza dibujada no es adorno: el error que se comete al tomar este pedido
 * es confundir cuál mitad lleva qué, y una lista de dos desplegables no lo
 * evita. Acá se ve el reparto mientras se elige, y el precio se actualiza
 * a la vista para que nadie tenga que confiar en la cuenta.
 */
export default function MitadYMitad({
  pizzas, regla, onConfirmar, onCancelar,
}: {
  pizzas: Producto[];
  regla: ReglaMitades;
  onConfirmar: (a: MitadPizza, b: MitadPizza, precio: number) => void;
  onCancelar: () => void;
}) {
  const [a, setA] = useState<MitadPizza | null>(null);
  const [b, setB] = useState<MitadPizza | null>(null);
  // Qué mitad se está eligiendo. Avanza sola, pero se puede volver tocando.
  const [lado, setLado] = useState<"a" | "b">("a");
  const [filtro, setFiltro] = useState("");

  const visibles = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return f ? pizzas.filter((p) => p.nombre.toLowerCase().includes(f)) : pizzas;
  }, [pizzas, filtro]);

  const precio = a && b ? precioMitadYMitad(a, b, regla) : null;

  const elegir = (p: Producto) => {
    const mitad: MitadPizza = { productoId: p.id, nombre: p.nombre, precio: p.precio };
    if (lado === "a") { setA(mitad); setLado("b"); }
    else { setB(mitad); setLado("a"); }
  };

  const Mitad = ({ m, cual }: { m: MitadPizza | null; cual: "a" | "b" }) => {
    const activo = lado === cual;
    return (
      <button
        onClick={() => setLado(cual)}
        className="flex-1 rounded-lg p-2 text-left transition"
        style={{
          background: activo ? "var(--panel-2)" : "transparent",
          border: `1px solid ${activo ? "var(--acc)" : "var(--borde)"}`,
        }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-wide"
             style={{ color: activo ? "var(--acc)" : "var(--txt-2)" }}>
          {cual === "a" ? "Primera mitad" : "Segunda mitad"}
        </div>
        <div className="mt-0.5 text-sm font-medium leading-tight">
          {m ? m.nombre : <span style={{ color: "var(--txt-2)" }}>Elegí una pizza</span>}
        </div>
        {m && (
          <div className="mono text-xs" style={{ color: "var(--txt-2)" }}>
            entera {fmtC(m.precio)}
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
         style={{ background: "rgba(0,0,0,.6)" }} onClick={onCancelar}>
      <div className="panel flex max-h-[92vh] w-full max-w-lg flex-col gap-3 p-4
                      sm:rounded-xl"
           style={{ borderRadius: "16px 16px 0 0" }}
           onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between">
          <h2 className="font-bold">Pizza mitad y mitad</h2>
          <button className="btn btn-ghost !min-h-0 !px-3 !py-1.5"
                  onClick={onCancelar}>✕</button>
        </div>

        {/* La pizza. El lado que se está eligiendo late en naranja. */}
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0" aria-hidden="true">
            <circle cx="50" cy="50" r="47" fill="var(--panel-2)"
                    stroke="var(--borde)" strokeWidth="2" />
            <path d="M50 3 A47 47 0 0 0 50 97 Z"
                  fill={a ? "var(--acc)" : "transparent"}
                  opacity={lado === "a" ? 1 : 0.55}
                  stroke={lado === "a" ? "var(--acc)" : "transparent"} strokeWidth="2" />
            <path d="M50 3 A47 47 0 0 1 50 97 Z"
                  fill={b ? "var(--acc-2)" : "transparent"}
                  opacity={lado === "b" ? 1 : 0.55}
                  stroke={lado === "b" ? "var(--acc)" : "transparent"} strokeWidth="2" />
            <line x1="50" y1="3" x2="50" y2="97"
                  stroke="var(--borde)" strokeWidth="2" />
          </svg>

          <div className="flex flex-1 flex-col gap-2">
            <Mitad m={a} cual="a" />
            <Mitad m={b} cual="b" />
          </div>
        </div>

        {/* El precio, y de dónde sale. Sin esto nadie confía en el número. */}
        {a && b && precio !== null && (
          <div className="rounded-lg p-3" style={{ background: "var(--panel-2)" }}>
            <div className="mono flex items-baseline justify-between">
              <span className="text-sm" style={{ color: "var(--txt-2)" }}>
                {regla === "promedio"
                  ? `(${fmtC(a.precio)} + ${fmtC(b.precio)}) ÷ 2`
                  : "la más cara de las dos"}
              </span>
              <b className="text-lg" style={{ color: "var(--acc)" }}>{fmtC(precio)}</b>
            </div>
          </div>
        )}

        <input className="input" placeholder="Buscar pizza…"
               value={filtro} onChange={(e) => setFiltro(e.target.value)} />

        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          <div className="grid grid-cols-2 gap-2">
            {visibles.map((p) => {
              const elegida = (lado === "a" ? a : b)?.productoId === p.id;
              return (
                <button key={p.id} onClick={() => elegir(p)}
                        className="rounded-lg p-2 text-left transition active:scale-[0.97]"
                        style={{
                          background: elegida ? "var(--acc)" : "var(--panel-2)",
                          color: elegida ? "#1a0d04" : "var(--txt)",
                          border: "1px solid var(--borde)",
                        }}>
                  <div className="text-sm font-semibold leading-tight">{p.nombre}</div>
                  <div className="mono text-xs"
                       style={{ color: elegida ? "#1a0d04" : "var(--txt-2)" }}>
                    {fmtC(p.precio)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <button className="btn btn-acc w-full" disabled={!a || !b}
                onClick={() => a && b && precio !== null && onConfirmar(a, b, precio)}>
          {a && b ? `Agregar · ${fmtC(precio!)}` : "Elegí las dos mitades"}
        </button>
      </div>
    </div>
  );
}
