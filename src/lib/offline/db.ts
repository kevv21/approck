"use client";

import Dexie, { type Table } from "dexie";
import type { MenuCache, OrdenLocal } from "./tipos";
import { reintentable } from "./sync";

/**
 * Almacen local del dispositivo (IndexedDB via Dexie).
 *
 * Guarda dos cosas:
 *  - el menu, para poder tomar ordenes sin internet
 *  - las ordenes creadas offline, hasta que se suban
 *
 * No guarda cobros ni cierres: el spec exige conexion para eso, y es lo
 * correcto. Un arqueo de caja calculado contra datos que quiza no subieron
 * no sirve para nada.
 */
class BaseLocal extends Dexie {
  ordenes!: Table<OrdenLocal, string>;
  menu!: Table<MenuCache, string>;

  constructor() {
    super("approck");
    this.version(1).stores({
      ordenes: "idLocal, estado, creadaAt",
      menu: "id",
    });
  }
}

let _db: BaseLocal | null = null;

/** Dexie solo existe en el navegador; en el servidor devuelve null. */
export function db(): BaseLocal | null {
  if (typeof window === "undefined") return null;
  if (!_db) _db = new BaseLocal();
  return _db;
}

export async function guardarMenuLocal(productos: MenuCache["productos"]) {
  await db()?.menu.put({
    id: "menu",
    productos,
    actualizadoAt: new Date().toISOString(),
  });
}

export async function leerMenuLocal(): Promise<MenuCache | null> {
  return (await db()?.menu.get("menu")) ?? null;
}

export async function encolarOrdenLocal(o: OrdenLocal) {
  await db()?.ordenes.put(o);
}

export async function leerOrdenLocal(idLocal: string): Promise<OrdenLocal | null> {
  return (await db()?.ordenes.get(idLocal)) ?? null;
}

export async function ordenesPendientes(): Promise<OrdenLocal[]> {
  const d = db();
  if (!d) return [];
  // Se suben en el orden en que se crearon, para que los correlativos del
  // servidor respeten la secuencia real de la noche.
  //
  // «subiendo» tambien entra si lleva rato asi: es una subida que murio a
  // la mitad (se cerro la app, se apago el telefono). Antes quedaba asi para
  // siempre, sin reintentarse y sin contarse en el indicador.
  const ahora = Date.now();
  const lista = await d.ordenes
    .where("estado")
    .anyOf("pendiente", "error", "subiendo")
    .sortBy("creadaAt");
  return lista.filter((o) => reintentable(o, ahora));
}

export async function actualizarOrdenLocal(
  idLocal: string,
  parche: Partial<OrdenLocal>
) {
  await db()?.ordenes.update(idLocal, parche);
}

export async function contarPorEstado() {
  const d = db();
  if (!d) return { pendientes: 0, conError: 0 };
  // Lo que esta «subiendo» todavia no esta arriba: cuenta como pendiente.
  const [pendientes, conError] = await Promise.all([
    d.ordenes.where("estado").anyOf("pendiente", "subiendo").count(),
    d.ordenes.where("estado").equals("error").count(),
  ]);
  return { pendientes, conError };
}

/** Siguiente numero temporal para mostrar mientras no hay conexion. */
export async function siguienteNumeroTemp(): Promise<number> {
  const d = db();
  if (!d) return 1;
  const ultima = await d.ordenes.orderBy("creadaAt").reverse().first();
  return (ultima?.numeroTemp ?? 0) + 1;
}

/** Limpia las ordenes ya subidas hace mas de una semana. */
export async function purgarSincronizadas(dias = 7) {
  const d = db();
  if (!d) return;
  const corte = new Date(Date.now() - dias * 86400_000).toISOString();
  await d.ordenes
    .where("estado").equals("sincronizada")
    .and((o) => (o.sincronizadaAt ?? o.creadaAt) < corte)
    .delete();
}
