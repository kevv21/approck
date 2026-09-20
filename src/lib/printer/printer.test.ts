import { describe, expect, it } from "vitest";
import { ticketHtml } from "./html";
import { adaptadoresSugeridos, crearAdaptador } from "./index";
import { calcularTotales } from "../pricing";
import { centavos } from "../money";
import { CONFIG_DEFAULT, type LineaOrden } from "../types";
import type { DatosTicket } from "../ticket";

const lineas: LineaOrden[] = [
  { id: "1", productoId: "1", nombre: "Toña", precioUnit: centavos(60), cantidad: 2, grupo: "bebida" },
];
const datos = (over: Partial<DatosTicket> = {}): DatosTicket => ({
  numero: 7, tipo: "mesa", mesa: "4", fecha: new Date(2026, 8, 19, 19, 42),
  metodoPago: "efectivo",
  totales: calcularTotales(lineas, [], CONFIG_DEFAULT),
  ...over,
});

describe("fallback HTML", () => {
  it("produce un documento imprimible con el contenido del ticket", () => {
    const html = ticketHtml(datos());
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("ROCK MUNCHIES");
    expect(html).toContain("window.print()");
    expect(html).toContain("@media print");
  });

  it("fija el tamaño de página según el ancho de papel", () => {
    expect(ticketHtml(datos({ ancho: 58 }))).toContain("size:58mm auto");
    expect(ticketHtml(datos({ ancho: 80 }))).toContain("size:80mm auto");
  });

  it("escapa el HTML del contenido para que una nota no rompa la página", () => {
    const html = ticketHtml(datos({ notas: '<script>alert("x")</script>' }));
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("selección de adaptador", () => {
  it("el puente siempre va primero: es el único que sirve en todos lados", () => {
    expect(adaptadoresSugeridos()[0]).toBe("puente");
  });

  it("siempre ofrece el fallback HTML como último recurso", () => {
    expect(adaptadoresSugeridos()).toContain("html");
  });

  it("el puente está disponible incluso sin APIs de hardware", () => {
    const a = crearAdaptador("puente");
    expect(a.disponible()).toBe(true);
    expect(a.motivoNoDisponible()).toBeNull();
  });

  it("html no se instancia como adaptador: se usa directo", () => {
    expect(() => crearAdaptador("html")).toThrow();
  });
});
