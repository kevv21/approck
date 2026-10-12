"use client";

import { useEffect, useState } from "react";
import { useSesion } from "@/lib/auth/sesion";
import { inicioDe, puedeVer } from "@/lib/auth/permisos";
import {
  alCambiarVinculo, requiereCuenta, sesionGuardada,
} from "@/lib/auth/dispositivo";
import VincularDispositivo from "@/components/VincularDispositivo";
import PantallaPin from "@/components/PantallaPin";
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
  const ruta = usePathname();
  const router = useRouter();
  // Una pantalla que no es de esta cuenta (la Caja, para revisión) lleva a la
  // suya en vez de mostrarse a medias.
  const fuera = sesion != null && !puedeVer(sesion.rol, ruta);

  useEffect(() => {
    if (fuera && sesion) router.replace(inicioDe(sesion.rol));
  }, [fuera, sesion, router]);

  useEffect(() => {
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
    return <><MarcarPuerta /><VincularDispositivo alVincular={() => setPuedePasar(true)} /></>;
  }

  if (sesion) {
    if (fuera) return null;
    // Quién está trabajando y «Salir» viven en el encabezado (CuentaEncabezado):
    // la barra de 40px que había aquí se comía el alto del menú en el teléfono.
    return <>{children}</>;
  }

  return <><MarcarPuerta /><PantallaPin /></>;
}

/**
 * Mientras se ve la puerta, la barra de abajo se esconde: sin sesión, cada
 * pestaña lleva a esta misma pantalla, y en un teléfono chico le quitaba el
 * lugar al teclado del PIN. Lo dice un atributo en <html>; el CSS hace el
 * resto (ver .nav-abajo en globals.css).
 */
function MarcarPuerta() {
  useEffect(() => {
    const raiz = document.documentElement;
    raiz.dataset.puerta = "";
    return () => { delete raiz.dataset.puerta; };
  }, []);
  return null;
}
