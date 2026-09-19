"use client";

// ExcelJS pesa ~250 kB. Se carga solo cuando alguien exporta, para que la
// pagina de cierres abra rapido en el telefono.
import type ExcelJSTypes from "exceljs";
import { aCordobas } from "./money";
import { TIPOS_ORDEN, type TipoOrden } from "./types";

export interface FilaOrden {
  numero: number;
  created_at: string;
  cerrada_at: string | null;
  tipo: TipoOrden;
  mesa: string | null;
  cliente: string | null;
  atendio: string | null;
  metodo_pago: string | null;
  estado: string;
  subtotal_bruto: number;
  desc_pizzas: number;
  desc_bebidas: number;
  desc_general: number;
  desc_total: number;
  desc_motivo: string | null;
  base_productos: number;
  costo_envio: number;
  base_gravable: number;
  iva: number;
  propina: number;
  total: number;
  items: {
    nombre_snapshot: string;
    grupo_snapshot: string;
    precio_snapshot: number;
    cantidad: number;
    bruto: number;
    desc_total: number;
    neto: number;
    notas: string | null;
  }[];
}

export interface DatosCierre {
  desde: Date;
  hasta: Date;
  turno?: { abierto_por: string; fondo_inicial: number; efectivo_contado: number | null } | null;
  ordenes: FilaOrden[];
}

const MONEDA = '"C$" #,##0.00';
const etiquetaTipo = (t: TipoOrden) =>
  TIPOS_ORDEN.find((x) => x.valor === t)?.etiqueta ?? t;

const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-NI", { hour12: false }) : "";

function encabezar(ws: ExcelJSTypes.Worksheet, fila: number) {
  const r = ws.getRow(fila);
  r.font = { bold: true, color: { argb: "FFFFFFFF" } };
  r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  r.alignment = { vertical: "middle" };
  r.height = 20;
}

export async function generarCierreExcel(d: DatosCierre): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "APPROCK";
  wb.created = new Date();

  const validas = d.ordenes.filter((o) => o.estado === "pagada");
  const anuladas = d.ordenes.filter((o) => o.estado === "anulada");
  const sum = (f: (o: FilaOrden) => number) =>
    aCordobas(validas.reduce((a, o) => a + f(o), 0));

  // ------------------------------------------------------------ Resumen ---
  const ws = wb.addWorksheet("Resumen");
  ws.columns = [{ width: 32 }, { width: 18 }, { width: 14 }];

  const bloque = (titulo: string, filas: [string, number | string, boolean?][]) => {
    const r = ws.addRow([titulo]);
    r.font = { bold: true, size: 12 };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    for (const [k, v, esMoneda] of filas) {
      const row = ws.addRow([k, v]);
      if (esMoneda !== false && typeof v === "number") row.getCell(2).numFmt = MONEDA;
    }
    ws.addRow([]);
  };

  ws.addRow(["CIERRE DE CAJA - ROCK MUNCHIES"]).font = { bold: true, size: 16 };
  ws.addRow([
    "Periodo",
    `${d.desde.toLocaleString("es-NI", { hour12: false })}  a  ${d.hasta.toLocaleString("es-NI", { hour12: false })}`,
  ]);
  ws.addRow(["Generado", new Date().toLocaleString("es-NI", { hour12: false })]);
  if (d.turno) ws.addRow(["Turno abierto por", d.turno.abierto_por]);
  ws.addRow([]);

  bloque("VENTAS", [
    ["Órdenes pagadas", validas.length, false],
    ["Órdenes anuladas", anuladas.length, false],
    ["Subtotal bruto (sin IVA)", sum((o) => o.subtotal_bruto)],
    ["Descuento pizzas", -sum((o) => o.desc_pizzas)],
    ["Descuento bebidas", -sum((o) => o.desc_bebidas)],
    ["Descuento general", -sum((o) => o.desc_general)],
    ["Descuento total", -sum((o) => o.desc_total)],
    ["Base productos", sum((o) => o.base_productos)],
    ["Costo de envío", sum((o) => o.costo_envio)],
    ["BASE GRAVABLE", sum((o) => o.base_gravable)],
    ["IVA 15%", sum((o) => o.iva)],
    ["Propina", sum((o) => o.propina)],
    ["TOTAL COBRADO", sum((o) => o.total)],
  ]);

  bloque(
    "POR TIPO DE ORDEN",
    TIPOS_ORDEN.flatMap(({ valor, etiqueta }) => {
      const del = validas.filter((o) => o.tipo === valor);
      if (del.length === 0) return [];
      return [
        [`${etiqueta} (${del.length} órdenes)`, aCordobas(del.reduce((a, o) => a + o.total, 0))] as [string, number],
      ];
    })
  );

  const metodos = [...new Set(validas.map((o) => o.metodo_pago ?? "sin registrar"))];
  bloque(
    "POR MÉTODO DE PAGO",
    metodos.map((m) => {
      const del = validas.filter((o) => (o.metodo_pago ?? "sin registrar") === m);
      return [`${m} (${del.length})`, aCordobas(del.reduce((a, o) => a + o.total, 0))] as [string, number];
    })
  );

  if (d.turno) {
    const efectivo = validas
      .filter((o) => o.metodo_pago === "efectivo")
      .reduce((a, o) => a + o.total, 0);
    const esperado = d.turno.fondo_inicial + efectivo;
    const contado = d.turno.efectivo_contado;
    bloque("ARQUEO DE CAJA", [
      ["Fondo inicial", aCordobas(d.turno.fondo_inicial)],
      ["Ventas en efectivo", aCordobas(efectivo)],
      ["Efectivo esperado", aCordobas(esperado)],
      ["Efectivo contado", contado == null ? "(no registrado)" : aCordobas(contado)],
      ["DIFERENCIA", contado == null ? "" : aCordobas(contado - esperado)],
    ]);
  }

  // ------------------------------------------------------------ Órdenes ---
  const wo = wb.addWorksheet("Órdenes");
  wo.columns = [
    { header: "Orden #", key: "n", width: 10 },
    { header: "Fecha", key: "f", width: 20 },
    { header: "Tipo", key: "t", width: 14 },
    { header: "Mesa", key: "m", width: 8 },
    { header: "Cliente", key: "c", width: 20 },
    { header: "Atendió", key: "a", width: 14 },
    { header: "Pago", key: "p", width: 14 },
    { header: "Estado", key: "e", width: 10 },
    { header: "Subtotal", key: "sb", width: 13 },
    { header: "Desc. pizzas", key: "dp", width: 13 },
    { header: "Desc. bebidas", key: "db", width: 13 },
    { header: "Desc. general", key: "dg", width: 13 },
    { header: "Motivo desc.", key: "dm", width: 20 },
    { header: "Base productos", key: "bp", width: 14 },
    { header: "Envío", key: "en", width: 11 },
    { header: "Base gravable", key: "bg", width: 14 },
    { header: "IVA 15%", key: "iv", width: 12 },
    { header: "Propina", key: "pr", width: 12 },
    { header: "TOTAL", key: "to", width: 14 },
  ];
  encabezar(wo, 1);
  for (const o of d.ordenes) {
    wo.addRow({
      n: o.numero, f: fechaHora(o.created_at), t: etiquetaTipo(o.tipo),
      m: o.mesa ?? "", c: o.cliente ?? "", a: o.atendio ?? "",
      p: o.metodo_pago ?? "", e: o.estado,
      sb: aCordobas(o.subtotal_bruto), dp: aCordobas(o.desc_pizzas),
      db: aCordobas(o.desc_bebidas), dg: aCordobas(o.desc_general),
      dm: o.desc_motivo ?? "", bp: aCordobas(o.base_productos),
      en: aCordobas(o.costo_envio), bg: aCordobas(o.base_gravable),
      iv: aCordobas(o.iva), pr: aCordobas(o.propina), to: aCordobas(o.total),
    });
  }
  ["sb","dp","db","dg","bp","en","bg","iv","pr","to"].forEach((k) => {
    wo.getColumn(k).numFmt = MONEDA;
  });
  wo.views = [{ state: "frozen", ySplit: 1 }];
  wo.autoFilter = { from: "A1", to: "S1" };

  // -------------------------------------------------------------- Items ---
  const wi = wb.addWorksheet("Items");
  wi.columns = [
    { header: "Orden #", key: "n", width: 10 },
    { header: "Fecha", key: "f", width: 20 },
    { header: "Tipo orden", key: "t", width: 14 },
    { header: "Producto", key: "p", width: 30 },
    { header: "Grupo", key: "g", width: 10 },
    { header: "Cantidad", key: "q", width: 10 },
    { header: "Precio unit.", key: "pu", width: 13 },
    { header: "Bruto", key: "b", width: 13 },
    { header: "Descuento", key: "d", width: 13 },
    { header: "Neto", key: "ne", width: 13 },
    { header: "Notas", key: "no", width: 26 },
  ];
  encabezar(wi, 1);
  for (const o of d.ordenes) {
    for (const it of o.items) {
      wi.addRow({
        n: o.numero, f: fechaHora(o.created_at), t: etiquetaTipo(o.tipo),
        p: it.nombre_snapshot, g: it.grupo_snapshot, q: it.cantidad,
        pu: aCordobas(it.precio_snapshot), b: aCordobas(it.bruto),
        d: aCordobas(it.desc_total), ne: aCordobas(it.neto), no: it.notas ?? "",
      });
    }
  }
  ["pu","b","d","ne"].forEach((k) => { wi.getColumn(k).numFmt = MONEDA; });
  wi.views = [{ state: "frozen", ySplit: 1 }];
  wi.autoFilter = { from: "A1", to: "K1" };

  // ---------------------------------------------------------- Productos ---
  const wp = wb.addWorksheet("Productos");
  wp.columns = [
    { header: "Producto", key: "p", width: 30 },
    { header: "Grupo", key: "g", width: 10 },
    { header: "Unidades vendidas", key: "q", width: 18 },
    { header: "Bruto", key: "b", width: 14 },
    { header: "Descuento", key: "d", width: 14 },
    { header: "Neto (sin IVA)", key: "ne", width: 16 },
  ];
  encabezar(wp, 1);
  const agg = new Map<string, { g: string; q: number; b: number; d: number; ne: number }>();
  for (const o of validas) {
    for (const it of o.items) {
      const k = it.nombre_snapshot;
      const a = agg.get(k) ?? { g: it.grupo_snapshot, q: 0, b: 0, d: 0, ne: 0 };
      a.q += it.cantidad; a.b += it.bruto; a.d += it.desc_total; a.ne += it.neto;
      agg.set(k, a);
    }
  }
  [...agg.entries()]
    .sort((a, b) => b[1].ne - a[1].ne)
    .forEach(([p, a]) =>
      wp.addRow({ p, g: a.g, q: a.q, b: aCordobas(a.b), d: aCordobas(a.d), ne: aCordobas(a.ne) })
    );
  ["b","d","ne"].forEach((k) => { wp.getColumn(k).numFmt = MONEDA; });
  wp.views = [{ state: "frozen", ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
