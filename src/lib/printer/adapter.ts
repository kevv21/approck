import type { AnchoPapel } from "../escpos";

/**
 * Capa de impresion intercambiable (docs/SPEC.md, "Capa de impresion").
 *
 * Existen tres implementaciones porque ningun metodo funciona en todas
 * partes:
 *
 *   puente   Un servicio Node en la PC de caja, emparejado con la impresora
 *            por Bluetooth SPP, que consulta la cola y imprime. Es el unico
 *            camino que sirve para iPhone, porque el telefono solo escribe
 *            en la cola y nunca habla con la impresora.
 *
 *   bluetooth  Web Bluetooth directo. Solo Chrome/Edge en Android y PC.
 *              Nunca en iOS: Safari no implementa la API.
 *
 *   serial     Web Serial. Chrome/Edge en PC contra un puerto COM, util
 *              cuando la PT-210 ya esta emparejada en Windows.
 *
 *   html       Ultimo recurso: recibo en HTML con window.print() y descarga.
 *              Funciona en cualquier navegador, incluido iPhone.
 */
export type TipoAdaptador = "puente" | "bluetooth" | "serial" | "html";

export interface EstadoImpresora {
  conectada: boolean;
  nombre?: string;
  detalle?: string;
}

export interface PrinterAdapter {
  readonly tipo: TipoAdaptador;
  /** Nombre legible para la UI. */
  readonly etiqueta: string;
  /** Si este adaptador puede funcionar en el dispositivo actual. */
  disponible(): boolean;
  /** Por que no esta disponible, para mostrarlo en vez de un error cripitico. */
  motivoNoDisponible(): string | null;
  /** Requiere gesto del usuario (un click) en los adaptadores del navegador. */
  conectar(): Promise<void>;
  desconectar(): void;
  estado(): EstadoImpresora;
  /** Manda bytes ESC/POS crudos. */
  imprimir(bytes: Uint8Array): Promise<void>;
  onEstado?: (e: EstadoImpresora) => void;
}

export interface OpcionesImpresion {
  ancho: AnchoPapel;
  codepage: number;
  transliterar: boolean;
}

export const OPCIONES_DEFAULT: OpcionesImpresion = {
  ancho: 58,
  codepage: 16,
  transliterar: false,
};

/**
 * Trocea y espacia la escritura: casi todos los transportes lo necesitan.
 * Cada trozo se copia a un ArrayBuffer propio porque las APIs del navegador
 * (Web Bluetooth, Web Serial) no aceptan vistas sobre SharedArrayBuffer.
 */
export async function escribirPorTrozos(
  bytes: Uint8Array,
  tam: number,
  pausaMs: number,
  escribir: (t: Uint8Array<ArrayBuffer>) => Promise<void>
): Promise<void> {
  for (let i = 0; i < bytes.length; i += tam) {
    const trozo = new Uint8Array(bytes.subarray(i, i + tam));
    await escribir(trozo);
    if (pausaMs > 0) await new Promise((r) => setTimeout(r, pausaMs));
  }
}
