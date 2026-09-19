import { EscPos, COLUMNAS, centrar, envolver, parLineado } from "./escpos";
import { fmt } from "./money";
import { TIPOS_ORDEN, type MetodoPago, type TipoOrden, type Totales } from "./types";

export interface DatosNegocio {
  nombre: string;
  telefono?: string;
  direccion?: string;
  ruc?: string;
  pie?: string;
}

export const NEGOCIO: DatosNegocio = {
  nombre: "ROCK MUNCHIES",
  telefono: "",
  direccion: "",
  ruc: "",
  pie: "Gracias por su compra!",
};

export interface DatosTicket {
  numero: number;
  tipo: TipoOrden;
  mesa?: string | null;
  cliente?: string | null;
  telefonoCliente?: string | null;
  direccion?: string | null;
  notas?: string | null;
  metodoPago?: MetodoPago | null;
  recibido?: number | null; // centavos
  atendio?: string | null;
  fecha: Date;
  totales: Totales;
  /** Segunda copia con el sello REIMPRESION */
  reimpresion?: boolean;
  /** Ticket de cocina: sin precios, letra grande */
  cocina?: boolean;
}

// Maqueta de la linea de item:
//   "12 Nombre del producto  1,234.56"
//    ^^ ^                    ^
//    |  | nombre (20)        | importe (9, derecha)
//    | cantidad (2) + espacio
const ANCHO_CANT = 2;
const ANCHO_IMPORTE = 9;
const ANCHO_NOMBRE = COLUMNAS - ANCHO_CANT - 1 - ANCHO_IMPORTE; // 20
const SANGRIA = " ".repeat(ANCHO_CANT + 1);

function lineasItem(
  cantidad: number,
  nombre: string,
  importe: string | null
): string[] {
  const partes = envolver(nombre, ANCHO_NOMBRE);
  const out: string[] = [];

  const cant = String(cantidad).padStart(ANCHO_CANT).slice(-ANCHO_CANT);
  const primera = partes[0].padEnd(ANCHO_NOMBRE);
  out.push(
    importe === null
      ? `${cant} ${partes[0]}`
      : `${cant} ${primera}${importe.padStart(ANCHO_IMPORTE)}`
  );

  for (const p of partes.slice(1)) out.push(SANGRIA + p);
  return out;
}

const fechaCorta = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ` +
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Ticket de cocina: sin precios, nombres grandes, para la plancha/horno. */
function construirCocina(d: DatosTicket, p: EscPos): void {
  const tipo = TIPOS_ORDEN.find((t) => t.valor === d.tipo)!;

  p.alinear(1).tamano(1, 1).negrita(true);
  p.linea(`#${d.numero}`);
  p.tamano(0, 0);
  p.linea(tipo.corto + (d.tipo === "mesa" && d.mesa ? ` ${d.mesa}` : ""));
  p.negrita(false).alinear(0);
  p.linea(fechaCorta(d.fecha));
  p.separador("=");

  for (const l of d.totales.lineas) {
    p.tamano(0, 1).negrita(true);
    for (const t of lineasItem(l.cantidad, l.nombre, null)) p.linea(t);
    p.tamano(0, 0).negrita(false);
    if (l.notas)
      for (const t of envolver(`>> ${l.notas}`, COLUMNAS - SANGRIA.length))
        p.linea(SANGRIA + t);
  }

  if (d.notas) {
    p.separador();
    p.negrita(true).linea("NOTA:").negrita(false);
    for (const t of envolver(d.notas, COLUMNAS)) p.linea(t);
  }
  p.separador("=");
}

/** Ticket de cliente: detalle completo con descuentos, IVA y propina. */
function construirCliente(d: DatosTicket, p: EscPos): void {
  const t = d.totales;
  const tipo = TIPOS_ORDEN.find((x) => x.valor === d.tipo)!;

  // Encabezado
  p.alinear(1).negrita(true).tamano(1, 1);
  p.linea(NEGOCIO.nombre);
  p.tamano(0, 0).negrita(false);
  if (NEGOCIO.telefono) p.linea(`Tel: ${NEGOCIO.telefono}`);
  if (NEGOCIO.direccion) for (const l of envolver(NEGOCIO.direccion, COLUMNAS)) p.linea(l);
  if (NEGOCIO.ruc) p.linea(`RUC: ${NEGOCIO.ruc}`);

  if (d.reimpresion) {
    p.negrita(true).linea("** REIMPRESION **").negrita(false);
  }
  p.alinear(0).separador("=");

  // Datos de la orden
  p.linea(parLineado(`Orden #${String(d.numero).padStart(4, "0")}`, fechaCorta(d.fecha)));
  p.linea(`Tipo: ${tipo.corto}${d.tipo === "mesa" && d.mesa ? ` ${d.mesa}` : ""}`);
  if (d.cliente) for (const l of envolver(`Cliente: ${d.cliente}`, COLUMNAS)) p.linea(l);
  if (d.telefonoCliente) p.linea(`Tel: ${d.telefonoCliente}`);
  if (d.direccion) for (const l of envolver(`Dir: ${d.direccion}`, COLUMNAS)) p.linea(l);
  if (d.atendio) p.linea(`Atendio: ${d.atendio}`);
  p.separador();

  // Items
  p.linea(parLineado("CANT PRODUCTO", "IMPORTE"));
  for (const l of t.lineas) {
    for (const s of lineasItem(l.cantidad, l.nombre, fmt(l.bruto))) p.linea(s);
    if (l.notas)
      for (const s of envolver(`> ${l.notas}`, COLUMNAS - SANGRIA.length))
        p.linea(SANGRIA + s);
    if (l.descTotal > 0) {
      p.linea(parLineado(SANGRIA + "desc.", `-${fmt(l.descTotal)}`));
    }
  }
  p.separador();

  // Totales
  p.linea(parLineado("Subtotal", fmt(t.subtotalBruto)));
  if (t.descPizzas > 0) p.linea(parLineado("Desc. pizzas", `-${fmt(t.descPizzas)}`));
  if (t.descBebidas > 0) p.linea(parLineado("Desc. bebidas", `-${fmt(t.descBebidas)}`));
  if (t.descGeneral > 0) p.linea(parLineado("Desc. general", `-${fmt(t.descGeneral)}`));
  if (t.descTotal > 0) p.linea(parLineado("Base gravable", fmt(t.baseProductos)));
  if (t.costoEnvio > 0) p.linea(parLineado("Envio", fmt(t.costoEnvio)));
  p.linea(parLineado("IVA 15%", fmt(t.iva)));
  if (t.propina > 0) p.linea(parLineado("Propina 10%", fmt(t.propina)));

  p.separador();
  p.negrita(true).tamano(1, 1);
  // A doble ancho solo caben 16 columnas.
  p.linea(parLineado("TOTAL", fmt(t.total), 16));
  p.tamano(0, 0).negrita(false);
  p.separador();

  // Pago
  if (d.metodoPago) {
    const etiquetas: Record<MetodoPago, string> = {
      efectivo: "Efectivo",
      tarjeta: "Tarjeta",
      transferencia: "Transferencia",
      mixto: "Mixto",
    };
    p.linea(`Pago: ${etiquetas[d.metodoPago]}`);
    if (d.metodoPago === "efectivo" && d.recibido != null && d.recibido > 0) {
      p.linea(parLineado("Recibido:", fmt(d.recibido)));
      p.linea(parLineado("Cambio:", fmt(Math.max(0, d.recibido - t.total))));
    }
  }

  if (d.notas) {
    p.separador();
    for (const l of envolver(`Nota: ${d.notas}`, COLUMNAS)) p.linea(l);
  }

  if (NEGOCIO.pie) {
    p.nl();
    p.alinear(1).linea(NEGOCIO.pie).alinear(0);
  }
}

/** Devuelve los bytes ESC/POS listos para mandar por Bluetooth. */
export function construirTicket(
  d: DatosTicket,
  opts: { codepage?: number; transliterar?: boolean } = {}
): Uint8Array {
  const p = new EscPos(opts).init();
  if (d.cocina) construirCocina(d, p);
  else construirCliente(d, p);
  // Sin cortador: se avanza para que el papel pase la barra de corte manual.
  p.avanzar(4);
  return p.bytes();
}

/** Vista previa en pantalla, mismas 32 columnas que el papel. */
export function previsualizarTicket(d: DatosTicket): string {
  const bytes = construirTicket(d, { transliterar: false });
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x1b || b === 0x1d) {
      // saltar comandos de control para que la vista previa sea legible
      if (b === 0x1b && [0x40].includes(bytes[i + 1])) { i += 1; continue; }
      if (b === 0x1b && [0x61, 0x45, 0x74, 0x64].includes(bytes[i + 1])) { i += 2; continue; }
      if (b === 0x1d && bytes[i + 1] === 0x21) { i += 2; continue; }
      continue;
    }
    out += b === 0x0a ? "\n" : String.fromCharCode(b);
  }
  return out;
}

/** Ticket de prueba para verificar codepage y alineacion en la PT-210. */
export function ticketPrueba(codepage: number): Uint8Array {
  const p = new EscPos({ codepage }).init();
  p.alinear(1).negrita(true).linea("PRUEBA PT-210").negrita(false).alinear(0);
  p.linea(`Codepage: ${codepage}`);
  p.separador("=");
  p.linea("12345678901234567890123456789012");
  p.linea("Si esta linea llega justo al");
  p.linea("borde, las 32 columnas cuadran.");
  p.separador();
  p.linea("Acentos: Jamon Pina Espanola");
  p.linea("Acentos: Jamón Piña Española");
  p.linea("Enie: Toña ñ Ñ - ¿Bien? ¡Si!");
  p.separador();
  p.linea(parLineado("TOTAL", "1,463.50"));
  p.avanzar(4);
  return p.bytes();
}
