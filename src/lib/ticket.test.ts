import { describe, expect, it } from "vitest";
import {
  LEYENDA_FISCAL, construirTicket, previsualizarTicket, ticketPrueba,
  type DatosTicket,
} from "./ticket";
import { calcularTotales } from "./pricing";
import { centavos } from "./money";
import { columnasPara, envolver, parLineado, transliterar } from "./escpos";
import { CONFIG_DEFAULT, type LineaOrden } from "./types";

const lineas: LineaOrden[] = [
  { id: "1", productoId: "1", nombre: "Hawaiana Super Saiyajin", precioUnit: centavos(440), cantidad: 1, grupo: "pizza" },
  { id: "2", productoId: "2", nombre: "Diabla", precioUnit: centavos(300), cantidad: 2, grupo: "pizza",
    modificadores: [{ nombre: "Extra queso", precio: centavos(50) }] },
  { id: "3", productoId: "3", nombre: "Churros de Queso", precioUnit: centavos(125), cantidad: 1, grupo: "otro", notas: "sin salsa" },
  { id: "4", productoId: "4", nombre: "Agua Fuente Pura", precioUnit: centavos(35), cantidad: 1, grupo: "bebida", aplicaIva: false },
  { id: "5", productoId: "5", nombre: "Toña", precioUnit: centavos(60), cantidad: 2, grupo: "bebida" },
];

const datos = (over: Partial<DatosTicket> = {}): DatosTicket => ({
  numero: 142,
  tipo: "delivery",
  cliente: "Kevin",
  direccion: "Del parque 2c al sur, casa portón negro",
  mesero: "Ana",
  cajero: "Luis",
  metodoPago: "efectivo",
  recibido: centavos(2500),
  fecha: new Date(2026, 8, 19, 19, 42),
  totales: calcularTotales(
    lineas,
    [{ alcance: "pizza", tipo: "porcentaje", valor: 1000 }],
    { ...CONFIG_DEFAULT, costoEnvio: centavos(50), cobrarPropina: true, tipoCambio: centavos(36.8) }
  ),
  tipoCambio: centavos(36.8),
  ...over,
});

describe("maquetado", () => {
  it("ninguna línea excede el ancho del papel, en 58 y en 80mm", () => {
    for (const ancho of [58, 80] as const) {
      const cols = columnasPara(ancho);
      for (const doc of ["cliente", "precuenta", "cocina"] as const) {
        const txt = previsualizarTicket(datos({ ancho, documento: doc }));
        const largas = txt.split("\n").filter((l) => l.length > cols);
        expect(largas, `${ancho}mm / ${doc}`).toEqual([]);
      }
    }
  });

  it("el ticket de 80mm usa más columnas que el de 58mm", () => {
    expect(columnasPara(58)).toBe(32);
    expect(columnasPara(80)).toBe(48);
    const a = previsualizarTicket(datos({ ancho: 58 }));
    const b = previsualizarTicket(datos({ ancho: 80 }));
    const maxA = Math.max(...a.split("\n").map((l) => l.length));
    const maxB = Math.max(...b.split("\n").map((l) => l.length));
    expect(maxB).toBeGreaterThan(maxA);
  });

  it("envolver respeta palabras y corta las que no caben", () => {
    expect(envolver("Hawaiana Super Saiyajin", 20)).toEqual(["Hawaiana Super", "Saiyajin"]);
    expect(envolver("Supercalifragilisticoespialidoso", 10).every((l) => l.length <= 10)).toBe(true);
  });

  it("parLineado alinea a la derecha sin pasarse del ancho", () => {
    expect(parLineado("Subtotal", "1,160.00")).toHaveLength(32);
    expect(parLineado("Una etiqueta larguísima que no cabe", "1,160.00").length).toBeLessThanOrEqual(32);
  });

  it("no mutila el valor cuando etiqueta y valor llenan la línea exacta", () => {
    // "Pre-cuenta #0142" + "19/09/2026 19:42" = 32 justos
    const r = parLineado("Pre-cuenta #0142", "19/09/2026 19:42");
    expect(r).toHaveLength(32);
    expect(r).toContain("#0142");
  });
});

describe("contenido exigido por el spec", () => {
  it("el recibo lleva la leyenda de que no es factura fiscal", () => {
    expect(previsualizarTicket(datos())).toContain("no es");
    expect(LEYENDA_FISCAL).toContain("no es factura fiscal");
  });

  it("las reimpresiones se marcan COPIA, no REIMPRESIÓN", () => {
    const txt = previsualizarTicket(datos({ reimpresion: true }));
    expect(txt).toContain("COPIA");
    expect(txt).not.toContain("REIMPRESIÓN");
  });

  it("desglosa base gravable, base exenta, IVA, envío y propina", () => {
    const txt = previsualizarTicket(datos());
    for (const e of ["Base gravable", "Base exenta", "IVA 15%", "Envío", "Propina", "Desc. pizzas"]) {
      expect(txt, e).toContain(e);
    }
  });

  it("marca los productos exentos en su línea", () => {
    expect(previsualizarTicket(datos())).toContain("(exento de IVA)");
  });

  it("muestra el precio unitario cuando la cantidad es mayor a uno", () => {
    expect(previsualizarTicket(datos())).toContain("2 x 300.00");
  });

  it("lista los modificadores con su recargo", () => {
    expect(previsualizarTicket(datos())).toContain("Extra queso");
  });

  it("muestra el equivalente en dólares y el tipo de cambio", () => {
    const txt = previsualizarTicket(datos());
    expect(txt).toContain("Equivale a US$");
    expect(txt).toContain("T/C");
  });

  it("identifica al mesero y al cajero", () => {
    const txt = previsualizarTicket(datos());
    expect(txt).toContain("Mesero: Ana");
    expect(txt).toContain("Cajero: Luis");
  });

  it("dice Vuelto, no Cambio", () => {
    expect(previsualizarTicket(datos())).toContain("Vuelto:");
  });
});

describe("pre-cuenta", () => {
  const txt = () => previsualizarTicket(datos({ documento: "precuenta" }));

  it("se identifica como pre-cuenta y advierte que no es comprobante", () => {
    expect(txt()).toContain("PRE-CUENTA");
    expect(txt()).toContain("No es comprobante de pago");
  });

  it("no muestra el pago ni el cajero porque todavía no se cobró", () => {
    expect(txt()).not.toContain("Vuelto:");
    expect(txt()).not.toContain("Pago:");
    expect(txt()).not.toContain("Cajero:");
  });

  it("conserva el número completo de la orden", () => {
    expect(txt()).toContain("#0142");
  });

  it("sí muestra el total, que es para lo que sirve", () => {
    expect(txt()).toContain("TOTAL");
  });
});

describe("comanda de cocina", () => {
  const txt = () => previsualizarTicket(datos({ documento: "cocina" }));

  it("no lleva precios ni totales", () => {
    expect(txt()).not.toContain("TOTAL");
    expect(txt()).not.toContain("IVA");
    expect(txt()).not.toContain("440.00");
  });

  it("sí lleva productos, modificadores y notas", () => {
    expect(txt()).toContain("Churros de Queso");
    expect(txt()).toContain("sin salsa");
    expect(txt()).toContain("Extra queso");
  });
});

describe("codificación de caracteres", () => {
  it("los acentos sobreviven al encoder CP1252", () => {
    const bytes = construirTicket(datos(), { transliterar: false });
    expect(Array.from(bytes)).toContain(0xf1); // ñ de Toña
  });

  it("transliterar preserva el maquetado al quitar acentos", () => {
    const txt = previsualizarTicket(datos());
    const plano = transliterar(txt);
    expect(plano.split("\n")).toHaveLength(txt.split("\n").length);
    expect(plano).toContain("Tona");
    expect(plano).toContain("Envio");
    expect(plano).not.toMatch(/\?{2,}/);
  });

  it("transliterar elimina todo byte fuera de ASCII", () => {
    const bytes = construirTicket(datos(), { transliterar: true });
    const textoPlano = Array.from(bytes).filter((b) => b >= 0x20);
    expect(textoPlano.every((b) => b <= 0x7e)).toBe(true);
  });

  it("el ticket de prueba existe para los dos anchos", () => {
    expect(ticketPrueba(16, 58).length).toBeGreaterThan(0);
    expect(ticketPrueba(16, 80).length).toBeGreaterThan(0);
  });
});
