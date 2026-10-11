"use client";

import { AdaptadorBluetooth } from "./bluetooth";
import { AdaptadorPuente } from "./puente";
import { impresoraElegida, imprimirPorTelefono } from "./telefono";
import { enApk } from "../nativo/rockzza";

/**
 * POR DÓNDE SALE EL PAPEL. Una regla, para que se pueda explicar en voz alta:
 *
 *   Si este teléfono tiene su propia impresora, imprime él.
 *   Si no, el ticket va a la cola y lo imprime la PC de caja.
 *
 * «Su propia impresora» es, en el APK, la impresora Bluetooth elegida en
 * Impresora (queda guardada); en Chrome, la impresora BLE conectada en esta
 * sesión.
 *
 * No se elige según si la PC responde: un teléfono que a veces imprime él y a
 * veces no, sin que nadie lo haya pedido, es un teléfono en el que nadie sabe
 * dónde buscar el ticket. Elegir la impresora es la decisión.
 */

/** La impresora BLE de Chrome. La conexión dura mientras la página siga abierta. */
export const impresoraBluetooth = new AdaptadorBluetooth();

export type SalidaDirecta = "telefono" | "bluetooth" | null;

export function salidaDirecta(): SalidaDirecta {
  if (enApk()) return impresoraElegida() ? "telefono" : null;
  return impresoraBluetooth.estado().conectada ? "bluetooth" : null;
}

export const imprimeDirecto = () => salidaDirecta() !== null;

/** Imprime por la impresora del teléfono. Llamar solo si `imprimeDirecto()`. */
export async function imprimirDirecto(bytes: Uint8Array) {
  const s = salidaDirecta();
  if (s === "telefono") return imprimirPorTelefono(bytes);
  if (s === "bluetooth") return impresoraBluetooth.imprimir(bytes);
  throw new Error("Este teléfono no tiene impresora.");
}

const puente = new AdaptadorPuente();
let revisadoAt = 0;
let pcViva: boolean | null = null;

/**
 * ¿La PC de caja está imprimiendo? Se guarda la respuesta unos segundos:
 * se pregunta en cada cobro y no tiene que demorarlo.
 */
export async function pcResponde(vigenciaMs = 15_000): Promise<boolean> {
  if (pcViva !== null && Date.now() - revisadoAt < vigenciaMs) return pcViva;
  try {
    await puente.refrescarLatido();
    pcViva = puente.estado().conectada;
  } catch {
    pcViva = false;
  }
  revisadoAt = Date.now();
  return pcViva;
}
