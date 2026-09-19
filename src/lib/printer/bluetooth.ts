"use client";

import {
  escribirPorTrozos,
  type EstadoImpresora,
  type PrinterAdapter,
} from "./adapter";

/** Modulo UART transparente de ISSC/Microchip, el que trae la PT-210. */
export const SERVICIO_ISSC = "49535343-fe7d-4ae5-8fa9-9fafd205e455";
export const CARACT_ESCRITURA = "49535343-8841-43f4-a8d4-ecbe34729bb3";

/** Otros servicios vistos en clones de esta impresora, segun el lote. */
export const SERVICIOS_ALTERNOS = [
  SERVICIO_ISSC,
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
];

/** El MTU por defecto de BLE deja ~20 bytes utiles por paquete. */
const TAM_CHUNK = 20;
const PAUSA_MS = 25;

export function esIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export class AdaptadorBluetooth implements PrinterAdapter {
  readonly tipo = "bluetooth" as const;
  readonly etiqueta = "Bluetooth directo";

  private dispositivo: BluetoothDevice | null = null;
  private caracteristica: BluetoothRemoteGATTCharacteristic | null = null;
  onEstado?: (e: EstadoImpresora) => void;

  disponible(): boolean {
    return typeof navigator !== "undefined" && "bluetooth" in navigator;
  }

  motivoNoDisponible(): string | null {
    if (this.disponible()) return null;
    return esIOS()
      ? "Safari en iPhone y iPad no implementa Web Bluetooth, y Apple no tiene planes de hacerlo. Este dispositivo puede tomar órdenes: los tickets van a la cola y salen por el puente de la PC."
      : "Este navegador no soporta Web Bluetooth. Usa Chrome o Edge.";
  }

  estado(): EstadoImpresora {
    return {
      conectada: !!this.caracteristica && !!this.dispositivo?.gatt?.connected,
      nombre: this.dispositivo?.name ?? undefined,
    };
  }

  async conectar(): Promise<void> {
    const motivo = this.motivoNoDisponible();
    if (motivo) throw new Error(motivo);

    this.dispositivo = await navigator.bluetooth.requestDevice({
      // acceptAllDevices porque estos clones anuncian nombres distintos
      // (PT-210, MTP-II, Printer001...) segun el lote.
      acceptAllDevices: true,
      optionalServices: SERVICIOS_ALTERNOS,
    });

    this.dispositivo.addEventListener("gattserverdisconnected", () => {
      this.caracteristica = null;
      this.onEstado?.(this.estado());
    });

    await this.abrirGatt();
  }

  private async abrirGatt(): Promise<void> {
    if (!this.dispositivo?.gatt) throw new Error("El dispositivo no expone GATT.");
    const server = await this.dispositivo.gatt.connect();

    let ultimoError: unknown = null;
    for (const uuid of SERVICIOS_ALTERNOS) {
      try {
        const servicio = await server.getPrimaryService(uuid);
        const caracts = await servicio.getCharacteristics();
        const escribible = caracts.find(
          (c) => c.properties.writeWithoutResponse || c.properties.write
        );
        if (escribible) {
          this.caracteristica = escribible;
          this.onEstado?.(this.estado());
          return;
        }
      } catch (e) {
        ultimoError = e;
      }
    }
    throw new Error(
      `No se encontró una característica de escritura. ¿Es la impresora correcta? ${String(ultimoError ?? "")}`
    );
  }

  async imprimir(bytes: Uint8Array): Promise<void> {
    if (!this.caracteristica && this.dispositivo) await this.abrirGatt();
    const c = this.caracteristica;
    if (!c) throw new Error("Impresora no conectada.");

    const sinRespuesta = c.properties.writeWithoutResponse;
    await escribirPorTrozos(bytes, TAM_CHUNK, PAUSA_MS, (t) =>
      sinRespuesta ? c.writeValueWithoutResponse(t) : c.writeValueWithResponse(t)
    );
  }

  desconectar(): void {
    try {
      this.dispositivo?.gatt?.disconnect();
    } catch {
      /* noop */
    }
    this.caracteristica = null;
  }
}
