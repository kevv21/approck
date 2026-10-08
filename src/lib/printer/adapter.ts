import type { AnchoPapel } from "../escpos";

/**
 * Capa de impresion.
 *
 * Se imprime por UN solo camino: internet. Cualquier aparato —telefono,
 * iPhone, tablet, PC— deja el ticket en la cola (`print_job`) en el momento
 * de cobrar, reimprimir o pedir la pre-cuenta, y lo imprime la PC de caja con
 * el servicio del puente (bridge/), que tiene la impresora conectada.
 *
 *   puente   Ese servicio. En la app solo sirve para saber si esta vivo.
 *   html     No es un camino de impresion: «Imprimir aqui» y «Descargar
 *            recibo» de la caja, el respaldo con window.print() para cuando
 *            no hay internet o la PC esta apagada.
 *
 * Antes habia seis modos (RawBT por Bluetooth, USB, puerto COM, Web
 * Bluetooth, navegador y puente) y una «estacion» que tenia que quedar
 * abierta en un aparato. El dueño pidio dejar solo internet.
 */
export type TipoAdaptador = "puente" | "html";

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
