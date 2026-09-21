"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtC } from "@/lib/money";
import {
  precioMitadYMitad, type MitadPizza, type Producto, type ReglaMitades,
} from "@/lib/types";

/**
 * Selector de pizza mitad y mitad.
 *
 * La pizza dibujada no es adorno. El error que se comete al tomar este pedido
 * es confundir cual mitad lleva que, y dos desplegables no lo evitan. Aca el
 * color del lado de la pizza es el mismo color del nombre en la tarjeta, asi
 * que el reparto se lee de un vistazo, sin tener que recordar cual eligio
 * primero.
 *
 * El precio muestra su propia cuenta. Un numero sin explicacion en una pantalla
 * de cobro invita a que alguien lo corrija a mano.
 */
const COLOR = { a: "var(--acc)", b: "var(--mitad-b)" } as const;
/**
 * Tinta sobre cada fondo: marron oscuro sobre el naranja, casi negro sobre el
 * azul. Un solo color no contrasta bien contra los dos.
 */
const TINTA = { a: "#1a0d04", b: "#04121c" } as const;

/**
 * Una de las dos mitades. Vive FUERA del componente a proposito: definida
 * adentro, React la trata como un tipo distinto en cada render y desmonta y
 * vuelve a montar el boton con cada tecla que se escribe en el buscador.
 */
function Mitad({ m, cual, activo, onElegir }: {
  m: MitadPizza | null;
  cual: "a" | "b";
  activo: boolean;
  onElegir: () => void;
}) {
  return (
    <button
      onClick={onElegir}
      aria-pressed={activo}
      className="flex-1 rounded-lg p-2.5 text-left transition"
      style={{
        background: activo ? "var(--panel-2)" : "transparent",
        border: `2px solid ${activo ? COLOR[cual] : "var(--borde)"}`,
      }}
    >
      <div className="flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: m ? COLOR[cual] : "var(--borde)" }} />
        <span className="text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: activo ? COLOR[cual] : "var(--txt-2)" }}>
          {cual === "a" ? "Primera mitad" : "Segunda mitad"}
        </span>
      </div>
      <div className="mt-0.5 text-sm font-semibold leading-tight">
        {m ? m.nombre : (
          <span style={{ color: "var(--txt-2)", fontWeight: 400 }}>
            {activo ? "Elige una pizza abajo" : "Sin elegir"}
          </span>
        )}
      </div>
      {m && (
        <div className="mono text-xs" style={{ color: "var(--txt-2)" }}>
          entera {fmtC(m.precio)}
        </div>
      )}
    </button>
  );
}

export default function MitadYMitad({
  pizzas, regla, inicial, onConfirmar, onCancelar,
}: {
  pizzas: Producto[];
  regla: ReglaMitades;
  /** Mitades ya elegidas, cuando se abre para EDITAR una linea del pedido. */
  inicial?: [MitadPizza, MitadPizza] | null;
  onConfirmar: (a: MitadPizza, b: MitadPizza, precio: number) => void;
  onCancelar: () => void;
}) {
  const [a, setA] = useState<MitadPizza | null>(inicial?.[0] ?? null);
  const [b, setB] = useState<MitadPizza | null>(inicial?.[1] ?? null);
  // Que mitad recibe el proximo toque. Avanza sola mientras falte elegir;
  // cuando ya estan las dos se queda quieta, porque ahi un avance automatico
  // reemplaza en silencio la mitad que el mesero ya habia confirmado.
  const [lado, setLado] = useState<"a" | "b">("a");
  const [filtro, setFiltro] = useState("");

  // Escape cierra. En PC es el reflejo de cualquiera frente a un modal.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancelar(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancelar]);

  /** Pizzas agrupadas por categoria: 26 en una sola rejilla no se recorren. */
  const grupos = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    const visibles = f
      ? pizzas.filter((p) => p.nombre.toLowerCase().includes(f))
      : pizzas;
    const mapa = new Map<string, Producto[]>();
    for (const p of visibles) {
      const lista = mapa.get(p.categoria);
      if (lista) lista.push(p); else mapa.set(p.categoria, [p]);
    }
    return [...mapa.entries()];
  }, [pizzas, filtro]);

  const completo = a !== null && b !== null;
  const precio = a && b ? precioMitadYMitad(a, b, regla) : null;

  const elegir = (p: Producto) => {
    const mitad: MitadPizza = { productoId: p.id, nombre: p.nombre, precio: p.precio };
    if (lado === "a") {
      setA(mitad);
      if (!b) setLado("b"); // solo avanza mientras falte la otra mitad
    } else {
      setB(mitad);
      if (!a) setLado("a");
    }
  };

  const intercambiar = () => { setA(b); setB(a); };

  return (
    <div role="dialog" aria-modal="true" aria-label="Pizza mitad y mitad"
         className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
         style={{ background: "rgba(0,0,0,.65)" }} onClick={onCancelar}>
      <div className="panel flex max-h-[92vh] w-full max-w-lg flex-col gap-3 p-4"
           style={{ borderRadius: "16px 16px 0 0" }}
           onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between">
          <h2 className="font-bold">Pizza mitad y mitad</h2>
          <button className="btn btn-ghost !min-h-0 !px-3 !py-1.5"
                  aria-label="Cerrar" onClick={onCancelar}>✕</button>
        </div>

        {/* La pizza. Cada lado toma el color del nombre que le corresponde. */}
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0" aria-hidden="true">
            <circle cx="50" cy="50" r="47" fill="var(--panel-2)"
                    stroke="var(--borde)" strokeWidth="2" />
            <path d="M50 3 A47 47 0 0 0 50 97 Z"
                  fill={a ? COLOR.a : "transparent"}
                  stroke={a ? "none" : "var(--borde)"}
                  strokeDasharray="4 4" strokeWidth="1.5" />
            <path d="M50 3 A47 47 0 0 1 50 97 Z"
                  fill={b ? COLOR.b : "transparent"}
                  stroke={b ? "none" : "var(--borde)"}
                  strokeDasharray="4 4" strokeWidth="1.5" />
            <line x1="50" y1="3" x2="50" y2="97"
                  stroke="var(--panel)" strokeWidth="2.5" />
            {/* Aro sobre el lado que recibe el proximo toque. */}
            <path d={lado === "a"
                      ? "M50 3 A47 47 0 0 0 50 97"
                      : "M50 3 A47 47 0 0 1 50 97"}
                  fill="none" stroke={COLOR[lado]} strokeWidth="4"
                  strokeLinecap="round" />
          </svg>

          <div className="flex flex-1 flex-col gap-2">
            <Mitad m={a} cual="a" activo={lado === "a"} onElegir={() => setLado("a")} />
            <Mitad m={b} cual="b" activo={lado === "b"} onElegir={() => setLado("b")} />
          </div>
        </div>

        {/* El precio y de donde sale. Sin la cuenta a la vista nadie confia. */}
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg p-3" style={{ background: "var(--panel-2)" }}>
            {completo && precio !== null ? (
              <div className="mono flex items-baseline justify-between gap-2">
                <span className="text-xs sm:text-sm" style={{ color: "var(--txt-2)" }}>
                  {regla === "promedio"
                    ? `(${fmtC(a!.precio)} + ${fmtC(b!.precio)}) ÷ 2`
                    : "se cobra la más cara de las dos"}
                </span>
                <b className="text-lg" style={{ color: "var(--acc)" }}>{fmtC(precio)}</b>
              </div>
            ) : (
              <span className="text-sm" style={{ color: "var(--txt-2)" }}>
                Elige las dos mitades para ver el precio
              </span>
            )}
          </div>
          {completo && (
            <button className="btn btn-ghost !min-h-0 !px-3 !py-2.5 text-sm"
                    title="Intercambiar las mitades" onClick={intercambiar}>
              ⇅
            </button>
          )}
        </div>

        <input className="input" placeholder="Buscar pizza…" value={filtro}
               onChange={(e) => setFiltro(e.target.value)} />

        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          {grupos.length === 0 && (
            <p className="py-6 text-center text-sm" style={{ color: "var(--txt-2)" }}>
              Ninguna pizza coincide con “{filtro}”.
            </p>
          )}
          {grupos.map(([categoria, lista]) => (
            <div key={categoria} className="mb-3">
              <h3 className="sticky top-0 z-10 py-1 text-[11px] font-bold uppercase
                             tracking-wide"
                  style={{ color: "var(--txt-2)", background: "var(--panel)" }}>
                {categoria}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {lista.map((p) => {
                  // Se marca en QUE mitad quedo, no solo que esta elegida.
                  const enA = a?.productoId === p.id;
                  const enB = b?.productoId === p.id;
                  const color = enA ? COLOR.a : enB ? COLOR.b : null;
                  const tinta = enA ? TINTA.a : enB ? TINTA.b : "var(--txt)";
                  return (
                    <button key={p.id} onClick={() => elegir(p)}
                            className="rounded-lg p-2 text-left transition active:scale-[0.97]"
                            style={{
                              background: color ?? "var(--panel-2)",
                              color: tinta,
                              border: `1px solid ${color ?? "var(--borde)"}`,
                            }}>
                      <div className="text-sm font-semibold leading-tight">{p.nombre}</div>
                      <div className="mono text-xs"
                           style={{ color: color ? tinta : "var(--txt-2)" }}>
                        {fmtC(p.precio)}
                        {enA && " · 1ª mitad"}
                        {enB && " · 2ª mitad"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <button className="btn btn-acc w-full" disabled={!completo}
                onClick={() => a && b && precio !== null && onConfirmar(a, b, precio)}>
          {completo
            ? `${inicial ? "Guardar cambio" : "Agregar al pedido"} · ${fmtC(precio!)}`
            : lado === "a" ? "Elige la primera mitad" : "Elige la segunda mitad"}
        </button>
      </div>
    </div>
  );
}
