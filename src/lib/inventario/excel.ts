"use client";

import type ExcelJSTypes from "exceljs";
import type { ConteoItem } from "./tipos";

/**
 * Exportador fiel a Plantilla_Inventario.xlsx.
 *
 * Los estilos NO son decorativos: replican la plantilla que ya usa la cocina,
 * para que la hoja impresa se vea igual a la que tienen pegada en la pared.
 * Cualquier cambio aca hace que deje de parecerse.
 */
const ENCABEZADO_FONDO = "FF2A3F54";
const BORDE = "FFDDDDDD";

const bordeFino = (): ExcelJSTypes.Borders =>
  ({
    top: { style: "thin", color: { argb: BORDE } },
    left: { style: "thin", color: { argb: BORDE } },
    bottom: { style: "thin", color: { argb: BORDE } },
    right: { style: "thin", color: { argb: BORDE } },
  }) as ExcelJSTypes.Borders;

export interface DatosConteo {
  fecha: string;
  realizadoPor?: string | null;
  items: ConteoItem[];
}

export async function generarInventarioExcel(d: DatosConteo): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "APPROCK";
  wb.created = new Date();

  const ws = wb.addWorksheet("Inventario");

  // Anchos exactos de la plantilla.
  ws.columns = [
    { key: "insumo", width: 30 },
    { key: "cantidad", width: 15 },
    { key: "unidad", width: 20 },
    { key: "pedido", width: 15 },
  ];

  // Fila 1: encabezado, Arial 12 blanco sobre azul oscuro, centrado.
  const enc = ws.addRow(["Insumo", "Cantidad", "Unid. de medida", "Pedido"]);
  enc.eachCell((cell) => {
    cell.font = { name: "Arial", bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: ENCABEZADO_FONDO }, bgColor: { argb: ENCABEZADO_FONDO },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = bordeFino();
  });

  // Filas 2+: un insumo por fila, Calibri 11 con el mismo borde fino.
  for (const it of d.items) {
    const fila = ws.addRow([
      it.nombre_snapshot,
      it.cantidad ?? null,
      it.unidad_snapshot ?? null,
      it.pedido ?? null,
    ]);
    fila.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: "Calibri", size: 11 };
      cell.border = bordeFino();
      if (col === 2 || col === 4) {
        cell.alignment = { horizontal: "right" };
        cell.numFmt = "#,##0.###"; // 2.5 Lb se ve como 2.5, no como 2.500
      }
    });
  }

  // La fecha va en el encabezado de impresion, no en una fila: asi la hoja
  // sale fechada al imprimirla sin alterar la estructura de la plantilla.
  ws.headerFooter.oddHeader = `&L&"Arial,Bold"Rock Munchies — Inventario&R${d.fecha}${
    d.realizadoPor ? ` · ${d.realizadoPor}` : ""
  }`;
  ws.headerFooter.oddFooter = "&LPágina &P de &N&R&D";

  // --- Lo que hay que pedir, abajo de la misma hoja ------------------------
  //
  // En la misma hoja a propósito: quien va al mercado imprime UN papel. Un
  // listado en otra pestaña es un listado que nadie lleva encima.
  const porPedir = d.items.filter((i) => (i.pedido ?? 0) > 0);
  if (porPedir.length > 0) {
    ws.addRow([]);
    const tit = ws.addRow([`PEDIDO (${porPedir.length})`]);
    tit.getCell(1).font = { name: "Arial", bold: true, size: 12,
                            color: { argb: "FFFFFFFF" } };
    tit.getCell(1).fill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: ENCABEZADO_FONDO }, bgColor: { argb: ENCABEZADO_FONDO },
    };
    ws.mergeCells(`A${tit.number}:D${tit.number}`);
    tit.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    tit.getCell(1).border = bordeFino();

    const encP = ws.addRow(["Insumo", "Pedir", "Unid. de medida", "Hay"]);
    encP.eachCell((cell) => {
      cell.font = { name: "Arial", bold: true, size: 11 };
      cell.border = bordeFino();
      cell.alignment = { horizontal: "center" };
    });

    for (const it of porPedir) {
      const f = ws.addRow([
        it.nombre_snapshot, it.pedido, it.unidad_snapshot ?? null, it.cantidad ?? null,
      ]);
      f.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.font = { name: "Calibri", size: 11 };
        cell.border = bordeFino();
        if (col === 2 || col === 4) {
          cell.alignment = { horizontal: "right" };
          cell.numFmt = "#,##0.###";
        }
      });
    }
  }

  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.7, bottom: 0.5, header: 0.3, footer: 0.3 },
  };
  // Que el encabezado se repita en cada página impresa.
  ws.pageSetup.printTitlesRow = "1:1";


  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function nombreArchivoInventario(fecha: string): string {
  return `Inventario_${fecha}.xlsx`;
}
