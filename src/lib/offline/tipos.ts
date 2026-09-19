import type { DatosGuardarOrden } from "../repo";
import type { Producto } from "../types";

/** Estado de una orden en el almacen local del dispositivo. */
export type EstadoLocal =
  | "pendiente"      // esperando conexion para subir
  | "subiendo"
  | "sincronizada"
  | "error";

export interface OrdenLocal {
  /** UUID generado en el dispositivo. Nunca choca entre dispositivos. */
  idLocal: string;
  /**
   * Numero temporal SOLO para mostrar en pantalla mientras no hay conexion.
   * El numero real lo asigna la secuencia de Postgres al sincronizar, asi que
   * dos meseros offline no pueden generar el mismo correlativo.
   */
  numeroTemp: number;
  estado: EstadoLocal;
  payload: DatosGuardarOrden;
  creadaAt: string;
  intentos: number;
  error?: string;
  /** Rellenados al sincronizar. */
  idRemoto?: string;
  numeroReal?: number;
  sincronizadaAt?: string;
}

export interface MenuCache {
  id: "menu";
  productos: Producto[];
  actualizadoAt: string;
}

/** Lo que la UI necesita saber para el indicador de conexion. */
export interface EstadoSync {
  enLinea: boolean;
  pendientes: number;
  conError: number;
  sincronizando: boolean;
  ultimoIntento: string | null;
}
