"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";

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

export type TonoAviso = "agregado" | "cambiado" | "quitado" | "error";

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

const COLOR: Record<TonoAviso, string> = {
  agregado: "var(--ok)",
  cambiado: "var(--acc-2)",
  quitado:  "var(--txt-2)",
  error:    "var(--mal)",
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
          // Por encima de lo que haya abajo. La hoja del pedido sube este
          // valor mientras está abierta, porque su pie —total y cobrar— es
          // justo lo que no se puede tapar con un aviso.
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + var(--aviso-abajo, 84px))" }}
        >
          <div className="pointer-events-auto flex w-full max-w-md items-center gap-3
                          rounded-xl px-3.5 py-3"
               style={{ background: "var(--panel-3)",
                        border: "1px solid var(--borde-2)",
                        boxShadow: "var(--sombra)" }}>
            <span aria-hidden="true" className="h-8 w-1 shrink-0 rounded-full"
                  style={{ background: COLOR[aviso.tono] }} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-sm font-semibold">{aviso.texto}</div>
              {aviso.detalle && (
                <div className="truncate text-xs" style={{ color: "var(--txt-2)" }}>
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
