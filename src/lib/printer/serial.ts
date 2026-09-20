"use client";

import {
  escribirPorTrozos,
  type EstadoImpresora,
  type PrinterAdapter,
} from "./adapter";

/**
 * Web Serial: Chrome/Edge en PC contra un puerto COM.
 *
 * En Windows, emparejar la PT-210 por Bluetooth crea un puerto COM saliente.
 * Este adaptador escribe ahi directamente, sin necesitar el puente, cuando la
 * caja usa Chrome en esa misma PC.
 *
 * Los trozos son mas grandes que en BLE porque el serial no tiene el limite
 * de MTU, pero la impresora sigue teniendo un buffer chico.
 */
const TAM_CHUNK = 256;
const PAUSA_MS = 20;
const BAUD = 9600;

export class AdaptadorSerial implements PrinterAdapter {
  readonly tipo = "serial" as const;
  readonly etiqueta = "Puerto serial (COM)";

  private puerto: SerialPort | null = null;
  onEstado?: (e: EstadoImpresora) => void;

  disponible(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  motivoNoDisponible(): string | null {
    return this.disponible()
      ? null
      : "Este navegador no soporta Web Serial. Está en Chrome y Edge de escritorio.";
  }

  estado(): EstadoImpresora {
    return { conectada: !!this.puerto?.writable, detalle: `${BAUD} baudios` };
  }

  async conectar(): Promise<void> {
    const motivo = this.motivoNoDisponible();
    if (motivo) throw new Error(motivo);

    this.puerto = await navigator.serial.requestPort();
    await this.puerto.open({ baudRate: BAUD });
    this.onEstado?.(this.estado());
  }

  async imprimir(bytes: Uint8Array): Promise<void> {
    if (!this.puerto?.writable) throw new Error("Puerto serial no abierto.");
    const writer = this.puerto.writable.getWriter();
    try {
      await escribirPorTrozos(bytes, TAM_CHUNK, PAUSA_MS, (t) => writer.write(t));
    } finally {
      writer.releaseLock();
    }
  }

  desconectar(): void {
    this.puerto?.close().catch(() => {});
    this.puerto = null;
  }
}
