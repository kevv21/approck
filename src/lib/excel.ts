"use client";

// ExcelJS pesa ~250 kB. Se carga solo cuando alguien exporta.
import type ExcelJSTypes from "exceljs";
import { aCordobas } from "./money";
import { METODOS_PAGO, TIPOS_ORDEN, etiquetaPago, type MetodoPago, type TipoOrden } from "./types";

export interface FilaOrden {
  numero: number;
  created_at: string;
  tipo: TipoOrden;
  mesa: string | null;
  cliente: string | null;
  mesero: string | null;
  metodo_pago: MetodoPago | null;
  estado: string;
  subtotal_bruto: number;
  desc_total: number;
  desc_motivo: string | null;
  /** Quitada del historial: no entra al cierre ni a esta hoja. */
  oculta_por?: string | null;
  oculta_motivo?: string | null;
  costo_envio: number;
  iva: number;
  propina: number;
  total: number;
  items: {
    nombre_snapshot: string;
    cantidad: number;
    precio_snapshot: number;
    neto: number;
    /** IVA que aporta esta línea. 0 en productos exentos. */
    iva?: number | null;
  }[];
}

export interface DatosCierre {
  desde: Date;
  hasta: Date;
  turno?: {
    numero?: number | null;
    abierto_por: string;
    fondo_inicial: number;
    efectivo_contado: number | null;
    /** Total vendido por PedidosYa, anotado a mano al cerrar la caja. */
    ventas_pedidosya?: number | null;
  } | null;
  ordenes: FilaOrden[];
}

// Estilo de la casa, el mismo de Plantilla_Inventario.xlsx.
const AZUL = "FF2A3F54";
const BORDE = "FFDDDDDD";
const MONEDA = '"C$" #,##0.00';

const bordeFino = () =>
  ({
    top: { style: "thin", color: { argb: BORDE } },
    left: { style: "thin", color: { argb: BORDE } },
    bottom: { style: "thin", color: { argb: BORDE } },
    right: { style: "thin", color: { argb: BORDE } },
  }) as ExcelJSTypes.Borders;

const dosDigitos = (n: number) => String(n).padStart(2, "0");
const dia = (d: Date) => `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}/${d.getFullYear()}`;
const hora = (d: Date) => `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;

/**
 * Cierre de caja en una sola hoja, al estilo de Rock Munchies.
 *
 * Tres bloques, en este orden:
 *   1. Encabezado con el nombre, el día y la hora
 *   2. Consumibles: qué se vendió y cuánto
 *   3. Forma de pago: efectivo, Banpro, BAC
 *   4. PedidosYa aparte, porque esa plata no entra a la caja el mismo día
 *
 * Los totales van como FÓRMULAS de Excel, no como valores fijos: así quien
 * revise la hoja puede tocar una celda y ver el total recalcularse, en vez
 * de tener que confiar en un número que alguien escribió.
 */
export async function generarCierreExcel(d: DatosCierre): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "APPROCK";
  wb.created = new Date();

  const ws = wb.addWorksheet("Cierre");
  // Seis columnas desde que el IVA va desglosado en los consumibles. Los
  // bloques de abajo (pagos, arqueo) siguen usando cuatro y se fusionan hasta
  // la F para que la hoja se vea de una pieza al imprimirla.
  ws.columns = [
    { width: 10 }, { width: 34 }, { width: 15 },
    { width: 15 }, { width: 13 }, { width: 15 },
  ];

  const pagadas = d.ordenes.filter((o) => o.estado === "pagada");
  const anuladas = d.ordenes.filter((o) => o.estado === "anulada");

  // --- helpers de maquetado ------------------------------------------------
  const tituloBloque = (texto: string) => {
    const r = ws.addRow([texto]);
    ws.mergeCells(`A${r.number}:F${r.number}`);
    r.getCell(1).font = { name: "Arial", bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    r.getCell(1).fill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: AZUL }, bgColor: { argb: AZUL },
    };
    r.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    r.height = 20;
    return r.number;
  };

  const encabezadoTabla = (cols: string[]) => {
    const r = ws.addRow(cols);
    r.eachCell((c) => {
      c.font = { name: "Arial", bold: true, size: 10 };
      c.border = bordeFino();
      c.alignment = { horizontal: "center" };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    });
    return r.number;
  };

  // --- 1. Encabezado --------------------------------------------------------
  const t1 = ws.addRow(["ROCK MUNCHIES"]);
  ws.mergeCells(`A${t1.number}:F${t1.number}`);
  t1.getCell(1).font = { name: "Arial", bold: true, size: 16 };
  t1.getCell(1).alignment = { horizontal: "center" };
  t1.height = 24;

  const t2 = ws.addRow(["CIERRE DE CAJA"]);
  ws.mergeCells(`A${t2.number}:F${t2.number}`);
  t2.getCell(1).font = { name: "Arial", bold: true, size: 12 };
  t2.getCell(1).alignment = { horizontal: "center" };

  const fin = d.hasta > new Date() ? new Date() : d.hasta;
  const t3 = ws.addRow([`Día: ${dia(d.desde)}`, "", `Hora: ${hora(fin)}`, ""]);
  ws.mergeCells(`A${t3.number}:B${t3.number}`);
  ws.mergeCells(`C${t3.number}:F${t3.number}`);
  t3.eachCell((c) => { c.font = { name: "Arial", size: 11 }; });

  if (d.turno) {
    const t4 = ws.addRow([
      `Turno: ${d.turno.numero ?? "—"}`, "", `Abrió: ${d.turno.abierto_por}`, "",
    ]);
    ws.mergeCells(`A${t4.number}:B${t4.number}`);
    ws.mergeCells(`C${t4.number}:F${t4.number}`);
  }
  ws.addRow([]);

  // --- 2. Consumibles -------------------------------------------------------
  tituloBloque("CONSUMIBLES");
  // El IVA va en su propia columna y SUMADO en el total.
  //
  // Antes esta tabla sumaba el neto SIN IVA mientras que "total cobrado" más
  // abajo sí lo llevaba, así que los dos bloques nunca cuadraban y parecía
  // que faltaba plata. Se muestran los dos números —subtotal e IVA— porque
  // quien cuadra la caja necesita ver de dónde sale la diferencia, no solo
  // un total distinto.
  const encCons = encabezadoTabla(
    ["Cant.", "Producto", "P. unitario", "Subtotal", "IVA", "Total"]
  );

  const agg = new Map<string, {
    cant: number; precio: number; neto: number; iva: number;
  }>();
  for (const o of pagadas) {
    for (const it of o.items) {
      const a = agg.get(it.nombre_snapshot) ??
        { cant: 0, precio: aCordobas(it.precio_snapshot), neto: 0, iva: 0 };
      a.cant += it.cantidad;
      a.neto += aCordobas(it.neto);
      a.iva  += aCordobas(it.iva ?? 0);
      agg.set(it.nombre_snapshot, a);
    }
  }
  const consumibles = [...agg.entries()]
    .sort((a, b) => (b[1].neto + b[1].iva) - (a[1].neto + a[1].iva));

  const primeraCons = encCons + 1;
  for (const [nombre, a] of consumibles) {
    const fila = ws.rowCount + 1;
    // El total como FÓRMULA, no como número: si alguien corrige una cantidad
    // a mano en la hoja, el total se corrige con ella.
    const r = ws.addRow([
      a.cant, nombre, a.precio, a.neto, a.iva,
      { formula: `D${fila}+E${fila}` },
    ]);
    r.eachCell((c, i) => {
      c.border = bordeFino();
      c.font = { name: "Calibri", size: 11 };
      if (i === 1) c.alignment = { horizontal: "center" };
      if (i >= 3) c.numFmt = MONEDA;
    });
  }
  const ultimaCons = ws.rowCount;

  // Aviso necesario: consumibles cuenta TODO lo que salio de la cocina,
  // PedidosYa incluido, mientras que "total cobrado" mas abajo cuenta solo
  // lo que entro a la caja. Sin esta linea, quien revise la hoja intenta
  // cuadrar los dos bloques y cree que falta plata.
  const suma = (col: string) =>
    ({ formula: consumibles.length ? `SUM(${col}${primeraCons}:${col}${ultimaCons})` : "0" });
  const totCons = ws.addRow([
    suma("A"), "TOTAL CONSUMIBLES", "", suma("D"), suma("E"), suma("F"),
  ]);
  totCons.eachCell((c, i) => {
    c.font = { name: "Arial", bold: true, size: 11 };
    c.border = bordeFino();
    if (i === 1) c.alignment = { horizontal: "center" };
    if (i >= 3) c.numFmt = MONEDA;
  });
  const avisoCons = ws.addRow([
    "", "Solo lo cobrado en caja. Total = subtotal + IVA; no incluye envío, empaque ni propina.",
  ]);
  ws.mergeCells(`B${avisoCons.number}:F${avisoCons.number}`);
  avisoCons.getCell(2).font = { name: "Calibri", italic: true, size: 10 };
  ws.addRow([]);

  // --- 3. Forma de pago (lo que entra a la caja) ----------------------------
  tituloBloque("FORMA DE PAGO");
  const encPago = encabezadoTabla(["", "Método", "Órdenes", "Total"]);

  const porMetodo = (m: MetodoPago) => {
    const del = pagadas.filter((o) => o.metodo_pago === m);
    return { n: del.length, monto: aCordobas(del.reduce((a, o) => a + o.total, 0)) };
  };

  const primeraPago = encPago + 1;
  for (const m of METODOS_PAGO) {
    const { n, monto } = porMetodo(m.valor);
    const r = ws.addRow(["", m.etiqueta, n, monto]);
    r.eachCell((c, i) => {
      c.border = bordeFino();
      c.font = { name: "Calibri", size: 11 };
      if (i === 3) c.alignment = { horizontal: "center" };
      if (i === 4) c.numFmt = MONEDA;
    });
  }
  const ultimaPago = ws.rowCount;

  const totPago = ws.addRow([
    "", "TOTAL COBRADO",
    { formula: `SUM(C${primeraPago}:C${ultimaPago})` },
    { formula: `SUM(D${primeraPago}:D${ultimaPago})` },
  ]);
  totPago.eachCell((c, i) => {
    c.font = { name: "Arial", bold: true, size: 11 };
    c.border = bordeFino();
    if (i === 3) c.alignment = { horizontal: "center" };
    if (i === 4) c.numFmt = MONEDA;
  });

  // Cuadre: consumibles vs cobrado. La diferencia son IVA, envíos y propinas.
  const extras = aCordobas(
    pagadas.reduce((a, o) => a + o.iva + o.costo_envio + o.propina, 0)
  );
  const rExtras = ws.addRow(["", "IVA, envíos y propinas incluidos", "", extras]);
  rExtras.getCell(2).font = { name: "Calibri", italic: true, size: 10 };
  rExtras.getCell(4).numFmt = MONEDA;
  rExtras.getCell(4).font = { name: "Calibri", italic: true, size: 10 };
  ws.addRow([]);

  // --- 4. PedidosYa, aparte -------------------------------------------------
  // No es un metodo de pago: esa plata nunca pasa por la caja. Se anota el
  // total que reporta la plataforma al cerrar, y queda en su propio bloque
  // para que nadie intente cuadrarlo contra el efectivo.
  tituloBloque("PEDIDOS YA (aparte)");
  const py = aCordobas(d.turno?.ventas_pedidosya ?? 0);
  const rPy = ws.addRow(["", "Vendido por la plataforma", "", py]);
  rPy.eachCell({ includeEmpty: true }, (c, i) => {
    c.border = bordeFino();
    c.font = { name: "Calibri", size: 11 };
    if (i === 4) c.numFmt = MONEDA;
  });
  const nota = ws.addRow([
    "", "Anotado al cerrar caja. La plataforma deposita después y con comisión.",
  ]);
  ws.mergeCells(`B${nota.number}:F${nota.number}`);
  nota.getCell(2).font = { name: "Calibri", italic: true, size: 10 };
  ws.addRow([]);

  // --- 5. Arqueo de efectivo ------------------------------------------------
  if (d.turno) {
    tituloBloque("ARQUEO DE EFECTIVO");
    const fondo = aCordobas(d.turno.fondo_inicial);
    const ventasEfectivo = porMetodo("efectivo").monto;

    const f1 = ws.addRow(["", "Fondo inicial", "", fondo]);
    const f2 = ws.addRow(["", "Ventas en efectivo", "", ventasEfectivo]);
    const f3 = ws.addRow([
      "", "Efectivo esperado", "",
      { formula: `D${f1.number}+D${f2.number}` },
    ]);
    const contado = d.turno.efectivo_contado;
    const f4 = ws.addRow([
      "", "Efectivo contado", "",
      contado == null ? null : aCordobas(contado),
    ]);
    const f5 = ws.addRow([
      "", "DIFERENCIA", "",
      { formula: `D${f4.number}-D${f3.number}` },
    ]);

    for (const f of [f1, f2, f3, f4, f5]) {
      f.eachCell({ includeEmpty: true }, (c, i) => {
        c.border = bordeFino();
        c.font = { name: "Calibri", size: 11 };
        if (i === 4) c.numFmt = MONEDA;
      });
    }
    f3.getCell(2).font = { name: "Arial", bold: true, size: 11 };
    f3.getCell(4).font = { name: "Arial", bold: true, size: 11 };
    f5.getCell(2).font = { name: "Arial", bold: true, size: 11 };
    f5.getCell(4).font = { name: "Arial", bold: true, size: 11 };
    ws.addRow([]);
  }

  // --- 6. Anulaciones y descuentos -----------------------------------------
  const conDescuento = pagadas.filter((o) => o.desc_total > 0);
  if (anuladas.length > 0 || conDescuento.length > 0) {
    tituloBloque("ANULACIONES Y DESCUENTOS");
    encabezadoTabla(["Orden", "Motivo", "Tipo", "Monto"]);
    for (const o of anuladas) {
      const r = ws.addRow([o.numero, o.desc_motivo ?? "(sin motivo)", "Anulada", aCordobas(o.total)]);
      r.eachCell((c, i) => {
        c.border = bordeFino(); c.font = { name: "Calibri", size: 11 };
        if (i === 4) c.numFmt = MONEDA;
      });
    }
    for (const o of conDescuento) {
      const r = ws.addRow([o.numero, o.desc_motivo ?? "(sin motivo)", "Descuento", aCordobas(o.desc_total)]);
      r.eachCell((c, i) => {
        c.border = bordeFino(); c.font = { name: "Calibri", size: 11 };
        if (i === 4) c.numFmt = MONEDA;
      });
    }
    ws.addRow([]);
  }

  // --- 7. Por tipo de orden -------------------------------------------------
  tituloBloque("POR TIPO DE ORDEN");
  encabezadoTabla(["", "Tipo", "Órdenes", "Total"]);
  for (const t of TIPOS_ORDEN) {
    const del = pagadas.filter((o) => o.tipo === t.valor);
    const r = ws.addRow(["", t.etiqueta, del.length,
      aCordobas(del.reduce((a, o) => a + o.total, 0))]);
    r.eachCell((c, i) => {
      c.border = bordeFino(); c.font = { name: "Calibri", size: 11 };
      if (i === 3) c.alignment = { horizontal: "center" };
      if (i === 4) c.numFmt = MONEDA;
    });
  }

  // Impresión: todo en una página de ancho, con el encabezado repetido.
  ws.pageSetup = {
    paperSize: 9, orientation: "portrait",
    fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.5, header: 0.3, footer: 0.3 },
  };
  ws.headerFooter.oddFooter = "&LGenerado por APPROCK&RPágina &P de &N";

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Cierre_2026-09-19_2230.xlsx */
export function nombreArchivoCierre(fecha: Date, turno?: number | null): string {
  const f = `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
  return `Cierre_${f}_${dosDigitos(fecha.getHours())}${dosDigitos(fecha.getMinutes())}${
    turno ? `_turno${turno}` : ""
  }.xlsx`;
}

export function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { etiquetaPago };
