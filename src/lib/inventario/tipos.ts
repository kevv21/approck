export interface Insumo {
  id: string;
  nombre: string;
  /** null = la plantilla no la traía y nadie la definió todavía */
  unidad: string | null;
  orden: number;
  activo: boolean;
}

export interface Conteo {
  id: string;
  fecha: string;
  realizado_por: string | null;
  notas: string | null;
  estado: "abierto" | "cerrado";
  created_at: string;
  cerrado_at: string | null;
}

export interface ConteoItem {
  insumo_id: string;
  nombre_snapshot: string;
  unidad_snapshot: string | null;
  /**
   * Cantidad fisica. A diferencia del dinero, aca 2.5 Lb es un valor
   * legitimo, y en Postgres se guarda como numeric (decimal exacto, no
   * float). null = todavia no se conto ese insumo.
   */
  cantidad: number | null;
}

/**
 * Unidades que aparecen en la plantilla. "Unidad" y "UND" son lo mismo
 * escrito de dos formas; se ofrece la forma corta y se acepta la larga para
 * no romper los datos que ya existen.
 */
export const UNIDADES = [
  "Lb", "UND", "Arroba", "Galon", "Litro", "Kg", "Caja", "Paquete", "Bolsa",
] as const;

/** Normaliza los alias de la plantilla a una sola forma. */
export function normalizarUnidad(u: string | null): string | null {
  if (!u) return null;
  const limpia = u.trim();
  if (/^unidad(es)?$/i.test(limpia)) return "UND";
  if (/^und$/i.test(limpia)) return "UND";
  if (/^lbs?$/i.test(limpia)) return "Lb";
  if (/^gal(on|ón)?$/i.test(limpia)) return "Galon";
  return limpia;
}
