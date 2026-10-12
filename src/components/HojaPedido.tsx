"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAtras } from "@/lib/nativo/atras";

/** Cuánto hay que bajarla con el dedo para que se cierre. */
const UMBRAL_PX = 120;

/**
 * El pedido como hoja que sube desde abajo, en teléfono.
 *
 * Se llega a él con el pulgar, sin desplazarse por todo el menú, y se cierra
 * con la misma facilidad para seguir agregando: tocando afuera, con «Seguir
 * agregando», con atrás, o bajándola con el dedo desde la manija. Sube en
 * 280 ms y baja en 200: al cerrar, la persona ya está mirando el menú.
 *
 * En PC no se usa: ahí el pedido vive en su columna y esto no se monta.
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
  const [saliendo, setSaliendo] = useState(false);
  const [arrastre, setArrastre] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const desde = useRef<number | null>(null);
  // El padre pasa una función nueva en cada render; si el efecto dependiera
  // de ella, cada redibujo de la caja reiniciaría el reloj de la bajada.
  const alCerrar = useRef(onCerrar);
  alCerrar.current = onCerrar;

  /** Cerrar con la animación de bajada; el padre se entera al terminar. */
  const cerrar = useCallback(() => setSaliendo(true), []);

  useEffect(() => {
    if (!saliendo) return;
    const corto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => { setSaliendo(false); setArrastre(0); alCerrar.current(); }, corto ? 120 : 200);
    return () => clearTimeout(t);
  }, [saliendo]);

  // Si el padre la cierra por su cuenta (al cobrar), la próxima abre limpia.
  useEffect(() => { if (!abierta) { setSaliendo(false); setArrastre(0); } }, [abierta]);

  useAtras(abierta && !saliendo, cerrar);

  useEffect(() => {
    if (!abierta) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
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
  }, [abierta, cerrar]);

  if (!abierta) return null;

  // Arrastre desde la manija y el título; no desde la lista, que se desplaza,
  // ni desde un botón, que tiene que seguir funcionando con un toque.
  const alApoyar = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    desde.current = e.clientY;
    setArrastrando(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const alMover = (e: React.PointerEvent) => {
    if (desde.current == null) return;
    setArrastre(Math.max(0, e.clientY - desde.current));
  };
  const alSoltar = () => {
    if (desde.current == null) return;
    desde.current = null;
    setArrastrando(false);
    if (arrastre > UMBRAL_PX) cerrar();
    else setArrastre(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden"
         role="dialog" aria-modal="true" aria-label={titulo}>
      {/* El velo es una capa aparte: si fuera el contenedor, al aclararlo
          mientras se arrastra se aclararía también la hoja. */}
      <div aria-hidden="true" onClick={cerrar}
           className={`absolute inset-0 ${saliendo ? "velo-sale" : "velo-entra"}`}
           style={{ background: "var(--velo)", opacity: Math.max(0.35, 1 - arrastre / 500) }} />
      <div className={`relative flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl ${saliendo ? "bajar" : "subir"}`}
           style={{ background: "var(--bg)", borderTop: "1px solid var(--borde-2)",
                    boxShadow: "var(--sombra-alta)",
                    transform: arrastre ? `translateY(${arrastre}px)` : undefined,
                    transition: arrastrando ? "none" : "transform 280ms var(--curva-hoja)",
                    ["--arrastre" as string]: `${arrastre}px` }}>
        <div className="relative flex shrink-0 cursor-grab items-center gap-3 px-4 pb-2 pt-5"
             style={{ touchAction: "none" }}
             onPointerDown={alApoyar} onPointerMove={alMover}
             onPointerUp={alSoltar} onPointerCancel={alSoltar}>
          <span aria-hidden="true" className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full"
                style={{ background: "var(--borde-2)" }} />
          <h2 className="display flex-1 truncate text-[34px] leading-9">{titulo}</h2>
          {/* «Seguir agregando» y no «Cerrar»: cerrar suena a descartar el
              pedido, y lo que se hace es volver al menú con todo intacto. */}
          <button className="btn btn-ghost btn-chico" onClick={cerrar}>
            Seguir agregando
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">{children}</div>
        {pie && (
          <div className="shrink-0 px-3 pb-3 pt-2"
               style={{ borderTop: "1px solid var(--borde)",
                        paddingBottom: "calc(var(--sa-bottom) + 12px)" }}>
            {pie}
          </div>
        )}
      </div>
    </div>
  );
}
