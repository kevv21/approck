"use client";

/**
 * Web Bluetooth (BLE), directo del teléfono a la impresora. Es el camino de
 * la cuenta maestra cuando la PC de caja no está: se conecta desde Impresora
 * y, mientras la conexión siga abierta, lo que se imprime desde ese teléfono
 * sale por aquí en vez de ir a la cola (ver `salida.ts`).
 *
 * Límite que no se arregla en código: Web Bluetooth habla SOLO Bluetooth de
 * baja energía (BLE). Una impresora que solo habla Bluetooth clásico (SPP)
 * —la que pide PIN 0000 al emparejarla— no aparece en la lista. La PT-210
 * del local parece ser de esas; la prueba en Impresora lo dice en el
 * teléfono real. Y Safari (iPhone) no tiene Web Bluetooth.
 */

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
  readonly etiqueta = "Bluetooth en este teléfono";

  private dispositivo: BluetoothDevice | null = null;
  private caracteristica: BluetoothRemoteGATTCharacteristic | null = null;
  onEstado?: (e: EstadoImpresora) => void;

  disponible(): boolean {
    return typeof navigator !== "undefined" && "bluetooth" in navigator;
  }

  motivoNoDisponible(): string | null {
    if (this.disponible()) return null;
    return esIOS()
      ? "El iPhone no tiene Bluetooth para páginas web (Safari no lo implementa). Desde aquí se imprime por la PC de caja."
      : "Este navegador no tiene Bluetooth para páginas web. Usa Chrome en Android o en la PC.";
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
