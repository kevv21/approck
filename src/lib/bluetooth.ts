"use client";

/**
 * Web Bluetooth para GOOJPRT PT-210.
 *
 * DONDE FUNCIONA:
 *   Android + Chrome/Edge   -> si
 *   Windows/Mac + Chrome    -> si (el emparejamiento BLE es inconsistente)
 *   iOS / iPadOS / Safari   -> NO. Apple no implementa Web Bluetooth y dijo
 *                              que no lo hara. Por eso existe la cola de
 *                              impresion: el iPhone crea el trabajo, el
 *                              Android de caja lo imprime.
 *
 * El PT-210 usa el modulo transparente UART de ISSC/Microchip.
 */
export const SERVICIO_ISSC = "49535343-fe7d-4ae5-8fa9-9fafd205e455";
export const CARACT_ESCRITURA = "49535343-8841-43f4-a8d4-ecbe34729bb3";

/** Otros servicios vistos en clones de esta impresora, por si el primero falla. */
export const SERVICIOS_ALTERNOS = [
  SERVICIO_ISSC,
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
];

/**
 * El MTU por defecto de BLE deja ~20 bytes utiles por paquete. Si mandas el
 * ticket entero de un golpe, la impresora descarta la mitad y sale cortado.
 */
const TAM_CHUNK = 20;
const PAUSA_MS = 25;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function soportaWebBluetooth(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/** Detecta iOS/iPadOS para mostrar el mensaje correcto en vez de un error críptico. */
export function esIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export class ImpresoraBT {
  private dispositivo: BluetoothDevice | null = null;
  private caracteristica: BluetoothRemoteGATTCharacteristic | null = null;
  onEstado?: (conectada: boolean, nombre?: string) => void;

  get conectada(): boolean {
    return !!this.caracteristica && !!this.dispositivo?.gatt?.connected;
  }

  get nombre(): string | undefined {
    return this.dispositivo?.name ?? undefined;
  }

  /** Abre el selector del navegador. Requiere gesto del usuario (un click). */
  async conectar(): Promise<void> {
    if (!soportaWebBluetooth()) {
      throw new Error(
        esIOS()
          ? "iOS no soporta Web Bluetooth. Usa el Android de caja como estación de impresión."
          : "Este navegador no soporta Web Bluetooth. Usa Chrome o Edge."
      );
    }

    this.dispositivo = await navigator.bluetooth.requestDevice({
      // acceptAllDevices porque estos clones anuncian nombres distintos
      // (PT-210, MTP-II, Printer001...) segun el lote.
      acceptAllDevices: true,
      optionalServices: SERVICIOS_ALTERNOS,
    });

    this.dispositivo.addEventListener("gattserverdisconnected", () => {
      this.caracteristica = null;
      this.onEstado?.(false, this.dispositivo?.name ?? undefined);
    });

    await this.abrirGatt();
  }

  private async abrirGatt(): Promise<void> {
    if (!this.dispositivo?.gatt) throw new Error("El dispositivo no expone GATT.");
    const server = await this.dispositivo.gatt.connect();

    let ultimoError: unknown = null;
    for (const uuidServicio of SERVICIOS_ALTERNOS) {
      try {
        const servicio = await server.getPrimaryService(uuidServicio);
        const caracts = await servicio.getCharacteristics();
        const escribible = caracts.find(
          (c) => c.properties.writeWithoutResponse || c.properties.write
        );
        if (escribible) {
          this.caracteristica = escribible;
          this.onEstado?.(true, this.dispositivo.name ?? undefined);
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

  /** Reconecta sin volver a pedir permiso (el navegador recuerda el dispositivo). */
  async reconectar(): Promise<void> {
    if (!this.dispositivo) throw new Error("No hay impresora emparejada en esta sesión.");
    await this.abrirGatt();
  }

  async imprimir(bytes: Uint8Array): Promise<void> {
    if (!this.caracteristica) {
      if (this.dispositivo) await this.reconectar();
      if (!this.caracteristica) throw new Error("Impresora no conectada.");
    }
    const c = this.caracteristica;
    const usarSinRespuesta = c.properties.writeWithoutResponse;

    for (let i = 0; i < bytes.length; i += TAM_CHUNK) {
      const trozo = bytes.slice(i, i + TAM_CHUNK);
      if (usarSinRespuesta) await c.writeValueWithoutResponse(trozo);
      else await c.writeValueWithResponse(trozo);
      await dormir(PAUSA_MS);
    }
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
