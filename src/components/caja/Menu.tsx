"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtC } from "@/lib/money";
import type { LineaOrden, Producto } from "@/lib/types";
import { Buscar } from "@/components/Iconos";

/**
 * EL MENÚ, EN UNA SOLA TIRA QUE SE DESPLAZA
 *
 * Antes era una categoría a la vez: había que tocar «Pizzas clásicas», mirar,
 * tocar «Bebidas», mirar. Para un pedido de pizza + gaseosa, dos saltos y
 * volver a buscar dónde se estaba.
 *
 * Ahora todo el menú es una lista continua, como en las apps de delivery: se
 * baja con el pulgar y la fila de categorías de arriba sigue sola, marcando
 * dónde se está. Tocar una categoría salta a ella. Y hay buscador, que el
 * spec pedía desde el principio: «hawa» encuentra la Hawaiana y las dos
 * promos que la llevan.
 */
export default function Menu({
  menu, categorias, lineas, onAgregar, onMitades, hayPizzas,
}: {
  menu: Producto[];
  categorias: string[];
  lineas: LineaOrden[];
  onAgregar: (p: Producto) => void;
  onMitades: () => void;
  hayPizzas: boolean;
}) {
  const [activa, setActiva] = useState(categorias[0] ?? "");
  const [buscando, setBuscando] = useState(false);
  const [q, setQ] = useState("");
  const fila = useRef<HTMLDivElement>(null);
  const secciones = useRef(new Map<string, HTMLElement>());
  /** Mientras el salto animado está en curso, el seguimiento no pelea con él. */
  const saltando = useRef<ReturnType<typeof setTimeout> | null>(null);

  const porCategoria = useMemo(() => {
    const m = new Map<string, Producto[]>();
    for (const c of categorias) m.set(c, []);
    for (const p of menu) m.get(p.categoria)?.push(p);
    return m;
  }, [menu, categorias]);

  /** La primera categoría de pizzas es donde va «Mitad y mitad». */
  const primeraDePizzas = useMemo(
    () => categorias.find((c) => porCategoria.get(c)?.some((p) => p.grupo_descuento === "pizza")),
    [categorias, porCategoria]
  );

  const cuantos = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lineas) m.set(l.productoId, (m.get(l.productoId) ?? 0) + l.cantidad);
    return m;
  }, [lineas]);

  const resultados = useMemo(() => {
    const t = normalizar(q.trim());
    if (!t) return null;
    return menu.filter((p) =>
      categorias.includes(p.categoria) &&
      normalizar(`${p.nombre} ${p.descripcion ?? ""} ${p.categoria}`).includes(t));
  }, [q, menu, categorias]);

  // Alto de lo que queda pegado arriba: el encabezado de la app y esta fila.
  const desfase = useCallback(() => {
    const header = document.querySelector("header")?.getBoundingClientRect().height ?? 52;
    return header + (fila.current?.parentElement?.getBoundingClientRect().height ?? 56);
  }, []);

  // La categoría activa sigue al desplazamiento.
  useEffect(() => {
    if (resultados) return;
    let cuadro = 0;
    const medir = () => {
      cuadro = 0;
      if (saltando.current) return;
      const limite = desfase() + 12;
      let actual = categorias[0];
      for (const c of categorias) {
        const el = secciones.current.get(c);
        if (el && el.getBoundingClientRect().top <= limite) actual = c;
      }
      setActiva((a) => (a === actual ? a : actual));
    };
    const alDesplazar = () => { if (!cuadro) cuadro = requestAnimationFrame(medir); };
    window.addEventListener("scroll", alDesplazar, { passive: true });
    medir();
    return () => { window.removeEventListener("scroll", alDesplazar); cancelAnimationFrame(cuadro); };
  }, [categorias, desfase, resultados]);

  // La pastilla activa se centra sola en la fila, para que se vea siempre.
  useEffect(() => {
    const cont = fila.current;
    const chip = cont?.querySelector<HTMLElement>(`[data-cat="${CSS.escape(activa)}"]`);
    if (!cont || !chip) return;
    cont.scrollTo({ left: chip.offsetLeft - cont.clientWidth / 2 + chip.clientWidth / 2,
                    behavior: "smooth" });
  }, [activa]);

  const irA = (c: string) => {
    const el = secciones.current.get(c);
    if (!el) return;
    setActiva(c);
    if (saltando.current) clearTimeout(saltando.current);
    saltando.current = setTimeout(() => { saltando.current = null; }, 700);
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - desfase() + 1,
                      behavior: "smooth" });
  };

  const cerrarBusqueda = () => { setQ(""); setBuscando(false); };

  return (
    <div className="min-w-0">
      {/* Fila pegada arriba: categorías o buscador. */}
      <div className="sticky z-20 -mx-3 mb-2 px-3 py-2 lg:mx-0 lg:rounded-2xl lg:px-2"
           style={{ top: "calc(var(--header-alto) + var(--sa-top))",
                    background: "var(--bg)" }}>
        {buscando ? (
          <div className="flex items-center gap-2">
            <input className="input !min-h-11 flex-1" autoFocus type="search" enterKeyHint="search"
                   placeholder="Buscar en el menú" value={q} aria-label="Buscar en el menú"
                   onChange={(e) => setQ(e.target.value)} />
            <button className="btn btn-ghost btn-chico" onClick={cerrarBusqueda}>Cerrar</button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                    style={{ background: "var(--panel-2)", border: "1px solid var(--borde)" }}
                    aria-label="Buscar en el menú" onClick={() => setBuscando(true)}>
              <Buscar size={20} />
            </button>
            <div ref={fila} className="desliza flex min-w-0 flex-1 gap-1.5 pr-6">
              {categorias.map((c) => (
                <button key={c} data-cat={c} onClick={() => irA(c)}
                        aria-current={activa === c ? "true" : undefined}
                        className={`chip shrink-0 ${activa === c ? "chip-on" : ""}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {resultados ? (
        resultados.length === 0 ? (
          <p className="py-10 text-center text-sm" style={{ color: "var(--txt-2)" }}>
            Nada con «{q}». Prueba con otra palabra.
          </p>
        ) : (
          <Rejilla>
            {resultados.map((p) => (
              <Tarjeta key={p.id} p={p} yaVan={cuantos.get(p.id) ?? 0}
                       onAgregar={onAgregar} conCategoria />
            ))}
          </Rejilla>
        )
      ) : (
        <div className="space-y-5 pb-4">
          {categorias.map((c) => (
            <section key={c} aria-label={c}
                     ref={(el) => { if (el) secciones.current.set(c, el); else secciones.current.delete(c); }}>
              <h2 className="display mb-3 text-[22px] leading-6" style={{ color: "var(--txt-2)" }}>{c}</h2>
              <Rejilla>
                {hayPizzas && c === primeraDePizzas && (
                  <button onClick={onMitades} className="tarjeta"
                          style={{ background: "var(--panel)", border: "1.5px dashed var(--acc)" }}>
                    <svg viewBox="0 0 100 100" className="h-7 w-7" aria-hidden="true">
                      <path d="M50 4 A46 46 0 0 0 50 96 Z" fill="var(--acc)" />
                      <path d="M50 4 A46 46 0 0 1 50 96 Z" fill="var(--mitad-b)" />
                    </svg>
                    <span className="mt-2 text-[15px] font-bold leading-5" style={{ color: "var(--acc)" }}>
                      Mitad y mitad
                    </span>
                    <span className="mt-0.5 text-[13px] leading-[17px]" style={{ color: "var(--txt-2)" }}>
                      Elige dos pizzas
                    </span>
                  </button>
                )}
                {(porCategoria.get(c) ?? []).map((p) => (
                  <Tarjeta key={p.id} p={p} yaVan={cuantos.get(p.id) ?? 0} onAgregar={onAgregar} />
                ))}
              </Rejilla>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Rejilla({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">{children}</div>;
}

function Tarjeta({
  p, yaVan, onAgregar, conCategoria,
}: {
  p: Producto;
  yaVan: number;
  onAgregar: (p: Producto) => void;
  conCategoria?: boolean;
}) {
  return (
    <button onClick={() => onAgregar(p)} className="tarjeta"
            data-en-pedido={yaVan > 0 ? "" : undefined}>
      {conCategoria && (
        <span className="rotulo mb-0.5">{p.categoria}</span>
      )}
      <span className="pr-5 text-[15px] font-bold leading-5">{p.nombre}</span>
      {p.descripcion && (
        <span className="mt-1 line-clamp-2 text-[13px] leading-[17px]" style={{ color: "var(--txt-2)" }}>
          {p.descripcion}
        </span>
      )}
      <span className="mono mt-auto pt-2 text-[15px] font-bold" style={{ color: "var(--acc)" }}>
        {fmtC(p.precio)}
      </span>
      {/* Cuántas van ya, sin abrir el pedido: con prisa se tocaba de más.
          Va al final para que el lector de pantalla diga primero QUÉ es y
          después cuántas van; se dibuja arriba igual (posición absoluta).
          `key` hace que el sticker se vuelva a pegar cada vez que cambia. */}
      {yaVan > 0 && (
        <span key={yaVan} className="sticker pegar" aria-label={`, ${yaVan} en el pedido`}>
          {yaVan}
        </span>
      )}
    </button>
  );
}

/** Sin tildes ni mayúsculas: «pina» encuentra «Piña». */
const normalizar = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
