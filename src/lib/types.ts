/** Grupo usado para los descuentos por categoria. */
export type GrupoDescuento = "pizza" | "bebida" | "otro";

export type TipoOrden = "mesa" | "para_llevar" | "delivery" | "retiro";

export const TIPOS_ORDEN: { valor: TipoOrden; etiqueta: string; corto: string }[] = [
  { valor: "mesa", etiqueta: "Mesa", corto: "MESA" },
  { valor: "para_llevar", etiqueta: "Para llevar", corto: "PARA LLEVAR" },
  { valor: "delivery", etiqueta: "Delivery", corto: "DELIVERY" },
  { valor: "retiro", etiqueta: "Retiro en local", corto: "RETIRO" },
];

/**
 * PedidosYa NO es un metodo de pago aca.
 *
 * Esa plata nunca pasa por la caja: la plataforma cobra al cliente, descuenta
 * su comision y deposita dias despues. Registrarla orden por orden obligaria
 * a cuadrar contra un dinero que no esta, y el arqueo nunca daria. En su
 * lugar se anota el total vendido por PedidosYa al cerrar la caja, que es el
 * numero que la plataforma reporta.
 */
export type MetodoPago = "efectivo" | "banpro" | "bac";

export const METODOS_PAGO: { valor: MetodoPago; etiqueta: string; enCaja: boolean }[] = [
  { valor: "efectivo", etiqueta: "Efectivo", enCaja: true },
  { valor: "banpro",   etiqueta: "Banpro",   enCaja: false },
  { valor: "bac",      etiqueta: "BAC",      enCaja: false },
];

export const etiquetaPago = (m: MetodoPago): string =>
  METODOS_PAGO.find((x) => x.valor === m)?.etiqueta ?? m;

export interface Producto {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  grupo_descuento: GrupoDescuento;
  precio: number; // centavos; base o con IVA segun ConfigCobro
  aplica_iva: boolean;
  activo: boolean;
  orden: number;
}

/**
 * Una linea del pedido.
 *
 * `precioUnit` se interpreta segun `ConfigCobro.preciosIncluyenIva`:
 * si es false (caso Rock Munchies) el precio es la base y el IVA se suma;
 * si es true, el precio ya trae el IVA dentro y se desglosa hacia atras.
 */
export interface LineaOrden {
  id: string;
  productoId: string;
  nombre: string;
  precioUnit: number;
  cantidad: number;
  grupo: GrupoDescuento;
  notas?: string;
  /** Productos exentos de IVA. Por defecto true (gravado). */
  aplicaIva?: boolean;
  /** Modificadores elegidos, con su recargo en centavos. */
  modificadores?: { nombre: string; precio: number }[];
  /**
   * Pizza mitad y mitad. `precioUnit` ya viene resuelto segun
   * `ConfigCobro.precioMitades`; esto guarda de que son las mitades para el
   * ticket y, sobre todo, para la comanda de cocina.
   */
  mitades?: [MitadPizza, MitadPizza];
  /** Descuento manual sobre esta linea, antes de los de categoria. */
  descuentoLinea?: { tipo: TipoDescuento; valor: number };
}

export interface MitadPizza {
  productoId: string;
  nombre: string;
  /** Precio de esa pizza entera, para poder recalcular si cambia la regla. */
  precio: number;
}

/**
 * Como se cobra una mitad y mitad.
 *
 *   promedio  se suman las dos y se divide entre dos. Es lo que pidio el
 *             dueno. Contra: mitad barata + mitad cara sale mas barato que
 *             la cara entera, asi que se puede pedir media de mariscos
 *             pagando el promedio.
 *   mayor     el precio de la mas cara. Cierra ese hueco, por si algun dia
 *             conviene.
 */
export type ReglaMitades = "promedio" | "mayor";

export function precioMitadYMitad(
  a: MitadPizza, b: MitadPizza, regla: ReglaMitades = "promedio"
): number {
  return regla === "mayor"
    ? Math.max(a.precio, b.precio)
    : Math.round((a.precio + b.precio) / 2);
}

/** Nombre corto para el ticket: "Criolla / Tocineta". */
export const nombreMitades = (a: MitadPizza, b: MitadPizza): string =>
  `${a.nombre} / ${b.nombre}`;

export type AlcanceDescuento = "general" | "pizza" | "bebida";
export type TipoDescuento = "porcentaje" | "monto";

export interface Descuento {
  alcance: AlcanceDescuento;
  tipo: TipoDescuento;
  /** porcentaje -> basis points (1000 = 10%); monto -> centavos */
  valor: number;
  motivo?: string;
}

export interface ConfigCobro {
  /** IVA en bps. Nicaragua: 1500 = 15% */
  ivaBps: number;
  /**
   * Si los precios del catalogo ya traen el IVA dentro. Rock Munchies: false.
   * Se soportan ambos modos porque el spec lo pide como ajuste, no hardcode.
   */
  preciosIncluyenIva: boolean;
  /** Propina en bps. 1000 = 10% */
  propinaBps: number;
  /** Si el 10% se calcula sobre la base sin IVA o sobre base+IVA. */
  propinaSobre: "base" | "base_con_iva";
  cobrarPropina: boolean;
  /** Centavos. Nunca recibe descuento ni genera propina. */
  costoEnvio: number;
  /**
   * Si el costo de envio entra en la base gravable.
   * Opcional y apagado por defecto: el spec pone el envio DESPUES del IVA.
   * Queda como ajuste porque es una decision fiscal, no tecnica.
   */
  envioGravado: boolean;
  /** Centavos de C$ por 1 US$. 0 = no mostrar equivalente en dolares. */
  tipoCambio: number;
  /** Como se cobra una pizza mitad y mitad. */
  precioMitades: ReglaMitades;
}

export const CONFIG_DEFAULT: ConfigCobro = {
  ivaBps: 1500,
  preciosIncluyenIva: false,
  propinaBps: 1000,
  propinaSobre: "base",
  cobrarPropina: false,
  costoEnvio: 0,
  envioGravado: false,
  tipoCambio: 0,
  precioMitades: "promedio",
};

export interface LineaCalculada extends LineaOrden {
  /** precioUnit * cantidad, mas modificadores */
  bruto: number;
  descLinea: number;
  descCategoria: number;
  descGeneral: number;
  descTotal: number;
  /** bruto - descTotal, tal como se imprime */
  neto: number;
  /** Parte del neto que es base imponible (sin IVA) */
  base: number;
  /** IVA que aporta esta linea. 0 si el producto es exento. */
  iva: number;
}

export interface Totales {
  lineas: LineaCalculada[];
  subtotalBruto: number;
  /** Suma de los descuentos manuales por linea */
  descLineas: number;
  descPizzas: number;
  descBebidas: number;
  descGeneral: number;
  descTotal: number;
  /** subtotal despues de descuentos, sin envio */
  baseProductos: number;
  costoEnvio: number;
  /** baseProductos + costoEnvio -> sobre esto se calcula el IVA */
  baseGravable: number;
  /** Parte de la base que NO paga IVA (productos exentos) */
  baseExenta: number;
  iva: number;
  /** Porcentaje de IVA aplicado, para la etiqueta del recibo (15) */
  ivaPct: number;
  propina: number;
  total: number;
  /** Equivalente del total en centavos de US$. null si no hay tipo de cambio. */
  totalUsd: number | null;
}
