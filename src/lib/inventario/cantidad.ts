/**
 * CANTIDADES DEL INVENTARIO, con decimales: 12.2 lb de jamón es un conteo
 * legítimo. La base las guarda en `numeric(12,3)`, decimal exacto.
 *
 * El campo no podía recibir decimales: guardaba el NÚMERO mientras se
 * escribía, y al teclear «12.» eso es 12, así que el punto desaparecía antes
 * de llegar al 2. Ahora el campo guarda el TEXTO tal como se escribe y esto lo
 * convierte en número al leerlo.
 */

/** Hasta 3 decimales: es lo que guarda la base. */
export const DECIMALES = 3;

/**
 * Lee lo que se escribió. Acepta punto o coma («12.2» o «12,2»), espacios
 * alrededor y un punto final a medio escribir («12.»).
 *
 * - `null`: el campo está vacío (no se contó).
 * - `NaN`: lo escrito no es una cantidad («12.2.3», «abc», negativos).
 */
export function leerCantidad(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (t === "") return null;
  if (!/^\d*\.?\d*$/.test(t) || t === ".") return NaN;
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  const f = 10 ** DECIMALES;
  return Math.round(n * f) / f;
}

/** Cómo se muestra una cantidad ya guardada: 12.2, no 12.200. */
export const mostrarCantidad = (n: number | null | undefined): string =>
  n == null ? "" : String(n);
