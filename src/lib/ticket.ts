import {
  EscPos, centrar, columnasPara, envolver, parLineado,
  type AnchoPapel,
} from "./escpos";
import { fmt } from "./money";
import { TIPOS_ORDEN, type MetodoPago, type TipoOrden, type Totales } from "./types";

export interface DatosNegocio {
  nombre: string;
  telefono?: string;
  direccion?: string;
  ruc?: string;
  pie?: string;
}

/** Valores por defecto. En produccion vienen de la tabla `settings`. */
export const NEGOCIO: DatosNegocio = {
  nombre: "ROCK MUNCHIES",
  telefono: "",   // PENDIENTE
  direccion: "",  // PENDIENTE
  ruc: "",        // PENDIENTE
  pie: "¡Gracias por su compra!",
};

/**
 * Exigida por el spec hasta que exista facturacion autorizada por la DGI.
 * No quitarla sin confirmacion del contador.
 */
export const LEYENDA_FISCAL = "Recibo de consumo - no es factura fiscal";

export type TipoDocumento = "cliente" | "precuenta" | "cocina";

export interface DatosTicket {
  numero: number;
  tipo: TipoOrden;
  mesa?: string | null;
  cliente?: string | null;
  telefonoCliente?: string | null;
  direccion?: string | null;
  notas?: string | null;
  metodoPago?: MetodoPago | null;
  recibido?: number | null;
  /** Nombre del mesero que tomo la orden */
  mesero?: string | null;
  /** Nombre del cajero que cobro */
  cajero?: string | null;
  atendio?: string | null;
  fecha: Date;
  totales: Totales;
  /** Segunda copia: el spec exige marcarla como COPIA */
  reimpresion?: boolean;
  /** cliente | precuenta (antes de cobrar) | cocina (sin precios) */
  documento?: TipoDocumento;
  negocio?: DatosNegocio;
  ancho?: AnchoPapel;
  /** Centavos de C$ por 1 US$, para el equivalente en dolares */
  tipoCambio?: number;
}

interface Maqueta {
  columnas: number;
  anchoCant: number;
  anchoImporte: number;
  anchoNombre: number;
  sangria: string;
}

function maqueta(columnas: number): Maqueta {
  const anchoCant = columnas >= 48 ? 3 : 2;
  const anchoImporte = columnas >= 48 ? 12 : 9;
  return {
    columnas,
    anchoCant,
    anchoImporte,
    anchoNombre: columnas - anchoCant - 1 - anchoImporte,
    sangria: " ".repeat(anchoCant + 1),
  };
}

function lineasItem(
  m: Maqueta,
  cantidad: number,
  nombre: string,
  importe: string | null
): string[] {
  const partes = envolver(nombre, m.anchoNombre);
  const out: string[] = [];
  const cant = String(cantidad).padStart(m.anchoCant).slice(-m.anchoCant);

  out.push(
    importe === null
      ? `${cant} ${partes[0]}`
      : `${cant} ${partes[0].padEnd(m.anchoNombre)}${importe.padStart(m.anchoImporte)}`
  );
  for (const p of partes.slice(1)) out.push(m.sangria + p);
  return out;
}

const fechaCorta = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ` +
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const fechaLarga = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/` +
  `${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

// ---------------------------------------------------------------- cocina ---
function construirCocina(d: DatosTicket, p: EscPos, m: Maqueta): void {
  const tipo = TIPOS_ORDEN.find((t) => t.valor === d.tipo)!;

  p.alinear(1).tamano(1, 1).negrita(true);
  p.linea(`#${d.numero}`);
  p.tamano(0, 0);
  p.linea(tipo.corto + (d.tipo === "mesa" && d.mesa ? ` ${d.mesa}` : ""));
  p.negrita(false).alinear(0);
  p.linea(parLineado(fechaCorta(d.fecha), d.mesero ?? "", m.columnas));
  p.separador("=");

  for (const l of d.totales.lineas) {
    p.tamano(0, 1).negrita(true);
    for (const t of lineasItem(m, l.cantidad, l.nombre, null)) p.linea(t);
    p.tamano(0, 0).negrita(false);
    for (const mod of l.modificadores ?? []) {
      for (const t of envolver(`+ ${mod.nombre}`, m.columnas - m.sangria.length))
        p.linea(m.sangria + t);
    }
    if (l.notas)
      for (const t of envolver(`>> ${l.notas}`, m.columnas - m.sangria.length))
        p.linea(m.sangria + t);
  }

  if (d.notas) {
    p.separador();
    p.negrita(true).linea("NOTA:").negrita(false);
    for (const t of envolver(d.notas, m.columnas)) p.linea(t);
  }
  p.separador("=");
}

// ------------------------------------------------- cliente y pre-cuenta ---
function construirCliente(d: DatosTicket, p: EscPos, m: Maqueta): void {
  const t = d.totales;
  const neg = d.negocio ?? NEGOCIO;
  const tipo = TIPOS_ORDEN.find((x) => x.valor === d.tipo)!;
  const esPrecuenta = d.documento === "precuenta";

  // 1. Encabezado
  p.alinear(1).negrita(true).tamano(1, 1);
  p.linea(neg.nombre);
  p.tamano(0, 0).negrita(false);
  if (neg.ruc) p.linea(`RUC: ${neg.ruc}`);
  if (neg.direccion) for (const l of envolver(neg.direccion, m.columnas)) p.linea(l);
  if (neg.telefono) p.linea(`Tel: ${neg.telefono}`);

  if (esPrecuenta) p.negrita(true).linea("*** PRE-CUENTA ***").negrita(false);
  else if (d.reimpresion) p.negrita(true).linea("*** COPIA ***").negrita(false);

  p.alinear(0).separador("=");

  // 2. Datos de la orden
  p.linea(parLineado(
    esPrecuenta ? `Pre-cuenta #${String(d.numero).padStart(4, "0")}`
                : `Recibo #${String(d.numero).padStart(4, "0")}`,
    fechaLarga(d.fecha), m.columnas));
  p.linea(`Tipo: ${tipo.corto}${d.tipo === "mesa" && d.mesa ? ` ${d.mesa}` : ""}`);
  if (d.mesero) p.linea(`Mesero: ${d.mesero}`);
  if (d.cajero && !esPrecuenta) p.linea(`Cajero: ${d.cajero}`);
  if (!d.mesero && !d.cajero && d.atendio) p.linea(`Atendió: ${d.atendio}`);

  // 3. Datos del cliente (delivery)
  if (d.cliente) for (const l of envolver(`Cliente: ${d.cliente}`, m.columnas)) p.linea(l);
  if (d.telefonoCliente) p.linea(`Tel: ${d.telefonoCliente}`);
  if (d.direccion) for (const l of envolver(`Dir: ${d.direccion}`, m.columnas)) p.linea(l);
  p.separador();

  // 4. Detalle
  p.linea(parLineado("CANT PRODUCTO", "IMPORTE", m.columnas));
  for (const l of t.lineas) {
    for (const s of lineasItem(m, l.cantidad, l.nombre, fmt(l.bruto))) p.linea(s);
    // Precio unitario, exigido por el spec. Se muestra cuando aporta algo.
    if (l.cantidad > 1) p.linea(m.sangria + `${l.cantidad} x ${fmt(l.precioUnit)}`);
    for (const mod of l.modificadores ?? []) {
      p.linea(parLineado(
        m.sangria + `+ ${mod.nombre}`,
        mod.precio > 0 ? fmt(mod.precio * l.cantidad) : "", m.columnas));
    }
    if (l.notas)
      for (const s of envolver(`> ${l.notas}`, m.columnas - m.sangria.length))
        p.linea(m.sangria + s);
    if (l.aplicaIva === false) p.linea(m.sangria + "(exento de IVA)");
    if (l.descTotal > 0)
      p.linea(parLineado(m.sangria + "desc.", `-${fmt(l.descTotal)}`, m.columnas));
  }
  p.separador();

  // 5. Totales
  p.linea(parLineado("Subtotal", fmt(t.subtotalBruto), m.columnas));
  if (t.descLineas > 0) p.linea(parLineado("Desc. por línea", `-${fmt(t.descLineas)}`, m.columnas));
  if (t.descPizzas > 0) p.linea(parLineado("Desc. pizzas", `-${fmt(t.descPizzas)}`, m.columnas));
  if (t.descBebidas > 0) p.linea(parLineado("Desc. bebidas", `-${fmt(t.descBebidas)}`, m.columnas));
  if (t.descGeneral > 0) p.linea(parLineado("Desc. general", `-${fmt(t.descGeneral)}`, m.columnas));
  if (t.baseExenta > 0) p.linea(parLineado("Base exenta", fmt(t.baseExenta), m.columnas));
  p.linea(parLineado("Base gravable", fmt(t.baseGravable), m.columnas));
  p.linea(parLineado("IVA 15%", fmt(t.iva), m.columnas));
  if (t.costoEnvio > 0) p.linea(parLineado("Envío", fmt(t.costoEnvio), m.columnas));
  if (t.propina > 0) p.linea(parLineado("Propina", fmt(t.propina), m.columnas));

  p.separador();
  p.negrita(true).tamano(1, 1);
  // A doble ancho solo entran la mitad de las columnas.
  p.linea(parLineado("TOTAL", fmt(t.total), Math.floor(m.columnas / 2)));
  p.tamano(0, 0).negrita(false);

  // 6. Equivalente en US$
  if (t.totalUsd != null) {
    p.linea(parLineado("Equivale a US$", fmt(t.totalUsd), m.columnas));
    if (d.tipoCambio) p.linea(parLineado("T/C", fmt(d.tipoCambio), m.columnas));
  }
  p.separador();

  // 7. Pago (la pre-cuenta no lo lleva: todavia no se cobro)
  if (!esPrecuenta && d.metodoPago) {
    const etiquetas: Record<MetodoPago, string> = {
      efectivo: "Efectivo", tarjeta: "Tarjeta",
      transferencia: "Transferencia", mixto: "Mixto",
    };
    p.linea(`Pago: ${etiquetas[d.metodoPago]}`);
    if (d.metodoPago === "efectivo" && d.recibido != null && d.recibido > 0) {
      p.linea(parLineado("Recibido:", fmt(d.recibido), m.columnas));
      p.linea(parLineado("Vuelto:", fmt(Math.max(0, d.recibido - t.total)), m.columnas));
    }
  }

  if (esPrecuenta) {
    p.alinear(1).linea("No es comprobante de pago").alinear(0);
  }

  if (d.notas) {
    p.separador();
    for (const l of envolver(`Nota: ${d.notas}`, m.columnas)) p.linea(l);
  }

  // 8. Pie + leyenda fiscal obligatoria
  p.nl();
  p.alinear(1);
  if (neg.pie) p.linea(neg.pie);
  for (const l of envolver(LEYENDA_FISCAL, m.columnas)) p.linea(centrar(l, m.columnas).trimStart());
  p.alinear(0);
}

/** Devuelve los bytes ESC/POS listos para mandar a la impresora. */
export function construirTicket(
  d: DatosTicket,
  opts: { codepage?: number; transliterar?: boolean } = {}
): Uint8Array {
  const ancho = d.ancho ?? 58;
  const p = new EscPos({ ...opts, ancho }).init();
  const m = maqueta(columnasPara(ancho));

  if (d.documento === "cocina") construirCocina(d, p, m);
  else construirCliente(d, p, m);

  // Sin cortador automatico: se avanza para pasar la barra de corte manual.
  p.avanzar(4);
  return p.bytes();
}

/** Vista previa en pantalla, con el mismo ancho que el papel. */
export function previsualizarTicket(d: DatosTicket): string {
  const bytes = construirTicket(d, { transliterar: false });
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x1b || b === 0x1d) {
      if (b === 0x1b && bytes[i + 1] === 0x40) { i += 1; continue; }
      if (b === 0x1b && [0x61, 0x45, 0x74, 0x64].includes(bytes[i + 1])) { i += 2; continue; }
      if (b === 0x1d && bytes[i + 1] === 0x21) { i += 2; continue; }
      continue;
    }
    out += b === 0x0a ? "\n" : String.fromCharCode(b);
  }
  return out;
}

/** Ticket de prueba para verificar codepage y alineacion en la impresora. */
export function ticketPrueba(codepage: number, ancho: AnchoPapel = 58): Uint8Array {
  const cols = columnasPara(ancho);
  const p = new EscPos({ codepage, ancho }).init();
  p.alinear(1).negrita(true).linea(`PRUEBA ${ancho}mm`).negrita(false).alinear(0);
  p.linea(`Codepage: ${codepage} · ${cols} columnas`);
  p.separador("=");
  p.linea("1234567890".repeat(Math.ceil(cols / 10)).slice(0, cols));
  p.linea("Si la línea de arriba llega justo");
  p.linea("al borde, el ancho está bien.");
  p.separador();
  p.linea("Sin tilde: Jamon Pina Espanola");
  p.linea("Con tilde: Jamón Piña Española");
  p.linea("Eñe: Toña ñ Ñ - ¿Bien? ¡Sí!");
  p.separador();
  p.linea(parLineado("TOTAL", "1,463.50", cols));
  p.avanzar(4);
  return p.bytes();
}
