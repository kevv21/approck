"use client";

import { columnasPara, type AnchoPapel } from "./escpos";

/**
 * MODO IMAGEN: el unico que funciona en cualquier impresora.
 *
 * El problema de los codepages es que cada impresora trae un juego distinto
 * segun marca y lote, y no hay forma de preguntarle cual soporta: el papel
 * es la unica salida que tiene.
 *
 * Este modo esquiva el problema entero. En vez de mandar caracteres para que
 * la impresora los interprete, se DIBUJA el texto en un canvas y se manda el
 * resultado como mapa de bits con `GS v 0`, que es parte del ESC/POS basico y
 * esta en practicamente toda impresora termica.
 *
 * Asi la impresora no interpreta nada: pinta los puntos que le mandamos. La ñ
 * y las tildes salen bien aunque el firmware no sepa que existen, y lo mismo
 * pasaria con cualquier otro idioma.
 *
 * El costo es el tamano: un ticket son decenas de miles de bytes en vez de
 * cientos. Por eso es una opcion y no el modo normal; por Bluetooth tarda, y
 * por el puente serial conviene subir a 115200 baudios.
 */

const GS = 0x1d;

export interface OpcionesRaster {
  ancho?: AnchoPapel;
  /** Tamano de fuente en pixeles. 20px llena las 32 columnas de 58mm. */
  tamanoFuente?: number;
  /** Umbral de binarizacion 0-255. Mas bajo = mas negro. */
  umbral?: number;
}

/** Puntos de ancho del cabezal: 384 en 58mm, 576 en 80mm. */
export function puntosPara(ancho: AnchoPapel): number {
  return ancho === 80 ? 576 : 384;
}

export function soportaRaster(): boolean {
  return typeof document !== "undefined" &&
    typeof document.createElement("canvas").getContext === "function";
}

/**
 * Convierte el texto ya maquetado (32 o 48 columnas) en bytes ESC/POS de
 * mapa de bits.
 */
export function textoARaster(texto: string, opts: OpcionesRaster = {}): Uint8Array {
  const ancho = opts.ancho ?? 58;
  const puntos = puntosPara(ancho);
  const cols = columnasPara(ancho);
  const umbral = opts.umbral ?? 160;

  const lineas = texto.split("\n");
  // La fuente se calcula para que quepan exactamente las columnas del papel:
  // en monoespaciada el ancho del caracter es ~0.6 del tamano.
  const tamano = opts.tamanoFuente ?? Math.floor(puntos / cols / 0.6);
  const alturaLinea = Math.round(tamano * 1.25);
  const alto = Math.max(1, lineas.length * alturaLinea);

  const canvas = document.createElement("canvas");
  canvas.width = puntos;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no permite dibujar en canvas.");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, puntos, alto);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";
  // Monoespaciada obligatoria: el maquetado de 32 columnas depende de que
  // todos los caracteres midan lo mismo.
  ctx.font = `${tamano}px "Courier New", Courier, monospace`;

  lineas.forEach((l, i) => ctx.fillText(l, 0, i * alturaLinea));

  const px = ctx.getImageData(0, 0, puntos, alto).data;
  const bytesPorLinea = puntos / 8;
  const datos = new Uint8Array(bytesPorLinea * alto);

  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < puntos; x++) {
      const i = (y * puntos + x) * 4;
      // Luminancia; por debajo del umbral se considera tinta.
      const lum = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
      if (lum < umbral) {
        datos[y * bytesPorLinea + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  // GS v 0 m xL xH yL yH ...datos
  const cabecera = [
    GS, 0x76, 0x30, 0x00,
    bytesPorLinea & 0xff, (bytesPorLinea >> 8) & 0xff,
    alto & 0xff, (alto >> 8) & 0xff,
  ];

  const out = new Uint8Array(2 + cabecera.length + datos.length + 3);
  let k = 0;
  out[k++] = 0x1b; out[k++] = 0x40;            // ESC @ : reiniciar
  for (const b of cabecera) out[k++] = b;
  out.set(datos, k); k += datos.length;
  out[k++] = 0x1b; out[k++] = 0x64; out[k++] = 4; // avanzar 4 lineas
  return out;
}

/** Cuanto pesa el ticket en modo imagen, para avisar antes de mandarlo. */
export function pesoEstimado(texto: string, ancho: AnchoPapel = 58): number {
  const puntos = puntosPara(ancho);
  const cols = columnasPara(ancho);
  const tamano = Math.floor(puntos / cols / 0.6);
  const lineas = texto.split("\n").length;
  return (puntos / 8) * lineas * Math.round(tamano * 1.25) + 11;
}
