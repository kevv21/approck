"use client";

import type { EstadoImpresora, PrinterAdapter } from "./adapter";

/**
 * WebUSB: el otro camino que no depende de BLE.
 *
 * El selftest de la PT-210 reporta "Interface: USB&BT", asi que con un cable
 * OTG Chrome en Android puede hablarle directo, sin Bluetooth y sin apps de
 * por medio. Es mas estable que cualquier via inalambrica, a cambio de tener
 * el telefono atado a la impresora por un cable.
 */
const TAM_CHUNK = 4096;

export class AdaptadorUsb implements PrinterAdapter {
  readonly tipo = "usb" as const;
  readonly etiqueta = "Cable USB (OTG)";

  private dev: USBDevice | null = null;
  private endpoint = 0;
  onEstado?: (e: EstadoImpresora) => void;

  disponible(): boolean {
    return typeof navigator !== "undefined" && "usb" in navigator;
  }

  motivoNoDisponible(): string | null {
    return this.disponible()
      ? null
      : "Este navegador no soporta WebUSB. Está en Chrome y Edge.";
  }

  estado(): EstadoImpresora {
    return { conectada: !!this.dev?.opened, nombre: this.dev?.productName ?? undefined };
  }

  async conectar(): Promise<void> {
    const motivo = this.motivoNoDisponible();
    if (motivo) throw new Error(motivo);

    this.dev = await navigator.usb.requestDevice({ filters: [] });
    await this.dev.open();
    if (this.dev.configuration === null) await this.dev.selectConfiguration(1);

    // Se prefiere la interfaz de clase 7 (impresora); si no hay, la primera
    // con una salida bulk sirve: muchos clones no declaran la clase correcta.
    let respaldo: { iface: number; ep: number } | null = null;
    for (const cfg of this.dev.configurations)
      for (const i of cfg.interfaces)
        for (const alt of i.alternates) {
          const ep = alt.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
          if (!ep) continue;
          if (alt.interfaceClass === 7) {
            await this.dev.claimInterface(i.interfaceNumber);
            this.endpoint = ep.endpointNumber;
            this.onEstado?.(this.estado());
            return;
          }
          respaldo ??= { iface: i.interfaceNumber, ep: ep.endpointNumber };
        }

    if (!respaldo) throw new Error("Ese dispositivo no expone una salida de impresión por USB.");
    await this.dev.claimInterface(respaldo.iface);
    this.endpoint = respaldo.ep;
    this.onEstado?.(this.estado());
  }

  async imprimir(bytes: Uint8Array): Promise<void> {
    if (!this.dev?.opened) throw new Error("Impresora USB no conectada.");
    for (let i = 0; i < bytes.length; i += TAM_CHUNK) {
      await this.dev.transferOut(this.endpoint, new Uint8Array(bytes.subarray(i, i + TAM_CHUNK)));
    }
  }

  desconectar(): void {
    this.dev?.close().catch(() => {});
    this.dev = null;
  }
}
