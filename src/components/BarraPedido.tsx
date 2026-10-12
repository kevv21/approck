"use client";

import { useEffect } from "react";
import { fmtC } from "@/lib/money";

/**
 * BARRA DEL PEDIDO (solo teléfono)
 *
 * En un Android, el menú ocupa la pantalla entera y el pedido quedaba debajo,
 * fuera de la vista. Esta barra vive abajo, justo encima de la navegación, y
 * siempre dice cuántas cosas van y cuánto suman; tocarla abre el pedido.
 *
 * El contador es el sticker del logo y se vuelve a pegar cada vez que cambia:
 * el acuse de recibo más barato que hay, y el que se ve sin apartar la vista
 * del menú.
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
  const visible = items > 0 || Boolean(editando);

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
         style={{ bottom: "calc(var(--nav-alto) + var(--sa-bottom))",
                  background: "linear-gradient(to top, var(--bg) 55%, transparent)" }}>
      <button onClick={onAbrir}
              className="btn btn-acc w-full !justify-between !rounded-2xl !pl-2.5 !pr-[18px]"
              style={{ minHeight: "56px", boxShadow: "0 6px 18px rgb(0 0 0 / .45)" }}>
        <span className="flex min-w-0 items-center gap-3">
          <span key={items} className="sticker sticker-oscuro pegar" aria-label={`${items} en el pedido`}>
            {items}
          </span>
          <span className="truncate text-base font-bold">
            {editando ? `Editando ${editando}` : "Ver pedido"}
          </span>
        </span>
        <span className="mono text-[19px] font-bold">{fmtC(total)}</span>
      </button>
    </div>
  );
}
