"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * EL APK DE ANDROID (ROCKZZA)
 *
 * La misma app corre en el navegador y dentro del APK. Dentro del APK hay un
 * plugin propio (android/app/src/main/java/com/rockzza/app/RockzzaPlugin.java)
 * con lo que una página no puede hacer. Fuera del APK, `enApk()` es false y
 * nada de esto se llama.
 */

export interface ImpresoraEmparejada {
  nombre: string;
  direccion: string;
  /** Android la anuncia como impresora: va primero en la lista. */
  esImpresora: boolean;
}

export interface EstadoBluetooth {
  disponible: boolean;
  encendido: boolean;
  permiso: boolean;
  conectada: boolean;
  direccion?: string | null;
  nombre?: string | null;
}

interface PluginRockzza {
  estado(): Promise<EstadoBluetooth>;
  emparejadas(): Promise<{ impresoras: ImpresoraEmparejada[] }>;
  conectar(o: { direccion: string }): Promise<{ nombre: string; direccion: string }>;
  imprimir(o: { datos: string; direccion: string }): Promise<void>;
  desconectar(): Promise<void>;
  abrirAjustesBluetooth(): Promise<void>;
  vibrar(o: { ms: number }): Promise<void>;
  abrirEnNavegador(o: { url: string }): Promise<void>;
}

export const Rockzza = registerPlugin<PluginRockzza>("Rockzza");

/** ¿Esto corre dentro del APK? */
export const enApk = (): boolean => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

/** Código de error que manda el plugin (APAGADO, SIN_PERMISO, NO_CONECTA...). */
export const codigoDe = (e: unknown): string | undefined =>
  (e as { code?: string } | null)?.code;

/**
 * Un toque corto que se siente sin mirar: al agregar, al cobrar, al fallar.
 * En el APK, el motor de vibración del teléfono; en Chrome de Android, la
 * vibración del navegador. En PC no hace nada.
 */
export function vibrar(ms: number) {
  if (enApk()) { Rockzza.vibrar({ ms }).catch(() => {}); return; }
  try { navigator.vibrate?.(ms); } catch { /* sin vibración */ }
}
