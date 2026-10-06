"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * NAVEGACIÓN
 *
 * Antes eran seis pestañas arriba, en una fila que se deslizaba de lado: en
 * un teléfono de 360px dos quedaban fuera de la pantalla, y las que se veían
 * estaban donde el pulgar no llega con una sola mano.
 *
 * Ahora, en teléfono, una barra abajo con lo que se usa todos los días —Caja,
 * Cierres, Inventario— y «Más» para lo que se abre de vez en cuando
 * (Estación, Probar la impresora, Estado). En PC, donde sobra ancho y se usa
 * con mouse, siguen arriba, todas a la vista.
 */

type Item = { href: string; label: string; icono: keyof typeof ICONOS; detalle?: string };

const PRINCIPALES: Item[] = [
  { href: "/", label: "Caja", icono: "caja" },
  { href: "/cierre", label: "Cierres", icono: "cierre" },
  { href: "/inventario", label: "Inventario", icono: "inventario" },
];

const OTRAS: Item[] = [
  { href: "/estacion", label: "Estación", icono: "estacion",
    detalle: "La PC que imprime los tickets" },
  { href: "/prueba", label: "Probar impresora", icono: "prueba",
    detalle: "Ticket de prueba, ancho y caracteres" },
  { href: "/configuracion", label: "Estado", icono: "estado",
    detalle: "Base de datos, conexión y caja abierta" },
];

const activa = (ruta: string, href: string) =>
  href === "/" ? ruta === "/" : ruta.startsWith(href);

/** Pestañas arriba. Solo en PC. */
export function PestanasArriba() {
  const ruta = usePathname();
  return (
    <nav className="hidden min-w-0 flex-1 gap-1 lg:flex" aria-label="Secciones">
      {[...PRINCIPALES, ...OTRAS].map((n) => {
        const on = activa(ruta, n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
                className="flex items-center gap-2 rounded-lg px-3 text-sm font-semibold transition"
                style={{
                  minHeight: "40px",
                  color: on ? "var(--txt)" : "var(--txt-2)",
                  background: on ? "var(--panel-3)" : "transparent",
                  boxShadow: on ? "inset 0 -2px 0 var(--acc)" : undefined,
                }}>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Barra de abajo. Solo en teléfono y tableta. */
export function NavAbajo() {
  const ruta = usePathname();
  const [mas, setMas] = useState(false);
  const enOtra = OTRAS.some((o) => activa(ruta, o.href));

  // Cambiar de pantalla cierra el menú.
  useEffect(() => { setMas(false); }, [ruta]);

  useEffect(() => {
    if (!mas) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setMas(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [mas]);

  return (
    <>
      <nav aria-label="Secciones"
           className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t lg:hidden"
           style={{ background: "var(--panel)", borderColor: "var(--borde)",
                    paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {PRINCIPALES.map((n) => (
          <Boton key={n.href} item={n} on={activa(ruta, n.href)} />
        ))}
        <button onClick={() => setMas((v) => !v)} aria-expanded={mas}
                className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold"
                style={{ height: "var(--nav-alto)",
                         color: mas || enOtra ? "var(--txt)" : "var(--txt-3)" }}>
          <Marca on={mas || enOtra}>{ICONOS.mas}</Marca>
          Más
        </button>
      </nav>

      {mas && (
        <div className="fixed inset-0 z-30 lg:hidden" onClick={() => setMas(false)}
             style={{ background: "var(--velo)" }}>
          <div role="menu" aria-label="Más secciones"
               className="subir absolute inset-x-0 rounded-t-2xl p-2"
               style={{ bottom: "calc(var(--nav-alto) + env(safe-area-inset-bottom, 0px))",
                        background: "var(--panel-3)", borderTop: "1px solid var(--borde-2)" }}
               onClick={(e) => e.stopPropagation()}>
            {OTRAS.map((n) => {
              const on = activa(ruta, n.href);
              return (
                <Link key={n.href} href={n.href} role="menuitem"
                      aria-current={on ? "page" : undefined}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                      style={{ background: on ? "var(--panel-2)" : undefined, minHeight: "56px" }}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                        style={{ background: "var(--panel)",
                                 color: on ? "var(--acc)" : "var(--txt-2)" }}>
                    {ICONOS[n.icono]}
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className="block font-semibold">{n.label}</span>
                    <span className="block text-xs" style={{ color: "var(--txt-3)" }}>
                      {n.detalle}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function Boton({ item, on }: { item: Item; on: boolean }) {
  return (
    <Link href={item.href} aria-current={on ? "page" : undefined}
          className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold"
          style={{ height: "var(--nav-alto)", color: on ? "var(--txt)" : "var(--txt-3)" }}>
      <Marca on={on}>{ICONOS[item.icono]}</Marca>
      {item.label}
    </Link>
  );
}

/** El icono de la pestaña activa va sobre una píldora amarilla, como Android. */
function Marca({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className="grid h-8 w-14 place-items-center rounded-full transition"
          style={{ background: on ? "var(--acc)" : "transparent",
                   color: on ? "var(--sobre-acc)" : "currentColor",
                   transitionDuration: "160ms" }}>
      {children}
    </span>
  );
}

const svg = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const ICONOS = {
  // Una pizza en porción: la caja es donde se venden.
  caja: svg(<><path d="M12 3 3.5 19.5a1 1 0 0 0 1 1.4C7 20.3 9.5 20 12 20s5 .3 7.5.9a1 1 0 0 0 1-1.4Z" /><circle cx="10" cy="14" r="1.2" /><circle cx="14" cy="11" r="1.2" /><circle cx="13.5" cy="16" r="1.2" /></>),
  cierre: svg(<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 8h6M9 12h6" /></>),
  inventario: svg(<><path d="M3 7l9-4 9 4-9 4Z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></>),
  mas: svg(<><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>),
  estacion: svg(<><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 17v4h10v-4" /></>),
  prueba: svg(<><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3" /></>),
  estado: svg(<><path d="M3 12h4l3-8 4 16 3-8h4" /></>),
} as const;
