import {
  CODEPAGES, CODEPAGE_DEFAULT, EscPos, centrar, columnasPara, desdeBytes,
  envolver, parLineado, type AnchoPapel,
} from "./escpos";
import { fmtPlano as fmt } from "./money";
import { TIPOS_ORDEN, etiquetaPago, type MetodoPago, type TipoOrden, type Totales } from "./types";

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
  telefono: "0000-0000",
  direccion: "",
  ruc: "",
  pie: "",
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
  /** Porcentaje de propina que se imprime en la etiqueta. */
  propinaPct?: number;
  /** false quita "no es factura fiscal". Por defecto se imprime. */
  mostrarLeyendaFiscal?: boolean;
}

interface Maqueta {
  columnas: number;
  anchoCant: number;
  anchoImporte: number;
  anchoNombre: number;
  sangria: string;
}

function maqueta(columnas: number): Maqueta {
  const anchoCant = 2;
  const anchoImporte = columnas >= 48 ? 12 : 9;
  return {
    columnas,
    anchoCant,
    anchoImporte,
    anchoNombre: columnas - anchoCant - 1 - anchoImporte,
    sangria: " ".repeat(anchoCant + 1),
  };
}

/**
 * "2  Diabla                600.00"
 *
 * La cantidad va a la izquierda y el importe en la ULTIMA linea del nombre,
 * no en la primera: cuando el nombre se parte en dos, el monto queda pegado
 * al final del producto y no flotando sobre su continuacion.
 */
function lineasItem(
  m: Maqueta,
  cantidad: number,
  nombre: string,
  importe: string | null
): string[] {
  const partes = envolver(nombre, m.anchoNombre);
  const cant = String(cantidad).padEnd(m.anchoCant).slice(0, m.anchoCant);

  return partes.map((parte, i) => {
    const prefijo = i === 0 ? `${cant} ` : m.sangria;
    const esUltima = i === partes.length - 1;
    if (importe === null || !esUltima) return prefijo + parte;
    return prefijo + parte.padEnd(m.anchoNombre) + importe.padStart(m.anchoImporte);
  });
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
    for (const t of lineasItem(m, l.cantidad, l.mitades ? "MITAD Y MITAD" : l.nombre, null))
      p.linea(t);

    // Una mitad y mitad mal leida cuesta una pizza rehecha, asi que en la
    // comanda va a doble altura y separada, no como una nota mas.
    if (l.mitades) {
      p.separador("-");
      for (const [i, mitad] of l.mitades.entries()) {
        p.tamano(0, 1).negrita(true);
        for (const t of envolver(`${i === 0 ? "1a" : "2a"} MITAD: ${mitad.nombre}`, m.columnas))
          p.linea(t);
        p.tamano(0, 0).negrita(false);
      }
      p.separador("-");
    }
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

/**
 * Alinea una columna de montos: "C$ 1285.00", "C$   50.00".
 * El ancho sale del monto mas largo de ESTE recibo, asi los decimales quedan
 * en la misma columna aunque haya cifras de cuatro digitos.
 */
function columnaMontos(montos: number[]): (n: number) => string {
  const ancho = Math.max(...montos.map((m) => fmt(m).length), 6);
  return (n: number) => `C$ ${fmt(n).padStart(ancho)}`;
}

function construirCliente(d: DatosTicket, p: EscPos, m: Maqueta): void {
  const t = d.totales;
  const neg = d.negocio ?? NEGOCIO;
  const tipo = TIPOS_ORDEN.find((x) => x.valor === d.tipo)!;
  const esPrecuenta = d.documento === "precuenta";

  // 1. Encabezado
  p.separador("=");
  p.alinear(1).negrita(true);
  p.linea(neg.nombre);
  p.negrita(false);
  if (neg.telefono) p.linea(`Tel: ${neg.telefono}`);
  if (neg.direccion) for (const l of envolver(neg.direccion, m.columnas)) p.linea(l);
  if (neg.ruc) p.linea(`RUC: ${neg.ruc}`);

  if (esPrecuenta) p.negrita(true).linea("*** PRE-CUENTA ***").negrita(false);
  else if (d.reimpresion) p.negrita(true).linea("*** COPIA ***").negrita(false);
  p.alinear(0).separador();

  // 2. Datos de la orden
  p.linea(parLineado(
    `Orden #${String(d.numero).padStart(4, "0")}`,
    fechaCorta(d.fecha), m.columnas));
  p.linea(`Tipo: ${tipo.corto}${d.tipo === "mesa" && d.mesa ? ` ${d.mesa}` : ""}`);
  if (d.mesero) p.linea(`Mesero: ${d.mesero}`);
  if (d.cajero && !esPrecuenta) p.linea(`Cajero: ${d.cajero}`);
  if (!d.mesero && !d.cajero && d.atendio) p.linea(`Atendió: ${d.atendio}`);
  if (d.cliente) for (const l of envolver(`Cliente: ${d.cliente}`, m.columnas)) p.linea(l);
  if (d.telefonoCliente) p.linea(`Tel: ${d.telefonoCliente}`);
  if (d.direccion) for (const l of envolver(`Dir: ${d.direccion}`, m.columnas)) p.linea(l);
  p.separador();

  // 3. Detalle
  p.linea(parLineado("CANT PRODUCTO", "IMPORTE", m.columnas));
  for (const l of t.lineas) {
    // En una mitad y mitad el nombre combinado se parte feo en 32 columnas.
    // Encabeza "MITAD Y MITAD" y las dos mitades van debajo, sangradas.
    const encabezado = l.mitades ? "MITAD Y MITAD" : l.nombre;
    for (const s of lineasItem(m, l.cantidad, encabezado, fmt(l.bruto))) p.linea(s);
    for (const mitad of l.mitades ?? []) {
      for (const s of envolver(`1/2 ${mitad.nombre}`, m.columnas - m.sangria.length))
        p.linea(m.sangria + s);
    }
    for (const mod of l.modificadores ?? []) {
      p.linea(parLineado(
        m.sangria + `+ ${mod.nombre}`,
        mod.precio > 0 ? fmt(mod.precio * l.cantidad) : "", m.columnas));
    }
    if (l.notas)
      for (const s of envolver(`> ${l.notas}`, m.columnas - m.sangria.length))
        p.linea(m.sangria + s);
    if (l.descTotal > 0)
      p.linea(parLineado(m.sangria + "desc.", `-${fmt(l.descTotal)}`, m.columnas));
  }
  p.separador();

  // 4. Totales, en una sola columna de montos alineada
  const filas: [string, number][] = [["Subtotal", t.subtotalBruto]];
  if (t.descLineas > 0) filas.push(["Desc. por línea", -t.descLineas]);
  if (t.descPizzas > 0) filas.push(["Desc. pizzas", -t.descPizzas]);
  if (t.descBebidas > 0) filas.push(["Desc. bebidas", -t.descBebidas]);
  if (t.descGeneral > 0) filas.push(["Desc. general", -t.descGeneral]);
  // El IVA se imprime cuando existe: sin esta línea el total no cuadra con
  // los productos y el cliente pregunta de dónde sale la diferencia.
  if (t.iva > 0) filas.push([`IVA ${t.ivaPct}%`, t.iva]);
  if (t.costoEnvio > 0) filas.push(["Envío", t.costoEnvio]);
  if (t.propina > 0) filas.push([`Propina ${d.propinaPct ?? 10}%`, t.propina]);
  filas.push(["TOTAL", t.total]);

  const mon = columnaMontos(filas.map(([, v]) => Math.abs(v)));
  for (const [etiqueta, valor] of filas) {
    if (etiqueta === "TOTAL") p.negrita(true);
    p.linea(parLineado(etiqueta, mon(valor), m.columnas));
    if (etiqueta === "TOTAL") p.negrita(false);
  }

  if (t.totalUsd != null) p.linea(parLineado("Equivale a US$", fmt(t.totalUsd), m.columnas));
  p.separador();

  // 5. Pago (la pre-cuenta no lo lleva: todavía no se cobró)
  if (!esPrecuenta && d.metodoPago) {
    p.linea(`Pago: ${etiquetaPago(d.metodoPago)}`);
    if (d.metodoPago === "efectivo" && d.recibido != null && d.recibido > 0) {
      const cambio = Math.max(0, d.recibido - t.total);
      const mp = columnaMontos([d.recibido, cambio]);
      p.linea("Recibido: ".padEnd(10) + mp(d.recibido));
      p.linea("Cambio:".padEnd(10) + mp(cambio));
    }
  }

  if (esPrecuenta) {
    p.alinear(1).linea("No es comprobante de pago").alinear(0);
  }

  if (d.notas) {
    p.separador();
    for (const l of envolver(`Nota: ${d.notas}`, m.columnas)) p.linea(l);
  }

  // 6. Pie y leyenda. Se puede apagar desde settings, pero por defecto va:
  // imprimir algo que parece fiscal sin serlo es un riesgo real.
  if (neg.pie || d.mostrarLeyendaFiscal !== false) {
    p.nl();
    p.alinear(1);
    if (neg.pie) p.linea(neg.pie);
    if (d.mostrarLeyendaFiscal !== false)
      for (const l of envolver(LEYENDA_FISCAL, m.columnas)) p.linea(l);
    p.alinear(0);
  }
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

/**
 * Vista previa en pantalla, con el mismo ancho que el papel.
 *
 * Interpreta ESC a (alineacion) en vez de descartarlo: si no, el encabezado
 * se ve pegado a la izquierda en la app y centrado en el papel, y la caja
 * aprueba un recibo que no es el que sale.
 */
export function previsualizarTicket(d: DatosTicket, codepage = CODEPAGE_DEFAULT): string {
  const cols = columnasPara(d.ancho ?? 58);
  const bytes = construirTicket(d, { transliterar: false, codepage });

  const lineas: string[] = [];
  let actual = "";
  let alineacion: 0 | 1 | 2 = 0;

  const volcar = () => {
    if (alineacion === 1) lineas.push(centrar(actual, cols).trimEnd());
    else if (alineacion === 2) lineas.push(actual.padStart(cols));
    else lineas.push(actual);
    actual = "";
  };

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x1b) {
      const cmd = bytes[i + 1];
      if (cmd === 0x40) { i += 1; continue; }            // init
      if (cmd === 0x61) { alineacion = bytes[i + 2] as 0 | 1 | 2; i += 2; continue; }
      if (cmd === 0x64) {                                 // avanzar n lineas
        volcar();
        for (let k = 0; k < bytes[i + 2]; k++) lineas.push("");
        i += 2;
        continue;
      }
      if (cmd === 0x45 || cmd === 0x74) { i += 2; continue; } // negrita, codepage
      continue;
    }
    if (b === 0x1d && bytes[i + 1] === 0x21) { i += 2; continue; } // tamano
    if (b === 0x0a) { volcar(); continue; }
    actual += desdeBytes([b], codepage);
  }
  if (actual) volcar();

  return lineas.join("\n");
}

/**
 * HOJA DE DIAGNOSTICO
 *
 * Imprime el MISMO texto en espanol con los tres codepages, uno debajo del
 * otro, en una sola pasada. En vez de probar de a uno y comparar de memoria,
 * se mira el papel y se ve cual bloque se lee bien.
 *
 * Cada bloque se arma con su propio encoder, porque los bytes de la ñ son
 * distintos en cada codepage (0xF1 en CP1252, 0xA4 en CP437 y CP850).
 */
export function hojaCodepages(ancho: AnchoPapel = 58): Uint8Array {
  const cols = columnasPara(ancho);
  const bytes: number[] = [];

  const cabecera = new EscPos({ codepage: 0, ancho }).init();
  cabecera.alinear(1).negrita(true).linea("PRUEBA DE ACENTOS");
  cabecera.negrita(false).linea(`${ancho}mm - ${cols} columnas`).alinear(0);
  cabecera.linea("Mira cual bloque se lee bien");
  cabecera.linea("y elegi ese numero en la app.");
  bytes.push(...cabecera.bytes());

  for (const cp of CODEPAGES) {
    // Encoder propio por bloque: mismo texto, bytes distintos.
    const p = new EscPos({ codepage: cp.n, ancho });
    p.separador("=");
    p.negrita(true).linea(`>>> OPCION ${cp.n}`).negrita(false);
    p.linea(cp.nombre);
    p.separador("-");
    p.linea("Toña  Jamón  Piña");
    p.linea("Española  Champiñón");
    p.linea("¿Cuántos? ¡Sí! Año Niño");
    p.linea("MAYUSCULAS: ÑOÑO ÁÉÍÓÚ");
    p.nl();
    bytes.push(...p.bytes());
  }

  const pie = new EscPos({ codepage: 0, ancho });
  pie.separador("=");
  pie.alinear(1);
  pie.linea("Si ninguno se lee bien,");
  pie.linea("activa 'quitar acentos'.");
  pie.alinear(0);
  pie.avanzar(4);
  bytes.push(...pie.bytes());

  return new Uint8Array(bytes);
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
