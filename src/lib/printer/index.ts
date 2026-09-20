export * from "./adapter";
export { AdaptadorBluetooth, esIOS } from "./bluetooth";
export { AdaptadorSerial } from "./serial";
export {
  AdaptadorRawBT, PAQUETE_RAWBT, PLAY_RAWBT,
  detectarReboteRawbt, marcarRawbtFalta, olvidarRawbt, rawbtDescartada,
} from "./rawbt";
export { AdaptadorUsb } from "./usb";
export { AdaptadorPuente } from "./puente";
export { ticketHtml, imprimirHtml, descargarHtml } from "./html";

import type { PrinterAdapter, TipoAdaptador } from "./adapter";
import { AdaptadorBluetooth } from "./bluetooth";
import { AdaptadorSerial } from "./serial";
import { AdaptadorRawBT } from "./rawbt";
import { AdaptadorUsb } from "./usb";
import { AdaptadorPuente } from "./puente";

export function crearAdaptador(tipo: TipoAdaptador): PrinterAdapter {
  switch (tipo) {
    case "rawbt":     return new AdaptadorRawBT();
    case "usb":       return new AdaptadorUsb();
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
/**
 * Metodos ofrecidos, de mas a menos probable en este dispositivo.
 *
 * Se listan aunque hoy no funcionen: el motivo se muestra con
 * `motivoNoDisponible()`. Esconder una opcion deja al usuario sin forma de
 * reintentarla, que es lo que pasaba con RawBT despues de un rebote.
 */
export function adaptadoresSugeridos(): TipoAdaptador[] {
  const out: TipoAdaptador[] = [];
  if (typeof navigator !== "undefined") {
    // RawBT primero en Android: es lo unico que habla Bluetooth Clasico, y
    // la impresora del local no expone BLE.
    if (/Android/i.test(navigator.userAgent)) out.push("rawbt");
  }
  out.push("puente");
  if (typeof navigator !== "undefined") {
    if ("usb" in navigator) out.push("usb");
    if ("bluetooth" in navigator) out.push("bluetooth");
    if ("serial" in navigator) out.push("serial");
  }
  out.push("html");
  return out;
}
