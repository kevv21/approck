import { describe, expect, it } from "vitest";
import { leerCantidad, mostrarCantidad } from "./cantidad";

describe("cantidades con decimales", () => {
  it("acepta punto y coma: 12.2 de jamón", () => {
    expect(leerCantidad("12.2")).toBe(12.2);
    expect(leerCantidad("12,2")).toBe(12.2);
  });

  it("un punto a medio escribir no se pierde: «12.» vale 12 mientras se sigue escribiendo", () => {
    expect(leerCantidad("12.")).toBe(12);
    expect(leerCantidad(".5")).toBe(0.5);
  });

  it("vacío es «no contado», distinto de cero", () => {
    expect(leerCantidad("")).toBeNull();
    expect(leerCantidad("   ")).toBeNull();
    expect(leerCantidad("0")).toBe(0);
  });

  it("redondea a 3 decimales, lo que guarda la base", () => {
    expect(leerCantidad("2.3456")).toBe(2.346);
    expect(leerCantidad("0.1")).toBe(0.1);
  });

  it("rechaza lo que no es una cantidad", () => {
    for (const malo of ["12.2.3", "abc", "-3", "1e5", ".", "12,2,1"]) {
      expect(Number.isNaN(leerCantidad(malo)), malo).toBe(true);
    }
  });

  it("se muestra sin ceros de más", () => {
    expect(mostrarCantidad(12.2)).toBe("12.2");
    expect(mostrarCantidad(null)).toBe("");
    expect(mostrarCantidad(3)).toBe("3");
  });
});
