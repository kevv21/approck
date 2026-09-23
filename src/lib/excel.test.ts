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
  items: [{
    nombre_snapshot: "Diabla", cantidad: 1, precio_snapshot: centavos(300),
    neto: centavos(total), iva: centavos(total * 0.15),
  }],
  ...extra,
});

const ordenes: FilaOrden[] = [
  orden(1, "efectivo", 300),
  orden(2, "efectivo", 300),
  orden(3, "banpro", 440),
  orden(4, "bac", 400),
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

  // Lo que pidió el dueño: el IVA integrado en el total de consumibles.
  // Antes esta tabla sumaba el neto pelado y nunca cuadraba contra lo cobrado.
  it("lleva columna de IVA y el total de la línea la suma", async () => {
    const ws = await abrir(await generarCierreExcel(base));
    const txt = textoDe(ws);
    expect(txt).toContain("Cant. | Producto | P. unitario | Subtotal | IVA | Total");
    // El total por línea es fórmula: corregir una cantidad a mano lo arrastra.
    expect(txt).toMatch(/=D\d+\+E\d+/);
    expect(txt).toMatch(/=SUM\(E\d+:E\d+\)/);
    expect(txt).toMatch(/=SUM\(F\d+:F\d+\)/);
  });

  it("el IVA de la tabla es el de las líneas vendidas", async () => {
    const ws = await abrir(await generarCierreExcel(base));
    let ivaDiabla: unknown = null;
    ws.eachRow((r) => {
      if (r.getCell(2).value === "Diabla") ivaDiabla = r.getCell(5).value;
    });
    // 300 + 300 + 440 + 400 = 1440 de neto, al 15% = 216.
    expect(ivaDiabla).toBeCloseTo(216, 2);
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

  it("PedidosYa es un monto anotado al cerrar, no un método de pago", async () => {
    // Esa plata nunca pasa por la caja: la plataforma deposita días después
    // y con comisión. Cuadrarla contra el efectivo era imposible.
    const ws = await abrir(await generarCierreExcel({
      ...base,
      turno: { numero: 1, abierto_por: "Ana", fondo_inicial: 0,
               efectivo_contado: 0, ventas_pedidosya: centavos(1250) },
    }));
    const txt = textoDe(ws);
    expect(txt).toContain("PEDIDOS YA (aparte)");
    expect(txt).toContain("Vendido por la plataforma");
    expect(txt).toContain("Anotado al cerrar caja");
  });

  it("el total cobrado suma exactamente los tres métodos de caja", () => {
    expect(METODOS_PAGO.map((m) => m.valor)).toEqual(["efectivo", "banpro", "bac"]);
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

// Extras en el cierre — 2026-09-23
//
// Una Diabla con bacon entraba entera a la fila "Diabla": P. unitario C$300
// pero el bacon metido en el subtotal, así que P. unitario × Cant. no daba el
// subtotal, y el bacon vendido no aparecía en ninguna parte. Ahora cada extra
// sale en su fila y la plata de la línea se reparte entre la pizza y sus
// extras en proporción a su precio, al centavo.
describe("extras en consumibles", () => {
  const conExtras = orden(10, "efectivo", 890, {
    iva: centavos(133.5),
    items: [{
      nombre_snapshot: "Diabla", cantidad: 2, precio_snapshot: centavos(300),
      neto: centavos(890), iva: centavos(133.5),
      modificadores: [
        { nombre: "Extra Bacon", precio: centavos(60) },
        { nombre: "Borde de queso", precio: centavos(85) },
      ],
    }],
  });
  const suelta = orden(11, "efectivo", 300, {
    items: [{
      nombre_snapshot: "Diabla", cantidad: 1, precio_snapshot: centavos(300),
      neto: centavos(300), iva: centavos(45),
    }],
  });
  const filas = async () => {
    const ws = await abrir(await generarCierreExcel({ ...base, ordenes: [conExtras, suelta] }));
    const out: Record<string, (string | number)[]> = {};
    ws.eachRow((r) => {
      const n = r.getCell(2).value;
      if (typeof n === "string" && ["Diabla", "Extra Bacon", "Borde de queso"].includes(n))
        out[n] = [1, 3, 4, 5].map((c) => r.getCell(c).value as number);
    });
    return out;
  };

  it("cada extra sale en su propia fila, con lo que se vendió", async () => {
    const f = await filas();
    expect(f["Extra Bacon"]).toEqual([2, 60, 120, 18]);
    expect(f["Borde de queso"]).toEqual([2, 85, 170, 25.5]);
  });

  it("la pizza queda con su propio precio: P. unitario × Cant. = Subtotal", async () => {
    const f = await filas();
    // 2 con extras + 1 suelta; el subtotal es solo de la pizza.
    expect(f["Diabla"]).toEqual([3, 300, 900, 135]);
  });

  it("repartir no pierde ni inventa plata", async () => {
    const f = await filas();
    const subtotal = f["Diabla"][2] as number + (f["Extra Bacon"][2] as number) + (f["Borde de queso"][2] as number);
    const iva = f["Diabla"][3] as number + (f["Extra Bacon"][3] as number) + (f["Borde de queso"][3] as number);
    expect(subtotal).toBeCloseTo(890 + 300, 2);
    expect(iva).toBeCloseTo(133.5 + 45, 2);
  });
});
