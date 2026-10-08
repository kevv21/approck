"use client";

import { useEffect, useState } from "react";
import { entrar, nombresRecordados, salir, useSesion } from "@/lib/auth/sesion";
import { ROLES, inicioDe, puedeVer } from "@/lib/auth/permisos";
import {
  alCambiarVinculo, requiereCuenta, sesionGuardada,
} from "@/lib/auth/dispositivo";
import VincularDispositivo from "@/components/VincularDispositivo";
import { registrar } from "@/lib/auth/auditoria";
import { hayConfig } from "@/lib/supabase";
import { usePathname, useRouter } from "next/navigation";

/**
 * Puerta de entrada. El nombre de quien trabaja y el PIN de su cuenta:
 * maestra o revisión. El PIN decide qué cuenta se abre.
 *
 * El nombre no es decorativo: va en la bitácora de cada anulación y cada
 * descuento, y sale impreso en el recibo. Es lo que sirve cuando al final
 * de la noche falta plata en la caja.
 */
export default function Acceso({ children }: { children: React.ReactNode }) {
  const sesion = useSesion();
  // undefined = todavía no se sabe. true = se puede pasar al PIN, sea porque
  // la base no exige cuenta o porque este aparato ya está vinculado.
  const [puedePasar, setPuedePasar] = useState<boolean | undefined>(undefined);
  const [nombre, setNombre] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const [previos, setPrevios] = useState<string[]>([]);
  const ruta = usePathname();
  const router = useRouter();
  // Una pantalla que no es de esta cuenta (la Caja, para revisión) lleva a la
  // suya en vez de mostrarse a medias.
  const fuera = sesion != null && !puedeVer(sesion.rol, ruta);

  useEffect(() => {
    if (fuera && sesion) router.replace(inicioDe(sesion.rol));
  }, [fuera, sesion, router]);

  useEffect(() => {
    setPrevios(nombresRecordados());
    if (!hayConfig) { setPuedePasar(true); return; }

    // Se pregunta a la BASE si hace falta una cuenta, en vez de suponerlo.
    // Por defecto no hace falta y nadie ve una pantalla de contraseña; si
    // alguien corre EXIGIR_CUENTA.sql, aparece sola.
    const mirar = async () => {
      const [sesion, hace] = await Promise.all([sesionGuardada(), requiereCuenta()]);
      setPuedePasar(Boolean(sesion) || !hace);
    };
    mirar();
    // Si el token caduca sin poder renovarse, la pantalla vuelve sola a pedir
    // la vinculación en vez de dejar a la caja dando errores sin explicación.
    return alCambiarVinculo(() => { mirar(); });
  }, []);

  // Mientras se pregunta a la base no se dibuja nada, para no mostrar la
  // pantalla de acceso un instante a quien ya entró.
  if (puedePasar === undefined) return null;
  // Dos rutas quedan libres, las dos por la misma razón: se usan JUSTO
  // cuando el PIN no se puede verificar.
  //   /impresora     ajustar y probar la impresora, antes de tener nada montado.
  //   /configuracion el PIN vive en `settings.pin_hash`. Si esa tabla no
  //                  existe todavía, entrar es imposible — y la pantalla que
  //                  explica por qué quedaría del otro lado de la puerta.
  // Con sesión abierta manda la cuenta: revisión no entra a Impresora aunque
  // esté libre para quien todavía no puso el PIN.
  const LIBRES = ["/impresora", "/configuracion"];
  if (!hayConfig || (!sesion && LIBRES.includes(ruta))) return <>{children}</>;

  // Puerta de afuera, y solo cuando la base la exige: si no responde a la
  // clave sola, no hay nada que ver sin una cuenta.
  if (!puedePasar) {
    return <VincularDispositivo alVincular={() => setPuedePasar(true)} />;
  }

  if (sesion) {
    if (fuera) return null;
    return (
      <>
        <div className="flex items-center gap-2 px-3 text-xs"
             style={{ background: "var(--panel-2)", color: "var(--txt-2)",
                      minHeight: "40px" }}>
          <span className="min-w-0 truncate">
            Trabajando: <b style={{ color: "var(--txt)" }}>{sesion.nombre}</b>
          </span>
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={sesion.rol === "maestra"
                  ? { background: "var(--acc-fondo)", color: "var(--acc)" }
                  : { background: "var(--panel-3)", color: "var(--txt-2)" }}>
            {ROLES[sesion.rol].etiqueta}
          </span>
          {/*
            "Desvincular" NO va al lado de "Salir". En un teléfono, con los
            dedos y a media atención, tocar el de al lado deja el aparato
            fuera de la base y hace falta la contraseña del dueño para
            volver — en plena atención. Salir es de todos los días;
            desvincular es de una vez en la vida del aparato, así que vive
            en Estado, que es donde se va a buscar a propósito.
          */}
          <button className="ml-auto flex items-center px-2 underline"
                  style={{ minHeight: "40px" }}
                  onClick={() => salir()}>Salir</button>
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
      setPin("");
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
            Pon tu nombre y el PIN de tu cuenta
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
