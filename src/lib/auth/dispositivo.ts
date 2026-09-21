"use client";

import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase";

/**
 * VINCULACION DEL DISPOSITIVO
 *
 * El problema que resuelve: la clave publishable viaja dentro del codigo que
 * descarga el navegador. Cualquiera que abra la pagina la tiene. Mientras las
 * politicas dejaran entrar al rol `anon`, esa persona podia LEER todas las
 * ventas e INSERTAR ordenes falsas, aunque ya no pudiera borrar ni adulterar.
 *
 * La solucion es que las politicas exijan `authenticated`, y que el
 * dispositivo se autentique con una cuenta del local cuya contraseña NO esta
 * en el codigo: se escribe una vez por telefono o por PC, y se queda.
 *
 * Por que UNA cuenta del local y no una por persona:
 *   - El dueño pidio "un acceso general". Una cuenta por mesero significa
 *     crear y dar de baja cuentas cada vez que entra o sale alguien.
 *   - Los telefonos se comparten. Con cuentas por persona habria que cerrar
 *     y abrir sesion entre pedido y pedido, y nadie lo haria.
 *   - La trazabilidad por persona YA existe, y en la capa donde sirve: el
 *     PIN mas el nombre, que van a la bitacora y salen en el recibo.
 * Lo que esta cuenta aporta no es saber QUIEN, es que un desconocido no
 * pueda ni asomarse.
 *
 * CUANDO HACE FALTA Y CUANDO NO
 *
 * Por defecto NO hace falta: BLINDAR.sql deja que la clave publishable lea y
 * cree ordenes, y el dueño prefirio no tener la friccion de escribir una
 * contrasena en cada telefono. La app no pide nada.
 *
 * Solo si alguien corre `supabase/EXIGIR_CUENTA.sql`, la base deja de
 * contestarle a la clave sola. La app lo DETECTA —no hay ajuste que tocar ni
 * que volver a desplegar— y empieza a pedir la cuenta.
 *
 * SIN CONEXION: la sesion vive en localStorage y el token se renueva solo
 * cuando hay señal. Un dispositivo ya vinculado sigue tomando ordenes sin
 * internet, igual que antes; la vinculacion solo se comprueba al sincronizar.
 */

/** Postgres: privilegio insuficiente. Es como PostgREST dice "no puedes". */
const SIN_PERMISO = "42501";

/**
 * ¿La base exige una cuenta, o contesta con la clave sola?
 *
 * Se pregunta a la base en vez de guardarlo en un ajuste, porque el ajuste se
 * desincroniza: alguien corre el SQL y la app sigue creyendo que no hace
 * falta, o al reves. Aqui la respuesta siempre es la de verdad.
 *
 * Ante la duda se responde que NO hace falta: dejar pasar a la pantalla del
 * PIN y que falle una consulta con un mensaje claro es mejor que plantar una
 * pantalla de contraseña delante de alguien que no la tiene ni la necesita.
 */
export async function requiereCuenta(): Promise<boolean> {
  try {
    const { error } = await supabase.from("settings").select("id").limit(1);
    if (!error) return false;
    return error.code === SIN_PERMISO ||
           /permission denied|not authorized/i.test(error.message);
  } catch {
    return false; // sin conexion: no es momento de pedir contraseñas
  }
}

export type EstadoVinculo = "comprobando" | "vinculado" | "sin_vincular";

/** La sesion guardada, sin exigir que el token este fresco. */
export async function sesionGuardada(): Promise<Session | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session ?? null;
  } catch {
    // Sin conexion o sin almacenamiento: se trata como no vinculado, pero no
    // se rompe la pantalla.
    return null;
  }
}

/** Correo de la cuenta con la que quedo vinculado este dispositivo. */
export async function correoVinculado(): Promise<string | null> {
  return (await sesionGuardada())?.user?.email ?? null;
}

export interface ResultadoVinculo {
  ok: boolean;
  /** Mensaje ya listo para mostrar, en español y sin jerga. */
  motivo?: string;
}

export async function vincular(
  correo: string, clave: string
): Promise<ResultadoVinculo> {
  const { error } = await supabase.auth.signInWithPassword({
    email: correo.trim(),
    password: clave,
  });
  if (!error) return { ok: true };

  // Los mensajes de Supabase vienen en ingles y no dicen que hacer.
  const m = error.message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return { ok: false, motivo: "Correo o contraseña incorrectos." };
  }
  if (m.includes("email not confirmed")) {
    return {
      ok: false,
      motivo: "La cuenta existe pero no está confirmada. En Supabase → " +
              "Authentication → Users, edita el usuario y marca «Auto Confirm».",
    };
  }
  if (m.includes("failed to fetch") || m.includes("network")) {
    return { ok: false, motivo: "Sin conexión. Vincular el dispositivo necesita internet una vez." };
  }
  return { ok: false, motivo: error.message };
}

/** Desvincula este dispositivo. El siguiente que lo use tendra que vincularlo. */
export async function desvincular(): Promise<void> {
  try { await supabase.auth.signOut(); } catch { /* ya estaba fuera */ }
}

/**
 * Avisa cuando la sesion aparece o desaparece: al vincular, al desvincular,
 * y —lo que importa— cuando el token caduca sin poder renovarse porque el
 * dispositivo lleva demasiado tiempo fuera.
 */
export function alCambiarVinculo(fn: (hay: boolean) => void): () => void {
  try {
    const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      fn(Boolean(sesion));
    });
    return () => data.subscription.unsubscribe();
  } catch {
    return () => {};
  }
}
