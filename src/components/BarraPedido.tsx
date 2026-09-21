"use client";

import { useEffect, useRef, useState } from "react";
import { fmtC } from "@/lib/money";

/**
 * BARRA DEL PEDIDO (solo teléfono)
 *
 * En un Android, el menú ocupa la pantalla entera y el pedido quedaba debajo,
 * fuera de la vista. Se tocaba un producto y no pasaba nada visible: había que
 * desplazarse para comprobar. Esta barra vive abajo del todo y siempre dice
 * cuántas cosas van y cuánto suman; tocarla abre el pedido como hoja.
 *
 * El contador late cuando cambia. Es el acuse de recibo más barato que hay, y
 * el que se ve sin apartar la vista del menú.
 *
 * En PC no aparece: ahí el pedido ya está en la columna de al lado.
 */
export default function BarraPedido({
  items, total, onAbrir,
}: { items: number; total: number; onAbrir: () => void }) {
  const [latiendo, setLatiendo] = useState(false);
  const previo = useRef(items);

  useEffect(() => {
    if (items !== previo.current && items > 0) {
      setLatiendo(true);
      const t = setTimeout(() => setLatiendo(false), 300);
      previo.current = items;
      return () => clearTimeout(t);
    }
    previo.current = items;
  }, [items]);

  if (items === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-3 lg:hidden"
         style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
                  background: "linear-gradient(to top, var(--bg) 60%, transparent)" }}>
      <button
        onClick={onAbrir}
        className="btn btn-acc w-full !justify-between !px-4"
        style={{ minHeight: "56px", boxShadow: "var(--sombra-alta)" }}
      >
        <span className="flex items-center gap-2.5">
          <span className={`flex h-7 min-w-7 items-center justify-center rounded-full
                            px-2 text-sm font-black ${latiendo ? "latido" : ""}`}
                style={{ background: "var(--sobre-acc)", color: "var(--acc)" }}>
            {items}
          </span>
          <span className="text-sm font-semibold">
            {items === 1 ? "1 ítem" : `${items} ítems`}
          </span>
        </span>
        <span className="mono text-lg font-black">{fmtC(total)}</span>
      </button>
    </div>
  );
}
