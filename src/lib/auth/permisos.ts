/**
 * CUENTAS Y PERMISOS
 *
 * Dos cuentas, cada una con su PIN (ver supabase/17_accesos.sql):
 *
 * - MAESTRA: todo. Cobra, imprime, edita y anula órdenes, abre y cierra la
 *   caja, cambia los PIN.
 * - REVISIÓN: mira. Ve las órdenes y los cierres, descarga el Excel y hace
 *   el inventario. No cobra, no imprime, no anula, no toca la caja.
 *
 * ALCANCE: esto decide qué muestra la app a cada quien. No impide que alguien
 * con la clave pública llame a la base a mano; eso lo cierran BLINDAR.sql y
 * EXIGIR_CUENTA.sql. Sirve para que la persona que cuenta el inventario no
 * anule una venta por error, no para frenar a quien quiere hacer daño.
 */

export type Rol = "maestra" | "revision";

export const ROLES: Record<Rol, { etiqueta: string; detalle: string }> = {
  maestra: { etiqueta: "Maestra", detalle: "Cobra, imprime, edita y anula" },
  revision: { etiqueta: "Revisión", detalle: "Ve las órdenes y hace inventario" },
};

/** Lo que cambia algo o gasta papel. Todo es solo de la maestra. */
export type Accion =
  | "cobrar"     // la Caja entera: tomar, guardar y cobrar pedidos
  | "imprimir"   // reimprimir, pre-cuenta, tickets de prueba
  | "anular"     // anular, quitar y devolver órdenes
  | "turno";     // abrir y cerrar la caja, anotar PedidosYa

const ACCIONES: Record<Rol, readonly Accion[]> = {
  maestra: ["cobrar", "imprimir", "anular", "turno"],
  revision: [],
};

export const puede = (rol: Rol | null | undefined, a: Accion): boolean =>
  rol != null && ACCIONES[rol].includes(a);

/**
 * Pantallas de cada cuenta. La de revisión no ve la Caja (ahí todo es cobrar)
 * ni Impresora (no imprime).
 */
const PANTALLAS: Record<Rol, readonly string[] | "todas"> = {
  maestra: "todas",
  revision: ["/cierre", "/inventario", "/configuracion"],
};

export function puedeVer(rol: Rol | null | undefined, ruta: string): boolean {
  if (rol == null) return false;
  const p = PANTALLAS[rol];
  if (p === "todas") return true;
  return p.some((r) => ruta === r || ruta.startsWith(`${r}/`));
}

/** Adónde va cada cuenta al entrar o al abrir una pantalla que no le toca. */
export const inicioDe = (rol: Rol): string => (rol === "maestra" ? "/" : "/cierre");

export const esRol = (v: unknown): v is Rol => v === "maestra" || v === "revision";
