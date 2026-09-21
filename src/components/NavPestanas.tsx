"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Pestañas de la barra superior.
 *
 * Marcan en cuál estás. Sin eso, con seis pestañas del mismo color, hay que
 * mirar el contenido de la pantalla para saber dónde estás parado — y en un
 * teléfono, con la app instalada y sin barra de direcciones, ni eso.
 *
 * Además scrollea en horizontal: seis pestañas no entran en 360px de ancho.
 */
export default function NavPestanas({
  items,
}: { items: { href: string; label: string }[] }) {
  const ruta = usePathname();
  return (
    <nav className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1"
         style={{ scrollbarWidth: "none" }}>
      {items.map((n) => {
        const activa = n.href === "/" ? ruta === "/" : ruta.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href}
                aria-current={activa ? "page" : undefined}
                className="flex shrink-0 items-center rounded-lg px-3 text-sm font-medium transition"
                style={{
                  color: activa ? "#1a0d04" : "var(--txt-2)",
                  background: activa ? "var(--acc)" : "transparent",
                  minHeight: "40px",
                }}>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
