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
  notas?: string | null;
  items: ConteoItem[];
  /**
   * Hoja extra con fecha, quien conto y los insumos sin unidad.
   * La hoja "Inventario" nunca se altera: se mantiene identica a la
   * plantilla para que impresa se vea igual.
   */
  incluirHojaDatos?: boolean;
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
  ];

  // Fila 1: encabezado, Arial 12 blanco sobre azul oscuro, centrado.
  const enc = ws.addRow(["Insumo", "Cantidad", "Unid. de medida"]);
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
    ]);
    fila.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: "Calibri", size: 11 };
      cell.border = bordeFino();
      if (col === 2) {
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

  if (d.incluirHojaDatos) {
    const wd = wb.addWorksheet("Datos");
    wd.columns = [{ width: 26 }, { width: 40 }];
    wd.addRow(["Fecha del conteo", d.fecha]);
    wd.addRow(["Realizado por", d.realizadoPor ?? "(sin registrar)"]);
    wd.addRow(["Notas", d.notas ?? ""]);
    wd.addRow([]);
    wd.addRow(["Insumos contados", d.items.filter((i) => i.cantidad != null).length]);
    wd.addRow(["Insumos sin contar", d.items.filter((i) => i.cantidad == null).length]);

    const sinUnidad = d.items.filter((i) => !i.unidad_snapshot);
    if (sinUnidad.length > 0) {
      wd.addRow([]);
      const t = wd.addRow([`Sin unidad definida (${sinUnidad.length})`]);
      t.font = { bold: true };
      for (const i of sinUnidad) wd.addRow(["", i.nombre_snapshot]);
    }
    wd.getRow(1).font = { bold: true };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function nombreArchivoInventario(fecha: string): string {
  return `Inventario_${fecha}.xlsx`;
}
