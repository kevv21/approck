"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { salir, useSesion } from "@/lib/auth/sesion";
import { ROLES } from "@/lib/auth/permisos";
import { useAtras } from "@/lib/nativo/atras";
import { Ojo, Sombrero } from "@/components/Iconos";

/**
 * QUIÉN ESTÁ TRABAJANDO, EN EL ENCABEZADO
 *
 * Antes era una barra propia de 40px debajo del encabezado («Trabajando: Ana
 * · Maestra · Salir»), que en un teléfono le quitaba dos filas al menú todo
 * el turno. Ahora es la inicial, con la marca de la cuenta: el sombrero de
 * copa del logo para la maestra y un ojo para revisión, que mira y no toca.
 *
 * Tocarla abre el nombre, la cuenta y «Salir». Salir queda a dos toques en
 * vez de uno, y está bien: se usa una vez por turno.
 */
export default function CuentaEncabezado() {
  const sesion = useSesion();
  const [abierto, setAbierto] = useState(false);
  const ruta = usePathname();

  useEffect(() => { setAbierto(false); }, [ruta]);
  useAtras(abierto, () => setAbierto(false));
  useEffect(() => {
    if (!abierto) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [abierto]);

  if (!sesion) return null;
  const rol = sesion.rol;
  const etiqueta = ROLES[rol].etiqueta;
  const inicial = sesion.nombre.trim().charAt(0).toUpperCase() || "?";
  const desde = new Date(sesion.desde);
  const hora = Number.isNaN(desde.getTime())
    ? null
    : desde.toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="relative shrink-0">
      <button type="button" className="avatar" aria-haspopup="menu" aria-expanded={abierto}
              aria-label={`${sesion.nombre}, cuenta ${etiqueta}`}
              onClick={() => setAbierto((v) => !v)}>
        <span className="avatar-letra" aria-hidden="true">{inicial}</span>
        <span className="avatar-insignia" data-rol={rol} aria-hidden="true">
          {rol === "maestra" ? <Sombrero size={13} /> : <Ojo size={12} />}
        </span>
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setAbierto(false)} />
          <div role="menu" aria-label="Cuenta"
               className="surgir absolute right-0 z-50 w-64 rounded-2xl p-3"
               style={{ top: "calc(100% + 8px)", background: "var(--panel-3)",
                        border: "1px solid var(--borde-2)", boxShadow: "var(--sombra)" }}>
            <div className="truncate text-base font-bold">{sesion.nombre}</div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="insignia-cuenta" data-rol={rol}>
                {rol === "maestra" ? <Sombrero size={16} /> : <Ojo size={16} />}
                {etiqueta}
              </span>
              {hora && <span className="text-xs" style={{ color: "var(--txt-3)" }}>desde las {hora}</span>}
            </div>
            <p className="mt-2 text-xs leading-snug" style={{ color: "var(--txt-2)" }}>
              {ROLES[rol].detalle}.
            </p>
            <button type="button" role="menuitem" className="btn btn-ghost mt-3 w-full"
                    onClick={() => { setAbierto(false); salir(); }}>
              Salir
            </button>
          </div>
        </>
      )}
    </div>
  );
}
