import { afterEach, describe, expect, it, vi } from "vitest";
import { ticketHtml } from "./html";
import { AdaptadorPuente } from "./puente";
import { anchoGuardado, guardarAncho } from "../escpos";
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

describe("preferencias de impresión del aparato", () => {
  const almacen = new Map<string, string>();
  afterEach(() => { almacen.clear(); vi.unstubAllGlobals(); });

  it("el ancho del papel se recuerda; por defecto 58 mm", () => {
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => almacen.get(k) ?? null,
      setItem: (k: string, v: string) => { almacen.set(k, v); },
    });
    expect(anchoGuardado()).toBe(58);
    guardarAncho(80);
    expect(anchoGuardado()).toBe(80);
  });

  it("sin almacenamiento (modo privado) no se rompe", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("bloqueado"); },
      setItem: () => { throw new Error("bloqueado"); },
    });
    expect(anchoGuardado()).toBe(58);
    expect(() => guardarAncho(80)).not.toThrow();
  });

  it("el puente está disponible en cualquier aparato, iPhone incluido", () => {
    const a = new AdaptadorPuente();
    expect(a.disponible()).toBe(true);
    expect(a.motivoNoDisponible()).toBeNull();
  });
});
