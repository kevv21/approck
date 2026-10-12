"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import { vibrar } from "@/lib/nativo/rockzza";
import { Alerta, Check, Lapiz, Menos } from "@/components/Iconos";

/**
 * AVISOS DE LO QUE ACABA DE PASAR
 *
 * El problema: en un teléfono, tocar un producto no mostraba nada. La línea
 * aparecía en el pedido, dos pantallas más abajo, fuera de la vista. Con
 * prisa, el mesero tocaba dos veces "por si acaso" y salían dos pizzas.
 *
 * Reglas:
 *  - El aviso usa EL MISMO VERBO que la acción. Se toca «Agregar» y dice
 *    «Agregado». No «Producto añadido con éxito».
 *  - Lo que se puede perder trae DESHACER. Quitar una línea de diez cargadas
 *    a mano sin red es la forma más fácil de arruinar un pedido.
 *  - Uno a la vez. Una pila de avisos tapa media pantalla justo cuando hace
 *    falta ver el menú.
 */

/** «atencion»: salió bien pero hay algo que mirar (la PC de caja no responde). */
export type TonoAviso = "agregado" | "cambiado" | "atencion" | "quitado" | "error";

interface Aviso {
  id: number;
  texto: string;
  detalle?: string;
  tono: TonoAviso;
  deshacer?: () => void;
  /** Un botón propio, cuando la acción no es deshacer sino seguir. */
  accion?: { texto: string; hacer: () => void };
}

interface Api {
  avisar: (a: Omit<Aviso, "id">) => void;
}

const Ctx = createContext<Api>({ avisar: () => {} });

/** `const { avisar } = useAvisos()` */
export const useAvisos = () => useContext(Ctx);

const DURACION = 3200;
/** Con deshacer se da más tiempo: hay que leerlo y decidir. */
const DURACION_DESHACER = 5500;

/**
 * Lo que se siente en la mano con cada aviso. Corto para lo que salió bien
 * (se nota sin mirar que la pizza entró), más largo para un error, que es lo
 * que no se puede pasar por alto con el teléfono en la otra mano.
 */
const VIBRACION: Record<TonoAviso, number> = { agregado: 10, cambiado: 10, atencion: 20, quitado: 14, error: 40 };

/**
 * Cada tono con su ícono, no solo su color: un vistazo de reojo distingue la
 * palomita del signo de alerta aunque la luz del local no deje ver el verde.
 */
const TONO: Record<TonoAviso, { fondo: string; tinta: string; icono: React.ReactNode }> = {
  agregado: { fondo: "var(--ok)",      tinta: "var(--sobre-ok)",  icono: <Check size={18} /> },
  cambiado: { fondo: "var(--acc-2)",   tinta: "var(--sobre-acc)", icono: <Lapiz size={16} /> },
  atencion: { fondo: "var(--acc)",     tinta: "var(--sobre-acc)", icono: <Alerta size={18} /> },
  quitado:  { fondo: "var(--panel-2)", tinta: "var(--txt-2)",     icono: <Menos size={18} /> },
  error:    { fondo: "var(--mal)",     tinta: "var(--sobre-mal)", icono: <Alerta size={18} /> },
};

export default function ProveedorAvisos({ children }: { children: React.ReactNode }) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const siguiente = useRef(0);

  const cerrar = useCallback(() => {
    if (reloj.current) clearTimeout(reloj.current);
    setAviso(null);
  }, []);

  const avisar = useCallback((a: Omit<Aviso, "id">) => {
    vibrar(VIBRACION[a.tono]);
    if (reloj.current) clearTimeout(reloj.current);
    setAviso({ ...a, id: ++siguiente.current });
    reloj.current = setTimeout(
      () => setAviso(null),
      a.deshacer || a.accion ? DURACION_DESHACER : DURACION
    );
  }, []);

  useEffect(() => () => { if (reloj.current) clearTimeout(reloj.current); }, []);

  return (
    <Ctx.Provider value={{ avisar }}>
      {children}
      {aviso && (
        <div
          // `status` y no `alert`: esto acompaña, no interrumpe. Un lector de
          // pantalla lo lee al terminar lo que estaba diciendo.
          role="status"
          aria-live="polite"
          key={aviso.id}
          className="surgir pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-3"
          // Encima de la barra de navegación y, en la caja, de la barra del
          // pedido. La hoja del pedido fija su propio --aviso-abajo, porque
          // su pie —total y cobrar— es lo que no se puede tapar.
          style={{ bottom: "calc(var(--sa-bottom) + var(--aviso-abajo, calc(var(--nav-alto) + var(--barra-alto, 0px) + 12px)))" }}
        >
          <div className="pointer-events-auto flex w-full max-w-md items-center gap-3
                          rounded-2xl py-2.5 pl-3 pr-3.5"
               style={{ background: "var(--panel-3)",
                        border: "1px solid var(--borde-2)",
                        boxShadow: "0 6px 20px rgb(0 0 0 / .5)" }}>
            <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                  style={{ background: TONO[aviso.tono].fondo, color: TONO[aviso.tono].tinta }}>
              {TONO[aviso.tono].icono}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold leading-5">{aviso.texto}</div>
              {aviso.detalle && (
                <div className="line-clamp-2 text-[13px] leading-[17px]" style={{ color: "var(--txt-2)" }}>
                  {aviso.detalle}
                </div>
              )}
            </div>
            {(aviso.deshacer || aviso.accion) && (
              <button
                className="shrink-0 rounded-lg px-3 text-sm font-bold"
                style={{ color: "var(--acc)", minHeight: "40px" }}
                onClick={() => {
                  if (aviso.accion) aviso.accion.hacer();
                  else aviso.deshacer?.();
                  cerrar();
                }}
              >
                {aviso.accion ? aviso.accion.texto : "Deshacer"}
              </button>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
