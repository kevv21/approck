"use client";

import { guardarYEncolar, type DatosGuardarOrden } from "../repo";
import type { Producto } from "../types";
import {
  actualizarOrdenLocal, contarPorEstado, encolarOrdenLocal, leerMenuLocal,
  leerOrdenLocal, ordenesPendientes, purgarSincronizadas, siguienteNumeroTemp,
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
  /** Id en la base. Solo existe si subio; hace falta para reimprimir. */
  id?: string;
  /**
   * Era un reintento de una orden que ya estaba guardada: no se creo otra.
   * Si el pedido cambio entre un intento y otro, lo nuevo no entro.
   */
  yaExistia?: boolean;
  /** false si se guardo pero el ticket no llego a la cola de impresion. */
  impreso?: boolean;
}

/**
 * Guarda una orden por el camino que corresponda.
 *
 * Con conexion sube directo. Sin conexion la deja en el almacen local con un
 * numero temporal, y se sube sola al volver la senal. El numero REAL lo
 * asigna siempre la secuencia de Postgres, asi que dos meseros offline no
 * pueden generar el mismo correlativo.
 *
 * `d.idLocal` lo pone la caja y es EL MISMO en todos los intentos de la misma
 * orden. Antes se inventaba aqui uno nuevo por intento, y un reintento tras
 * una respuesta perdida creaba una segunda orden: la venta salia dos veces.
 */
export async function guardarOrden(
  d: DatosGuardarOrden
): Promise<ResultadoGuardar> {
  const idLocal = d.idLocal ?? crypto.randomUUID();

  if (await hayInternet()) {
    const r = await guardarYEncolar({ ...d, idLocal });
    return {
      offline: false, numero: r.orden.numero, idLocal, id: r.orden.id,
      yaExistia: r.yaExistia, impreso: r.impreso,
    };
  }

  // Reintento sin conexion de una orden que ya esta en la cola: se actualiza
  // la misma, con su numero temporal, en vez de encolar otra.
  const previa = await leerOrdenLocal(idLocal);
  if (previa && previa.estado !== "sincronizada") {
    await actualizarOrdenLocal(idLocal, { payload: { ...d, idLocal } });
    return { offline: true, numero: previa.numeroTemp, idLocal };
  }

  const numeroTemp = await siguienteNumeroTemp();
  await encolarOrdenLocal({
    idLocal,
    numeroTemp,
    estado: "pendiente",
    payload: { ...d, idLocal },
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
