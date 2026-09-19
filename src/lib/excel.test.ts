import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { generarCierreExcel, nombreArchivoCierre, type FilaOrden } from "./excel";
import { centavos } from "./money";
import { METODOS_PAGO } from "./types";

const orden = (
  numero: number,
  metodo: FilaOrden["metodo_pago"],
  total: number,
  extra: Partial<FilaOrden> = {}
): FilaOrden => ({
  numero,
  created_at: "2026-09-19T20:00:00Z",
  tipo: "mesa", mesa: "1", cliente: null, mesero: "Ana",
  metodo_pago: metodo, estado: "pagada",
  subtotal_bruto: centavos(total), desc_total: 0, desc_motivo: null,
  costo_envio: 0, iva: centavos(total * 0.15), propina: 0,
  total: centavos(total),
  items: [{ nombre_snapshot: "Diabla", cantidad: 1, precio_snapshot: centavos(300), neto: centavos(total) }],
  ...extra,
});

const ordenes: FilaOrden[] = [
  orden(1, "efectivo", 300),
  orden(2, "efectivo", 300),
  orden(3, "banpro", 440),
  orden(4, "bac", 400),
  orden(5, "pedidosya", 370),
];

async function abrir(blob: Blob) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  return wb.getWorksheet("Cierre")!;
}

const textoDe = (ws: ExcelJS.Worksheet) => {
  const filas: string[] = [];
  ws.eachRow({ includeEmpty: true }, (r) => {
    const v: string[] = [];
    r.eachCell({ includeEmpty: true }, (c) => {
      const x = c.value;
      v.push(x && typeof x === "object" && "formula" in x ? `=${x.formula}` : String(x ?? ""));
    });
    filas.push(v.join(" | "));
  });
  return filas.join("\n");
};

const base = { desde: new Date(2026, 8, 19, 10), hasta: new Date(2026, 8, 19, 23), ordenes };

describe("encabezado", () => {
  it("lleva el nombre del local, día y hora", async () => {
    const txt = textoDe(await abrir(await generarCierreExcel(base)));
    expect(txt).toContain("ROCK MUNCHIES");
    expect(txt).toContain("CIERRE DE CAJA");
    expect(txt).toContain("Día: 19/09/2026");
    expect(txt).toMatch(/Hora: \d{2}:\d{2}/);
  });
});

describe("consumibles", () => {
  it("lista lo vendido agrupado por producto", async () => {
    const txt = textoDe(await abrir(await generarCierreExcel(base)));
    expect(txt).toContain("CONSUMIBLES");
    expect(txt).toContain("Diabla");
    expect(txt).toContain("TOTAL CONSUMIBLES");
  });

  it("el total de consumibles es una fórmula, no un número escrito", async () => {
    const ws = await abrir(await generarCierreExcel(base));
    const txt = textoDe(ws);
    expect(txt).toMatch(/=SUM\(D\d+:D\d+\)/);
  });

  it("agrupa cantidades del mismo producto en una sola fila", async () => {
    const ws = await abrir(await generarCierreExcel(base));
    let filasDiabla = 0;
    ws.eachRow((r) => { if (r.getCell(2).value === "Diabla") filasDiabla += 1; });
    expect(filasDiabla).toBe(1);
  });
});

describe("forma de pago", () => {
  it("desglosa Efectivo, Banpro y BAC", async () => {
    const txt = textoDe(await abrir(await generarCierreExcel(base)));
    expect(txt).toContain("FORMA DE PAGO");
    for (const m of ["Efectivo", "Banpro", "BAC"]) expect(txt, m).toContain(m);
  });

  it("PedidosYa va en su propio bloque, fuera del total cobrado", async () => {
    const ws = await abrir(await generarCierreExcel(base));
    const txt = textoDe(ws);
    expect(txt).toContain("PEDIDOS YA (aparte)");
    expect(txt).toContain("No entra a la caja");

    // El total cobrado suma solo las filas de efectivo/banpro/bac.
    const filaTotal = txt.split("\n").find((l) => l.includes("TOTAL COBRADO"))!;
    const m = filaTotal.match(/=SUM\(D(\d+):D(\d+)\)/)!;
    expect(Number(m[2]) - Number(m[1]) + 1).toBe(3); // tres métodos, no cuatro
  });

  it("los métodos de pago son los que usa el local", () => {
    expect(METODOS_PAGO.map((m) => m.valor))
      .toEqual(["efectivo", "banpro", "bac", "pedidosya"]);
    expect(METODOS_PAGO.filter((m) => m.enCaja).map((m) => m.valor)).toEqual(["efectivo"]);
  });
});

describe("arqueo", () => {
  it("calcula esperado y diferencia con fórmulas encadenadas", async () => {
    const txt = textoDe(await abrir(await generarCierreExcel({
      ...base,
      turno: { numero: 3, abierto_por: "Luis", fondo_inicial: centavos(500), efectivo_contado: centavos(1100) },
    })));
    expect(txt).toContain("ARQUEO DE EFECTIVO");
    expect(txt).toContain("Efectivo esperado");
    expect(txt).toMatch(/DIFERENCIA.*=D\d+-D\d+/s);
  });

  it("sin turno abierto no dibuja el bloque de arqueo", async () => {
    const txt = textoDe(await abrir(await generarCierreExcel(base)));
    expect(txt).not.toContain("ARQUEO DE EFECTIVO");
  });
});

describe("anulaciones y descuentos", () => {
  it("las lista con su motivo cuando existen", async () => {
    const txt = textoDe(await abrir(await generarCierreExcel({
      ...base,
      ordenes: [
        ...ordenes,
        orden(6, "efectivo", 300, { estado: "anulada", desc_motivo: "cliente se fue" }),
        orden(7, "efectivo", 300, { desc_total: centavos(50), desc_motivo: "cortesía" }),
      ],
    })));
    expect(txt).toContain("ANULACIONES Y DESCUENTOS");
    expect(txt).toContain("cliente se fue");
    expect(txt).toContain("cortesía");
  });

  it("sin anulaciones ni descuentos no dibuja el bloque", async () => {
    const txt = textoDe(await abrir(await generarCierreExcel(base)));
    expect(txt).not.toContain("ANULACIONES Y DESCUENTOS");
  });

  it("una orden anulada no entra en los consumibles", async () => {
    const ws = await abrir(await generarCierreExcel({
      ...base,
      ordenes: [orden(1, "efectivo", 300), orden(2, "efectivo", 300, { estado: "anulada" })],
    }));
    let cant = 0;
    ws.eachRow((r) => { if (r.getCell(2).value === "Diabla") cant = Number(r.getCell(1).value); });
    expect(cant).toBe(1); // solo la pagada
  });
});

describe("nombre del archivo", () => {
  it("lleva fecha, hora y turno", () => {
    expect(nombreArchivoCierre(new Date(2026, 8, 19, 22, 30), 3))
      .toBe("Cierre_2026-09-19_2230_turno3.xlsx");
    expect(nombreArchivoCierre(new Date(2026, 8, 19, 22, 30)))
      .toBe("Cierre_2026-09-19_2230.xlsx");
  });
});
