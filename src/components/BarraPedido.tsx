"use client";

import { useEffect, useRef, useState } from "react";
import { fmtC } from "@/lib/money";

/**
 * BARRA DEL PEDIDO (solo teléfono)
 *
 * En un Android, el menú ocupa la pantalla entera y el pedido quedaba debajo,
 * fuera de la vista. Esta barra vive abajo, justo encima de la navegación, y
 * siempre dice cuántas cosas van y cuánto suman; tocarla abre el pedido.
 *
 * El contador late cuando cambia. Es el acuse de recibo más barato que hay, y
 * el que se ve sin apartar la vista del menú.
 *
 * En PC no aparece: ahí el pedido ya está en la columna de al lado.
 */
export default function BarraPedido({
  items, total, onAbrir, editando,
}: {
  items: number;
  total: number;
  onAbrir: () => void;
  /** «Orden #12»: se está corrigiendo una orden guardada, no armando una. */
  editando?: string | null;
}) {
  const [latiendo, setLatiendo] = useState(false);
  const previo = useRef(items);
  const visible = items > 0 || Boolean(editando);

  useEffect(() => {
    if (items !== previo.current && items > 0) {
      setLatiendo(true);
      const t = setTimeout(() => setLatiendo(false), 300);
      previo.current = items;
      return () => clearTimeout(t);
    }
    previo.current = items;
  }, [items]);

  // Los avisos se acomodan encima de esta barra mientras se ve.
  useEffect(() => {
    if (!visible) return;
    const raiz = document.documentElement;
    raiz.style.setProperty("--barra-alto", "72px");
    return () => { raiz.style.removeProperty("--barra-alto"); };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 z-30 px-3 pb-2 pt-3 lg:hidden"
         style={{ bottom: "calc(var(--nav-alto) + env(safe-area-inset-bottom, 0px))",
                  background: "linear-gradient(to top, var(--bg) 55%, transparent)" }}>
      <button onClick={onAbrir}
              className="btn btn-acc w-full !justify-between !px-3"
              style={{ minHeight: "56px", boxShadow: "var(--sombra-alta)" }}>
        <span className="flex min-w-0 items-center gap-2.5">
          <span className={`mono grid h-8 min-w-8 place-items-center rounded-full px-2 text-sm font-bold ${latiendo ? "latido" : ""}`}
                style={{ background: "var(--sobre-acc)", color: "var(--acc)" }}>
            {items}
          </span>
          <span className="truncate text-sm font-bold">
            {editando ? `Editando ${editando}` : "Ver pedido"}
          </span>
        </span>
        <span className="mono text-lg font-bold">{fmtC(total)}</span>
      </button>
    </div>
  );
}
