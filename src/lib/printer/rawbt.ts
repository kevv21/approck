"use client";

import type { EstadoImpresora, PrinterAdapter } from "./adapter";

/**
 * RawBT: la unica via que funciona con impresoras de Bluetooth CLASICO.
 *
 * Por que hace falta: Web Bluetooth habla exclusivamente BLE/GATT. Muchas
 * termicas baratas, la PT-210 del local entre ellas, solo exponen Bluetooth
 * Clasico (perfil SPP). La senal inequivoca es que Android pida un PIN al
 * vincularla: BLE nunca pide PIN de cuatro digitos. Contra una impresora asi,
 * Web Bluetooth no falla por un error: el canal directamente no existe.
 *
 * RawBT es una app de Android que si habla SPP. La pagina le entrega los
 * bytes ESC/POS por un intent y ella los manda a la impresora.
 *
 * Formato del intent, tal como lo documenta RawBT y lo implementa escpos-php:
 *
 *   intent:base64,<base64>#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;
 *
 * Sin escape de URL mas alla del base64.
 */
export const PAQUETE_RAWBT = "ru.a402d.rawbtprinter";
export const PLAY_RAWBT =
  "https://play.google.com/store/apps/details?id=" + PAQUETE_RAWBT;

/** Android recorta los intents muy largos; el modo imagen puede pasarse. */
const LIMITE_B64 = 180_000;

const CLAVE = "approck:rawbt";

/** Se supo, por el rebote del intent, que la app no esta instalada. */
export function rawbtDescartada(): boolean {
  try { return localStorage.getItem(CLAVE) === "no"; } catch { return false; }
}

export function marcarRawbtFalta(): void {
  try { localStorage.setItem(CLAVE, "no"); } catch { /* modo privado */ }
}

export function olvidarRawbt(): void {
  try { localStorage.removeItem(CLAVE); } catch { /* noop */ }
}

/**
 * Detecta el rebote de Chrome al volver con ?sinrawbt=1 y limpia la URL.
 * Devuelve true si acaba de descubrirse que falta la app.
 */
export function detectarReboteRawbt(): boolean {
  if (typeof window === "undefined") return false;
  if (!new URLSearchParams(location.search).get("sinrawbt")) return false;
  marcarRawbtFalta();
  history.replaceState(null, "", location.pathname);
  return true;
}

function aBase64(bytes: Uint8Array): string {
  let s = "";
  // Por trozos: apply() con un array enorme revienta la pila.
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(s);
}

export class AdaptadorRawBT implements PrinterAdapter {
  readonly tipo = "rawbt" as const;
  readonly etiqueta = "RawBT (Bluetooth Clásico)";

  disponible(): boolean {
    if (typeof navigator === "undefined") return false;
    if (!/Android/i.test(navigator.userAgent)) return false;
    return !rawbtDescartada();
  }

  motivoNoDisponible(): string | null {
    return this.disponible()
      ? null
      : "RawBT es una app de Android. En iPhone o PC usá el puente de la PC de caja.";
  }

  estado(): EstadoImpresora {
    // No hay conexion que mantener: cada trabajo se entrega a la app.
    return { conectada: true, nombre: "RawBT", detalle: "entrega por intent" };
  }

  async conectar(): Promise<void> {
    /* Nada que conectar. La vinculacion vive dentro de RawBT. */
  }

  desconectar(): void {}

  /**
   * Saber si RawBT esta instalada sin preguntarle nada al usuario.
   *
   * Un intent de Android acepta `S.browser_fallback_url`: si el paquete NO
   * esta instalado, Chrome navega ahi en vez de quedarse mudo. Se apunta de
   * vuelta a la misma pagina con ?sinrawbt=1, y al volver la app sabe que
   * hay que ofrecer la instalacion. Sin esto el intent falla en silencio y
   * no hay forma de distinguir "no esta instalada" de "no imprimio".
   */
  async imprimir(bytes: Uint8Array): Promise<void> {
    const datos = aBase64(bytes);
    if (datos.length > LIMITE_B64) {
      throw new Error(
        `El trabajo pesa ${Math.round(datos.length / 1024)} kB y no cabe en un intent de Android. ` +
        "Apagá el modo imagen, o usá el servidor HTTP de RawBT."
      );
    }
    const volver = `${location.origin}${location.pathname}?sinrawbt=1`;
    window.location.href =
      `intent:base64,${datos}#Intent;scheme=rawbt;package=${PAQUETE_RAWBT};` +
      `S.browser_fallback_url=${encodeURIComponent(volver)};end;`;
  }
}
