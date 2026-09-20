"use client";

import type { EstadoImpresora, PrinterAdapter } from "./adapter";
import { supabase } from "../supabase";

/**
 * Adaptador "puente": el dispositivo NO imprime, solo deja el trabajo en la
 * cola. Un servicio Node en la PC de caja (ver bridge/) la consulta y manda
 * los bytes a la impresora por el puerto serial del emparejamiento Bluetooth.
 *
 * Es el unico camino que funciona desde un iPhone, y es el que decidio el
 * dueno. Tambien evita depender de que alguien deje una pantalla abierta.
 *
 * Nota de arquitectura: el puente CONSULTA la nube, no recibe conexiones.
 * Hacerlo al reves (que los telefonos le manden HTTP a http://192.168.x.x)
 * no funciona desde una PWA servida por HTTPS: el navegador lo bloquea por
 * contenido mixto y Private Network Access.
 */
export class AdaptadorPuente implements PrinterAdapter {
  readonly tipo = "puente" as const;
  readonly etiqueta = "Puente en la PC de caja";

  private ultimoLatido: Date | null = null;

  disponible(): boolean {
    return true; // funciona en cualquier dispositivo, incluido iPhone
  }

  motivoNoDisponible(): null {
    return null;
  }

  estado(): EstadoImpresora {
    if (!this.ultimoLatido) {
      return { conectada: false, detalle: "sin señal del puente todavía" };
    }
    const seg = Math.round((Date.now() - this.ultimoLatido.getTime()) / 1000);
    // El puente late cada 10s; a los 60 se da por caido.
    return {
      conectada: seg < 60,
      nombre: "Puente",
      detalle: seg < 60 ? `activo hace ${seg}s` : `sin señal hace ${seg}s`,
    };
  }

  /** No hay nada que conectar: solo se verifica que el puente esté vivo. */
  async conectar(): Promise<void> {
    await this.refrescarLatido();
    if (!this.estado().conectada) {
      throw new Error(
        "El puente no está respondiendo. Revisá que el servicio esté corriendo en la PC de caja y que la impresora esté encendida."
      );
    }
  }

  async refrescarLatido(): Promise<Date | null> {
    const { data } = await supabase
      .from("puente_latido")
      .select("visto_at")
      .eq("id", "default")
      .maybeSingle();
    this.ultimoLatido = data?.visto_at ? new Date(data.visto_at) : null;
    return this.ultimoLatido;
  }

  async imprimir(): Promise<void> {
    // El trabajo ya fue encolado por quien llamo a `encolar()`. Este
    // adaptador no escribe bytes: solo existe para que la UI sepa que el
    // camino de impresion es el puente y pueda reportar su estado.
    return;
  }

  desconectar(): void {
    this.ultimoLatido = null;
  }
}
