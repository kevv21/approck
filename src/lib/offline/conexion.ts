"use client";

import { supabase, hayConfig } from "../supabase";

/**
 * Deteccion de conexion REAL.
 *
 * `navigator.onLine` miente: en un local con el wifi puesto pero sin internet
 * (modem caido, plan agotado) devuelve true igual. Un POS que confia en eso
 * deja al mesero creyendo que la orden se subio.
 *
 * Aca se usa navigator.onLine solo como senal rapida de que NO hay conexion,
 * y una consulta liviana como unica fuente de verdad de que SI la hay.
 */
const TIMEOUT_MS = 4000;

export function pareceDesconectado(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export async function hayInternet(): Promise<boolean> {
  if (!hayConfig) return false;
  if (pareceDesconectado()) return false;

  try {
    const carrera = Promise.race([
      // Consulta minima: solo el conteo, sin traer filas.
      supabase.from("settings").select("id", { count: "exact", head: true }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS)
      ),
    ]);
    const r = (await carrera) as { error: unknown } | undefined;
    return !r?.error;
  } catch {
    return false;
  }
}

/** Avisa cuando cambia el estado. Devuelve la funcion para dejar de escuchar. */
export function observarConexion(
  onCambio: (enLinea: boolean) => void,
  intervaloMs = 15000
): () => void {
  let vivo = true;
  let ultimo: boolean | null = null;

  const revisar = async () => {
    if (!vivo) return;
    const ahora = await hayInternet();
    if (ahora !== ultimo) {
      ultimo = ahora;
      onCambio(ahora);
    }
  };

  // Los eventos del navegador disparan una revision inmediata, pero no se
  // confia en ellos como verdad.
  const alCambiar = () => { revisar(); };
  window.addEventListener("online", alCambiar);
  window.addEventListener("offline", alCambiar);

  revisar();
  const id = setInterval(revisar, intervaloMs);

  return () => {
    vivo = false;
    clearInterval(id);
    window.removeEventListener("online", alCambiar);
    window.removeEventListener("offline", alCambiar);
  };
}
