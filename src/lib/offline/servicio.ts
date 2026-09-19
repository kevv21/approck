"use client";

import { guardarYEncolar, type DatosGuardarOrden } from "../repo";
import type { Producto } from "../types";
import {
  actualizarOrdenLocal, contarPorEstado, encolarOrdenLocal, leerMenuLocal,
  ordenesPendientes, purgarSincronizadas, siguienteNumeroTemp,
} from "./db";
import { hayInternet } from "./conexion";
import { sincronizar, type PuertoSync } from "./sync";
import type { EstadoSync, OrdenLocal } from "./tipos";

/** Conecta el almacen local con el motor de sincronizacion. */
const puerto: PuertoSync = {
  pendientes: ordenesPendientes,
  marcar: actualizarOrdenLocal,
  async subir(o: OrdenLocal) {
    // `guardarYEncolar` es idempotente respecto de idLocal: si esta orden ya
    // subio en un intento cuya respuesta se perdio, devuelve la que existe.
    const { orden } = await guardarYEncolar({
      ...o.payload,
      idLocal: o.idLocal,
      creadaOffline: true,
      tomadaAt: o.creadaAt,
    });
    return { idRemoto: orden.id, numero: orden.numero };
  },
};

export interface ResultadoGuardar {
  /** true si se guardo local por falta de conexion */
  offline: boolean;
  numero: number;
  idLocal?: string;
}

/**
 * Guarda una orden por el camino que corresponda.
 *
 * Con conexion sube directo. Sin conexion la deja en el almacen local con un
 * numero temporal, y se sube sola al volver la senal. El numero REAL lo
 * asigna siempre la secuencia de Postgres, asi que dos meseros offline no
 * pueden generar el mismo correlativo.
 */
export async function guardarOrden(
  d: DatosGuardarOrden
): Promise<ResultadoGuardar> {
  const idLocal = crypto.randomUUID();

  if (await hayInternet()) {
    const { orden } = await guardarYEncolar({ ...d, idLocal });
    return { offline: false, numero: orden.numero, idLocal };
  }

  const numeroTemp = await siguienteNumeroTemp();
  await encolarOrdenLocal({
    idLocal,
    numeroTemp,
    estado: "pendiente",
    payload: d,
    creadaAt: new Date().toISOString(),
    intentos: 0,
  });
  return { offline: true, numero: numeroTemp, idLocal };
}

/** Sube lo pendiente. Se llama al recuperar la conexion y cada tanto. */
export async function sincronizarPendientes() {
  const r = await sincronizar(puerto);
  if (r.subidas > 0) await purgarSincronizadas();
  return r;
}

export async function estadoSync(): Promise<EstadoSync> {
  const { pendientes, conError } = await contarPorEstado();
  return {
    enLinea: await hayInternet(),
    pendientes,
    conError,
    sincronizando: false,
    ultimoIntento: null,
  };
}

/**
 * Menu con respaldo local: intenta la red, y si no hay usa la copia guardada.
 * Sin esto no se puede tomar ni una orden cuando se cae el internet.
 */
export async function cargarMenuConRespaldo(
  desdeRed: () => Promise<Producto[]>,
  guardar: (p: Producto[]) => Promise<void>
): Promise<{ productos: Producto[]; desdeCache: boolean; actualizadoAt?: string }> {
  try {
    const productos = await desdeRed();
    if (productos.length > 0) {
      await guardar(productos);
      return { productos, desdeCache: false };
    }
  } catch {
    // Se cae al respaldo local.
  }
  const cache = await leerMenuLocal();
  return {
    productos: cache?.productos ?? [],
    desdeCache: true,
    actualizadoAt: cache?.actualizadoAt,
  };
}
