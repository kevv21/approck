"use client";

import { useEffect } from "react";

/**
 * El pedido como hoja que sube desde abajo, en teléfono.
 *
 * Se llega a él con el pulgar, sin desplazarse por todo el menú, y se cierra
 * con la misma facilidad para seguir agregando. En PC no se usa: ahí el
 * pedido vive en su columna y esto no se monta.
 */
export default function HojaPedido({
  abierta, onCerrar, pie, titulo = "Pedido", children,
}: {
  abierta: boolean;
  titulo?: string;
  onCerrar: () => void;
  /** Total y cobrar. Clavados abajo: con tres ítems ya se salían de la
   *  pantalla, y son lo que se busca al abrir esto. */
  pie?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!abierta) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", h);
    // Sin esto, el menú de atrás se desplaza bajo el dedo mientras se intenta
    // recorrer el pedido.
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // El pie de la hoja mide unos 130px. Sin esto, el aviso caía justo encima
    // del TOTAL, que es lo único que no se puede tapar.
    document.documentElement.style.setProperty("--aviso-abajo", "148px");
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = antes;
      document.documentElement.style.removeProperty("--aviso-abajo");
    };
  }, [abierta, onCerrar]);

  if (!abierta) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden"
         role="dialog" aria-modal="true" aria-label={titulo}
         style={{ background: "var(--velo)" }}
         onClick={onCerrar}>
      <div className="subir flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl"
           style={{ background: "var(--bg)", borderTop: "1px solid var(--borde-2)",
                    boxShadow: "var(--sombra-alta)" }}
           onClick={(e) => e.stopPropagation()}>
        <div className="relative flex shrink-0 items-center gap-3 px-4 pb-2 pt-4">
          <span aria-hidden="true" className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full"
                style={{ background: "var(--borde-2)" }} />
          <h2 className="display flex-1 text-2xl">{titulo}</h2>
          {/* «Seguir agregando» y no «Cerrar»: cerrar suena a descartar el
              pedido, y lo que se hace es volver al menú con todo intacto. */}
          <button className="btn btn-ghost btn-chico" onClick={onCerrar}>
            Seguir agregando
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">{children}</div>
        {pie && (
          <div className="shrink-0 px-3 pb-3 pt-2"
               style={{ borderTop: "1px solid var(--borde)",
                        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
            {pie}
          </div>
        )}
      </div>
    </div>
  );
}
