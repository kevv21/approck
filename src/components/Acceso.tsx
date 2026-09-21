"use client";

import { useEffect, useState } from "react";
import {
  entrar, nombresRecordados, salir, sesionActual, type Sesion,
} from "@/lib/auth/sesion";
import { registrar } from "@/lib/auth/auditoria";
import { hayConfig } from "@/lib/supabase";
import { usePathname } from "next/navigation";

/**
 * Puerta de entrada. Un PIN compartido y el nombre de quien trabaja.
 *
 * El nombre no es decorativo: va en la bitácora de cada anulación y cada
 * descuento, y sale impreso en el recibo. Es lo que sirve cuando al final
 * de la noche falta plata en la caja.
 */
export default function Acceso({ children }: { children: React.ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null | undefined>(undefined);
  const [nombre, setNombre] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const [previos, setPrevios] = useState<string[]>([]);
  const ruta = usePathname();

  useEffect(() => {
    setSesion(sesionActual());
    setPrevios(nombresRecordados());
  }, []);

  // Mientras se lee sessionStorage no se dibuja nada, para no mostrar la
  // pantalla de acceso un instante a quien ya entró.
  if (sesion === undefined) return null;
  // Dos rutas quedan libres, las dos por la misma razón: se usan JUSTO
  // cuando el PIN no se puede verificar.
  //   /prueba        diagnóstico de impresora, antes de tener nada montado.
  //   /configuracion el PIN vive en `settings.pin_hash`. Si esa tabla no
  //                  existe todavía, entrar es imposible — y la pantalla que
  //                  explica por qué quedaría del otro lado de la puerta.
  const LIBRES = ["/prueba", "/configuracion"];
  if (!hayConfig || LIBRES.includes(ruta)) return <>{children}</>;

  if (sesion) {
    return (
      <>
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs"
             style={{ background: "var(--panel-2)", color: "var(--txt-2)" }}>
          <span>Trabajando: <b style={{ color: "var(--txt)" }}>{sesion.nombre}</b></span>
          <button className="ml-auto underline"
                  onClick={() => { salir(); setSesion(null); }}>Salir</button>
        </div>
        {children}
      </>
    );
  }

  const acceder = async () => {
    if (!nombre.trim()) return;
    setEntrando(true);
    setError(null);
    try {
      const s = await entrar(nombre, pin);
      if (!s) {
        setError("PIN incorrecto.");
        await registrar({ accion: "login_fallido", detalle: { nombre } });
        setPin("");
        return;
      }
      setSesion(s);
    } catch (e) {
      setError(`No se pudo verificar: ${(e as Error).message}`);
    } finally {
      setEntrando(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm p-6">
      <div className="panel space-y-3 p-5">
        <div className="text-center">
          <h1 className="text-xl font-black" style={{ color: "var(--acc)" }}>
            ROCK MUNCHIES
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--txt-2)" }}>
            Poné tu nombre y el PIN del local
          </p>
        </div>

        <input className="input" placeholder="Tu nombre" value={nombre}
               autoComplete="off"
               onChange={(e) => setNombre(e.target.value)} />

        {previos.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {previos.map((n) => (
              <button key={n} className={`chip ${nombre === n ? "chip-on" : ""}`}
                      onClick={() => setNombre(n)}>{n}</button>
            ))}
          </div>
        )}

        <input className="input text-center tracking-[0.5em]" placeholder="PIN"
               type="password" inputMode="numeric" value={pin}
               onChange={(e) => setPin(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") acceder(); }} />

        <button className="btn btn-acc w-full" disabled={!nombre.trim() || entrando}
                onClick={acceder}>
          {entrando ? "Entrando…" : "Entrar"}
        </button>

        {error && (
          <p className="text-center text-sm" style={{ color: "var(--mal)" }}>{error}</p>
        )}
      </div>
    </div>
  );
}
