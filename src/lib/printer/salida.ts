"use client";

import { AdaptadorBluetooth } from "./bluetooth";
import { AdaptadorPuente } from "./puente";

/**
 * POR DÓNDE SALE EL PAPEL. Una regla, para que se pueda explicar en voz alta:
 *
 *   Si este teléfono está conectado a la impresora por Bluetooth, imprime él.
 *   Si no, el ticket va a la cola y lo imprime la PC de caja.
 *
 * No se elige solo según si la PC responde: un teléfono que a veces imprime
 * él y a veces no, sin que nadie lo haya pedido, es un teléfono en el que
 * nadie sabe dónde buscar el ticket. Conectar el Bluetooth es la decisión.
 */

/** La impresora Bluetooth de este aparato. La conexión dura mientras la app siga abierta. */
export const impresoraBluetooth = new AdaptadorBluetooth();

export const imprimeDirecto = () => impresoraBluetooth.estado().conectada;

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
