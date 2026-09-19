import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { generarInventarioExcel, nombreArchivoInventario } from "./excel";
import { normalizarUnidad } from "./tipos";
import type { ConteoItem } from "./tipos";

const items: ConteoItem[] = [
  { insumo_id: "1", nombre_snapshot: "Harina", unidad_snapshot: "Arroba", cantidad: 2.5 },
  { insumo_id: "2", nombre_snapshot: "Jamón", unidad_snapshot: "Lb", cantidad: 12 },
  { insumo_id: "3", nombre_snapshot: "Chile", unidad_snapshot: null, cantidad: null },
];

async function abrir(blob: Blob) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  return wb;
}

describe("fidelidad a Plantilla_Inventario.xlsx", () => {
  it("la hoja se llama Inventario y tiene los mismos encabezados", async () => {
    const wb = await abrir(await generarInventarioExcel({ fecha: "2026-09-19", items }));
    const ws = wb.getWorksheet("Inventario")!;
    expect(ws).toBeDefined();
    const h = ws.getRow(1);
    expect(h.getCell(1).value).toBe("Insumo");
    expect(h.getCell(2).value).toBe("Cantidad");
    expect(h.getCell(3).value).toBe("Unid. de medida");
  });

  it("conserva los anchos de columna de la plantilla", async () => {
    const wb = await abrir(await generarInventarioExcel({ fecha: "2026-09-19", items }));
    const ws = wb.getWorksheet("Inventario")!;
    expect(ws.getColumn(1).width).toBe(30);
    expect(ws.getColumn(2).width).toBe(15);
    expect(ws.getColumn(3).width).toBe(20);
  });

  it("conserva el estilo del encabezado: Arial 12 blanco sobre 2A3F54", async () => {
    const wb = await abrir(await generarInventarioExcel({ fecha: "2026-09-19", items }));
    const c = wb.getWorksheet("Inventario")!.getRow(1).getCell(1);
    expect(c.font?.name).toBe("Arial");
    expect(c.font?.size).toBe(12);
    expect(c.font?.bold).toBe(true);
    expect(String(c.fill && "fgColor" in c.fill ? c.fill.fgColor?.argb : "")).toContain("2A3F54");
    expect(c.alignment?.horizontal).toBe("center");
  });

  it("todas las celdas llevan el borde fino DDDDDD", async () => {
    const wb = await abrir(await generarInventarioExcel({ fecha: "2026-09-19", items }));
    const ws = wb.getWorksheet("Inventario")!;
    for (const n of [1, 2, 3]) {
      const b = ws.getRow(n).getCell(1).border;
      expect(b?.top?.style).toBe("thin");
      expect(String(b?.top?.color?.argb)).toContain("DDDDDD");
    }
  });
});

describe("contenido del conteo", () => {
  it("escribe un insumo por fila, en orden, desde la fila 2", async () => {
    const wb = await abrir(await generarInventarioExcel({ fecha: "2026-09-19", items }));
    const ws = wb.getWorksheet("Inventario")!;
    expect(ws.getRow(2).getCell(1).value).toBe("Harina");
    expect(ws.getRow(3).getCell(1).value).toBe("Jamón");
    expect(ws.getRow(4).getCell(1).value).toBe("Chile");
  });

  it("acepta cantidades fraccionarias: 2.5 Lb es válido", async () => {
    const wb = await abrir(await generarInventarioExcel({ fecha: "2026-09-19", items }));
    expect(wb.getWorksheet("Inventario")!.getRow(2).getCell(2).value).toBe(2.5);
  });

  it("deja vacía la cantidad de lo que no se contó, sin poner cero", async () => {
    const wb = await abrir(await generarInventarioExcel({ fecha: "2026-09-19", items }));
    const v = wb.getWorksheet("Inventario")!.getRow(4).getCell(2).value;
    // Un cero significaría "no hay existencias", que es muy distinto de
    // "nadie lo contó".
    expect(v === null || v === undefined || v === "").toBe(true);
  });

  it("exporta TODOS los insumos aunque falten por contar", async () => {
    const wb = await abrir(await generarInventarioExcel({ fecha: "2026-09-19", items }));
    expect(wb.getWorksheet("Inventario")!.rowCount).toBe(items.length + 1);
  });
});

describe("metadatos sin alterar la plantilla", () => {
  it("la fecha va en el encabezado de impresión, no en una fila", async () => {
    const wb = await abrir(await generarInventarioExcel({
      fecha: "2026-09-19", realizadoPor: "Ana", items,
    }));
    const ws = wb.getWorksheet("Inventario")!;
    expect(ws.headerFooter?.oddHeader).toContain("2026-09-19");
    expect(ws.headerFooter?.oddHeader).toContain("Ana");
    // La fila 1 sigue siendo el encabezado de la plantilla.
    expect(ws.getRow(1).getCell(1).value).toBe("Insumo");
  });

  it("la hoja Datos es opcional y lista los insumos sin unidad", async () => {
    const sin = await abrir(await generarInventarioExcel({ fecha: "2026-09-19", items }));
    expect(sin.getWorksheet("Datos")).toBeUndefined();

    const con = await abrir(await generarInventarioExcel({
      fecha: "2026-09-19", items, incluirHojaDatos: true, realizadoPor: "Ana",
    }));
    const wd = con.getWorksheet("Datos")!;
    expect(wd).toBeDefined();
    const texto = JSON.stringify(wd.getSheetValues());
    expect(texto).toContain("Chile");       // el que no tiene unidad
    expect(texto).toContain("Sin unidad");
  });

  it("el nombre del archivo lleva la fecha", () => {
    expect(nombreArchivoInventario("2026-09-19")).toBe("Inventario_2026-09-19.xlsx");
  });
});

describe("normalización de unidades", () => {
  it("unifica los alias que trae la plantilla", () => {
    expect(normalizarUnidad("Unidad")).toBe("UND");
    expect(normalizarUnidad("UND")).toBe("UND");
    expect(normalizarUnidad("lb")).toBe("Lb");
    expect(normalizarUnidad("Galón")).toBe("Galon");
  });

  it("deja pasar lo que no reconoce y trata el vacío como sin definir", () => {
    expect(normalizarUnidad("Arroba")).toBe("Arroba");
    expect(normalizarUnidad(null)).toBeNull();
    expect(normalizarUnidad("  ")).toBe("");
  });
});
