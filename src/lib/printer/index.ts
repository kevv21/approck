export * from "./adapter";
export { AdaptadorBluetooth, esIOS } from "./bluetooth";
export { AdaptadorSerial } from "./serial";
export { AdaptadorPuente } from "./puente";
export { ticketHtml, imprimirHtml, descargarHtml } from "./html";

import type { PrinterAdapter, TipoAdaptador } from "./adapter";
import { AdaptadorBluetooth } from "./bluetooth";
import { AdaptadorSerial } from "./serial";
import { AdaptadorPuente } from "./puente";

export function crearAdaptador(tipo: TipoAdaptador): PrinterAdapter {
  switch (tipo) {
    case "bluetooth": return new AdaptadorBluetooth();
    case "serial":    return new AdaptadorSerial();
    case "puente":    return new AdaptadorPuente();
    default:
      throw new Error(`El adaptador "${tipo}" no se instancia: se usa directo.`);
  }
}

/**
 * Orden de preferencia segun el dispositivo. El puente va primero porque es
 * el unico que funciona en todos lados y no depende de dejar una pantalla
 * abierta; los demas quedan como respaldo manual.
 */
export function adaptadoresSugeridos(): TipoAdaptador[] {
  const out: TipoAdaptador[] = ["puente"];
  if (typeof navigator !== "undefined") {
    if ("bluetooth" in navigator) out.push("bluetooth");
    if ("serial" in navigator) out.push("serial");
  }
  out.push("html");
  return out;
}
