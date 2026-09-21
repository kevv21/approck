"use client";

import { supabase } from "../supabase";
import { identificar } from "../observabilidad";

/**
 * ACCESO GENERAL
 *
 * Un solo PIN compartido para entrar, y cada quien pone su nombre. No hay
 * roles ni permisos diferenciados: en un local de este tamaño, la matriz de
 * roles del spec era más ceremonia que control.
 *
 * Lo que sí queda es la trazabilidad: el nombre de quien entró va en la
 * bitacora de cada anulación y cada descuento, y sale impreso en el recibo.
 * Eso es lo que de verdad sirve cuando falta plata en la caja.
 *
 * ALCANCE: esto identifica, no autentica. Quien impide que un desconocido
 * llegue a la base es la capa de AFUERA —la vinculación del aparato con la
 * cuenta del local, en auth/dispositivo.ts—, porque las políticas exigen una
 * sesión de Supabase. Antes de eso, esta pantalla era lo único que había y
 * no resistía a nadie: bastaba llamar a la API con la clave del código.
 *
 * Este PIN sigue haciendo falta, pero para otra cosa: saber QUIÉN de los que
 * comparten el teléfono anuló esa orden.
 */
export interface Sesion {
  nombre: string;
  desde: string;
}

const CLAVE = "approck:sesion";
const CLAVE_NOMBRES = "approck:nombres";

/** SHA-256 en el navegador: el PIN nunca viaja ni se guarda en claro. */
export async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function pinCorrecto(pin: string): Promise<boolean> {
  const hash = await hashPin(pin);
  const { data } = await supabase
    .from("settings").select("pin_hash").eq("id", "default").maybeSingle();

  // Sin PIN configurado la app queda abierta, en vez de dejar a la caja
  // fuera por un ajuste que nadie llenó.
  if (!data?.pin_hash) return true;
  return data.pin_hash === hash;
}

export async function cambiarPin(pinNuevo: string) {
  const { error } = await supabase
    .from("settings")
    .update({ pin_hash: pinNuevo ? await hashPin(pinNuevo) : null })
    .eq("id", "default");
  if (error) throw error;
}

export async function entrar(nombre: string, pin: string): Promise<Sesion | null> {
  if (!(await pinCorrecto(pin))) return null;
  const s: Sesion = { nombre: nombre.trim(), desde: new Date().toISOString() };
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(s));
    // Se recuerdan los nombres usados para no tener que escribirlos cada vez.
    const previos: string[] = JSON.parse(localStorage.getItem(CLAVE_NOMBRES) ?? "[]");
    const lista = [s.nombre, ...previos.filter((n) => n !== s.nombre)].slice(0, 8);
    localStorage.setItem(CLAVE_NOMBRES, JSON.stringify(lista));
  } catch { /* modo privado */ }
  identificar(s.nombre);
  return s;
}

/**
 * sessionStorage y no localStorage a propósito: al cerrar la pestaña la
 * sesión muere. En una caja compartida, seguir con la sesión de ayer es peor
 * que volver a marcar el PIN.
 */
export function sesionActual(): Sesion | null {
  try {
    const s = sessionStorage.getItem(CLAVE);
    return s ? (JSON.parse(s) as Sesion) : null;
  } catch { return null; }
}

export function nombresRecordados(): string[] {
  try { return JSON.parse(localStorage.getItem(CLAVE_NOMBRES) ?? "[]"); }
  catch { return []; }
}

export function salir() {
  try { sessionStorage.removeItem(CLAVE); } catch { /* noop */ }
  identificar(null);
}
