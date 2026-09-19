import { describe, expect, it } from "vitest";
import { construirTicket, previsualizarTicket, type DatosTicket } from "./ticket";
import { calcularTotales } from "./pricing";
import { centavos } from "./money";
import { COLUMNAS, envolver, parLineado } from "./escpos";
import { CONFIG_DEFAULT, type LineaOrden } from "./types";

const lineas: LineaOrden[] = [
  { id: "1", productoId: "1", nombre: "Hawaiana Super Saiyajin", precioUnit: centavos(440), cantidad: 1, grupo: "pizza" },
  { id: "2", productoId: "2", nombre: "Diabla", precioUnit: centavos(300), cantidad: 2, grupo: "pizza" },
  { id: "3", productoId: "3", nombre: "Churros de Queso", precioUnit: centavos(125), cantidad: 1, grupo: "otro", notas: "sin salsa" },
  { id: "4", productoId: "4", nombre: "Toña", precioUnit: centavos(60), cantidad: 2, grupo: "bebida" },
];

const datos = (over: Partial<DatosTicket> = {}): DatosTicket => ({
  numero: 142,
  tipo: "delivery",
  cliente: "Kevin",
  direccion: "Del parque 2c al sur, casa portón negro",
  metodoPago: "efectivo",
  recibido: centavos(1900),
  fecha: new Date(2026, 8, 19, 19, 42),
  totales: calcularTotales(
    lineas,
    [{ alcance: "pizza", tipo: "porcentaje", valor: 1000 }],
    { ...CONFIG_DEFAULT, costoEnvio: centavos(50), cobrarPropina: true }
  ),
  ...over,
});

describe("maquetado a 32 columnas", () => {
  it("ninguna linea del ticket excede el ancho del papel", () => {
    for (const d of [datos(), datos({ cocina: true }), datos({ reimpresion: true })]) {
      const largas = previsualizarTicket(d)
        .split("\n")
        .filter((l) => l.length > COLUMNAS);
      expect(largas).toEqual([]);
    }
  });

  it("envolver respeta palabras y corta las que no caben", () => {
    expect(envolver("Hawaiana Super Saiyajin", 20)).toEqual(["Hawaiana Super", "Saiyajin"]);
    expect(envolver("Supercalifragilisticoespialidoso", 10).every((l) => l.length <= 10)).toBe(true);
  });

  it("parLineado alinea a la derecha sin pasarse del ancho", () => {
    expect(parLineado("Subtotal", "1,160.00")).toHaveLength(COLUMNAS);
    expect(parLineado("Una etiqueta larguisima que no cabe", "1,160.00").length).toBeLessThanOrEqual(COLUMNAS);
  });

  it("los acentos sobreviven al encoder CP1252", () => {
    const bytes = construirTicket(datos(), { transliterar: false });
    expect(Array.from(bytes)).toContain(0xf1); // enie de Toña
  });

  it("transliterar elimina todo byte fuera de ASCII", () => {
    const bytes = construirTicket(datos(), { transliterar: true });
    const textoPlano = Array.from(bytes).filter((b) => b >= 0x20);
    expect(textoPlano.every((b) => b <= 0x7e)).toBe(true);
  });

  it("el ticket de cocina no lleva precios ni totales", () => {
    const txt = previsualizarTicket(datos({ cocina: true }));
    expect(txt).not.toContain("TOTAL");
    expect(txt).not.toContain("IVA");
    expect(txt).toContain("Churros de Queso");
    expect(txt).toContain("sin salsa");
  });

  it("el ticket de cliente desglosa descuento, IVA y propina", () => {
    const txt = previsualizarTicket(datos());
    expect(txt).toContain("Desc. pizzas");
    expect(txt).toContain("IVA 15%");
    expect(txt).toContain("Propina 10%");
    expect(txt).toContain("Envio");
    expect(txt).toContain("Cambio:");
  });
});
