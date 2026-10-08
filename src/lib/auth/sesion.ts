"use client";

import { useSyncExternalStore } from "react";
import { supabase } from "../supabase";
import { identificar } from "../observabilidad";
import { noExisteFuncion } from "../diagnostico";
import { esRol, type Rol } from "./permisos";

/**
 * QUIÉN ESTÁ TRABAJANDO
 *
 * Cada quien pone su nombre y el PIN de su cuenta: maestra o revisión (ver
 * permisos.ts). El PIN dice QUÉ puede hacer; el nombre, QUIÉN lo hizo. El
 * nombre va en la bitácora de cada anulación y cada descuento, y sale impreso
 * en el recibo. Eso es lo que de verdad sirve cuando falta plata en la caja.
 *
 * El PIN se comprueba EN LA BASE (`entrar_con_pin`), no aquí: los PIN viven
 * en una tabla que nadie puede leer. Antes el navegador leía el hash de
 * `settings` y comparaba, y ese hash lo podía leer cualquiera.
 *
 * ALCANCE: esto identifica y reparte permisos en la pantalla; no autentica.
 * Quien impide que un desconocido llegue a la base es la capa de AFUERA —la
 * vinculación del aparato con la cuenta del local, en auth/dispositivo.ts.
 */
export interface Sesion {
  nombre: string;
  desde: string;
  rol: Rol;
}

const CLAVE = "approck:sesion";
const CLAVE_NOMBRES = "approck:nombres";
const EVENTO = "approck:sesion";

/** SHA-256 del PIN. Solo para el camino viejo, sin 17_accesos.sql. */
async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Base que todavía no tiene las cuentas: un solo PIN en `settings`, y quien
 * lo sabe entra como maestra, que es lo que pasaba antes. Así una app nueva
 * contra una base vieja no deja a la caja fuera.
 */
async function pinViejoCorrecto(pin: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("settings").select("pin_hash").eq("id", "default").maybeSingle();
  if (error) throw error;
  // Sin PIN configurado la app queda abierta, en vez de dejar a la caja
  // fuera por un ajuste que nadie llenó.
  if (!data?.pin_hash) return true;
  return data.pin_hash === (await hashPin(pin));
}

/** Qué cuenta abre este PIN, según la base. null = ninguna. */
export async function rolDelPin(pin: string): Promise<Rol | null> {
  const { data, error } = await supabase.rpc("entrar_con_pin", { p_pin: pin });
  if (error) {
    if (noExisteFuncion(error)) return (await pinViejoCorrecto(pin)) ? "maestra" : null;
    throw error;
  }
  return esRol(data) ? data : null;
}

export async function entrar(nombre: string, pin: string): Promise<Sesion | null> {
  const rol = await rolDelPin(pin);
  if (!rol) return null;
  const s: Sesion = { nombre: nombre.trim(), desde: new Date().toISOString(), rol };
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(s));
    // Se recuerdan los nombres usados para no tener que escribirlos cada vez.
    const previos: string[] = JSON.parse(localStorage.getItem(CLAVE_NOMBRES) ?? "[]");
    const lista = [s.nombre, ...previos.filter((n) => n !== s.nombre)].slice(0, 8);
    localStorage.setItem(CLAVE_NOMBRES, JSON.stringify(lista));
  } catch { /* modo privado */ }
  identificar(s.nombre);
  avisarCambio();
  return s;
}

function leerSesion(crudo: string | null): Sesion | null {
  if (!crudo) return null;
  try {
    const s = JSON.parse(crudo) as Partial<Sesion>;
    // Una sesión de antes de las cuentas no dice qué cuenta es: se vuelve a
    // pedir el PIN una vez, en vez de suponer que es la maestra.
    if (typeof s.nombre !== "string" || !esRol(s.rol)) return null;
    return s as Sesion;
  } catch { return null; }
}

/**
 * sessionStorage y no localStorage a propósito: al cerrar la pestaña la
 * sesión muere. En una caja compartida, seguir con la sesión de ayer es peor
 * que volver a marcar el PIN.
 */
export function sesionActual(): Sesion | null {
  try { return leerSesion(sessionStorage.getItem(CLAVE)); }
  catch { return null; }
}

// --- La sesión como estado de React, para la barra y las pantallas --------
// La navegación vive fuera de la puerta de acceso, así que no puede recibir
// la sesión por props: la lee de aquí y se entera cuando cambia.

let ultimoCrudo: string | null | undefined;
let ultimaSesion: Sesion | null = null;

function instantanea(): Sesion | null {
  let crudo: string | null = null;
  try { crudo = sessionStorage.getItem(CLAVE); } catch { /* modo privado */ }
  // Mismo texto, mismo objeto: si no, React vuelve a dibujar sin fin.
  if (crudo !== ultimoCrudo) {
    ultimoCrudo = crudo;
    ultimaSesion = leerSesion(crudo);
  }
  return ultimaSesion;
}

function suscribir(cambio: () => void) {
  window.addEventListener(EVENTO, cambio);
  return () => window.removeEventListener(EVENTO, cambio);
}

function avisarCambio() {
  try { window.dispatchEvent(new Event(EVENTO)); } catch { /* fuera del navegador */ }
}

/** La sesión actual; se actualiza sola al entrar y al salir. */
export function useSesion(): Sesion | null {
  return useSyncExternalStore(suscribir, instantanea, () => null);
}

export function nombresRecordados(): string[] {
  try { return JSON.parse(localStorage.getItem(CLAVE_NOMBRES) ?? "[]"); }
  catch { return []; }
}

export function salir() {
  try { sessionStorage.removeItem(CLAVE); } catch { /* noop */ }
  identificar(null);
  avisarCambio();
}

// --- Administrar los PIN (pantalla Estado) ---------------------------------

export interface EstadoAccesos {
  maestra: boolean;
  revision: boolean;
  /** Queda el PIN de antes en `settings` (lo puede leer cualquiera). */
  pin_viejo: boolean;
  /** La maestra sigue con 1234, el PIN con que viene el instalador. */
  de_fabrica: boolean;
}

/** null = la base todavía no tiene las cuentas (falta 17_accesos.sql). */
export async function estadoAccesos(): Promise<EstadoAccesos | null> {
  const { data, error } = await supabase.rpc("accesos_estado");
  if (error) {
    if (noExisteFuncion(error)) return null;
    throw error;
  }
  return data as EstadoAccesos;
}

/**
 * Cambia el PIN de una cuenta. Siempre pide el de la maestra: la cuenta de
 * revisión no puede darse permisos. `nuevo` vacío en revisión la apaga.
 */
export async function cambiarPin(pinMaestra: string, rol: Rol, nuevo: string) {
  const { error } = await supabase.rpc("cambiar_pin", {
    p_pin_maestra: pinMaestra, p_rol: rol, p_nuevo: nuevo,
    p_usuario: sesionActual()?.nombre ?? null,
  });
  if (error) throw new Error(error.message);
}
