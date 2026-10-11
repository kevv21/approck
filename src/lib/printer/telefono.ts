"use client";

import { Rockzza } from "../nativo/rockzza";

/**
 * LA IMPRESORA DEL TELÉFONO (solo en el APK)
 *
 * Bluetooth clásico: la PT-210 con PIN 0000, que Chrome no puede ver. Se
 * empareja una vez en los ajustes de Android, se elige una vez en Impresora,
 * y queda guardada en este teléfono. A diferencia del Bluetooth de Chrome, no
 * hace falta volver a conectarla al abrir la app: el plugin se conecta solo
 * al imprimir.
 */

export interface ImpresoraElegida { direccion: string; nombre: string }

const CLAVE = "rockzza:impresora";

export function impresoraElegida(): ImpresoraElegida | null {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as ImpresoraElegida | null;
    return v?.direccion ? v : null;
  } catch { return null; }
}

export function guardarImpresora(i: ImpresoraElegida | null) {
  try {
    if (i) localStorage.setItem(CLAVE, JSON.stringify(i));
    else localStorage.removeItem(CLAVE);
  } catch { /* modo privado */ }
}

export const aBase64 = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

export async function imprimirPorTelefono(bytes: Uint8Array) {
  const i = impresoraElegida();
  if (!i) throw new Error("No hay impresora elegida en este teléfono.");
  await Rockzza.imprimir({ datos: aBase64(bytes), direccion: i.direccion });
}
