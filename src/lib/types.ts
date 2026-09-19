/** Grupo usado para los descuentos por categoria. */
export type GrupoDescuento = "pizza" | "bebida" | "otro";

export type TipoOrden = "mesa" | "para_llevar" | "delivery" | "retiro";

export const TIPOS_ORDEN: { valor: TipoOrden; etiqueta: string; corto: string }[] = [
  { valor: "mesa", etiqueta: "Mesa", corto: "MESA" },
  { valor: "para_llevar", etiqueta: "Para llevar", corto: "PARA LLEVAR" },
  { valor: "delivery", etiqueta: "Delivery", corto: "DELIVERY" },
  { valor: "retiro", etiqueta: "Retiro en local", corto: "RETIRO" },
];

export type MetodoPago = "efectivo" | "tarjeta" | "transferencia" | "mixto";

export const METODOS_PAGO: { valor: MetodoPago; etiqueta: string }[] = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "tarjeta", etiqueta: "Tarjeta" },
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "mixto", etiqueta: "Mixto" },
];

export interface Producto {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  grupo_descuento: GrupoDescuento;
  precio: number; // centavos, SIN IVA
  activo: boolean;
  orden: number;
}

/** Una linea del pedido. `precioUnit` es SIN IVA. */
export interface LineaOrden {
  id: string;
  productoId: string;
  nombre: string;
  precioUnit: number;
  cantidad: number;
  grupo: GrupoDescuento;
  notas?: string;
}

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
  /** Propina en bps. 1000 = 10% */
  propinaBps: number;
  /** Si el 10% se calcula sobre la base sin IVA o sobre base+IVA. */
  propinaSobre: "base" | "base_con_iva";
  cobrarPropina: boolean;
  /** Centavos. No recibe descuento ni genera propina, pero si paga IVA. */
  costoEnvio: number;
}

export const CONFIG_DEFAULT: ConfigCobro = {
  ivaBps: 1500,
  propinaBps: 1000,
  propinaSobre: "base",
  cobrarPropina: false,
  costoEnvio: 0,
};

export interface LineaCalculada extends LineaOrden {
  bruto: number;
  descCategoria: number;
  descGeneral: number;
  descTotal: number;
  neto: number;
}

export interface Totales {
  lineas: LineaCalculada[];
  subtotalBruto: number;
  descPizzas: number;
  descBebidas: number;
  descGeneral: number;
  descTotal: number;
  /** subtotal despues de descuentos, sin envio */
  baseProductos: number;
  costoEnvio: number;
  /** baseProductos + costoEnvio -> sobre esto se calcula el IVA */
  baseGravable: number;
  iva: number;
  propina: number;
  total: number;
}
