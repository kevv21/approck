import { describe, expect, it } from "vitest";
import { previsualizarTicket } from "./ticket";
import { centavos } from "./money";
import { calcularTotales } from "./pricing";
import {
  CONFIG_DEFAULT, METODOS_PAGO, datosLineaMitades, nombreMitades,
  precioMitadYMitad, type LineaOrden, type MitadPizza,
} from "./types";
import { refProducto } from "./repo";

const pizza = (nombre: string, precio: number): MitadPizza =>
  ({ productoId: nombre, nombre, precio: centavos(precio) });

const criolla = pizza("Criolla", 250);
const fabulosa = pizza("La Fabulosa", 450);
const diabla = pizza("Diabla", 300);

describe("precio de una mitad y mitad", () => {
  it("por defecto suma las dos y divide entre dos", () => {
    expect(precioMitadYMitad(criolla, fabulosa)).toBe(centavos(350));
    expect(precioMitadYMitad(diabla, diabla)).toBe(centavos(300));
  });

  it("redondea al centavo cuando la suma es impar", () => {
    const a = pizza("A", 250.01), b = pizza("B", 250.02);
    // (25001 + 25002) / 2 = 25001.5 -> 25002
    expect(precioMitadYMitad(a, b)).toBe(25002);
  });

  it("con la regla 'mayor' cobra la más cara", () => {
    expect(precioMitadYMitad(criolla, fabulosa, "mayor")).toBe(centavos(450));
  });

  it("el promedio deja un hueco que conviene tener presente", () => {
    // Media pizza de mariscos sale más barata que la entera: es la
    // consecuencia de la regla, no un error de cálculo.
    expect(precioMitadYMitad(criolla, fabulosa)).toBeLessThan(fabulosa.precio);
  });

  it("no depende del orden en que se eligieron las mitades", () => {
    expect(precioMitadYMitad(criolla, fabulosa))
      .toBe(precioMitadYMitad(fabulosa, criolla));
  });
});

describe("la mitad y mitad dentro del pedido", () => {
  const linea: LineaOrden = {
    id: "1", productoId: "", nombre: nombreMitades(criolla, fabulosa),
    precioUnit: precioMitadYMitad(criolla, fabulosa),
    cantidad: 1, grupo: "pizza", mitades: [criolla, fabulosa],
  };

  it("se cobra como una sola pizza, no como dos", () => {
    const t = calcularTotales([linea], [], CONFIG_DEFAULT);
    expect(t.subtotalBruto).toBe(centavos(350));
    expect(t.lineas).toHaveLength(1);
  });

  it("cuenta como pizza para el descuento por categoría", () => {
    const t = calcularTotales([linea],
      [{ alcance: "pizza", tipo: "porcentaje", valor: 1000 }], CONFIG_DEFAULT);
    expect(t.descPizzas).toBe(centavos(35));
  });

  it("el nombre deja ver las dos mitades", () => {
    expect(linea.nombre).toBe("Criolla / La Fabulosa");
  });

  it("dos mitades iguales cuestan lo mismo que la pizza entera", () => {
    const t = calcularTotales([{ ...linea,
      precioUnit: precioMitadYMitad(diabla, diabla), mitades: [diabla, diabla],
    }], [], CONFIG_DEFAULT);
    expect(t.subtotalBruto).toBe(diabla.precio);
  });
});

describe("PedidosYa ya no es método de pago", () => {
  it("no aparece entre los métodos", () => {
    expect(METODOS_PAGO.map((m) => m.valor)).not.toContain("pedidosya");
    expect(METODOS_PAGO.map((m) => m.valor)).toEqual(["efectivo", "banpro", "bac"]);
  });
});


describe("cómo se imprime", () => {
  const criollaFab: LineaOrden = {
    id: "1", productoId: "", nombre: nombreMitades(criolla, fabulosa),
    precioUnit: precioMitadYMitad(criolla, fabulosa),
    cantidad: 1, grupo: "pizza", mitades: [criolla, fabulosa],
  };
  const ticket = (documento?: "cocina") => previsualizarTicket({
    numero: 143, tipo: "mesa", mesa: "4", mesero: "Ana", metodoPago: "banpro",
    fecha: new Date(2026, 8, 20, 20, 15), documento,
    totales: calcularTotales([criollaFab], [], CONFIG_DEFAULT),
  });

  it("el recibo encabeza MITAD Y MITAD y lista las dos mitades", () => {
    const t = ticket();
    expect(t).toContain("MITAD Y MITAD");
    expect(t).toContain("1/2 Criolla");
    expect(t).toContain("1/2 La Fabulosa");
  });

  it("la comanda las separa y las marca 1a y 2a", () => {
    // Es donde se equivocan: si se lee mal, se rehace la pizza.
    const t = ticket("cocina");
    expect(t).toContain("1a MITAD: Criolla");
    expect(t).toContain("2a MITAD: La Fabulosa");
  });

  it("nada se pasa de las 32 columnas", () => {
    for (const t of [ticket(), ticket("cocina")]) {
      expect(t.split("\n").filter((l) => l.length > 32)).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// La linea que se agrega al pedido, y como llega a la base.
// ---------------------------------------------------------------------------
describe("la linea de mitad y mitad guardada", () => {
  it("no apunta a ningun producto del catalogo: es una combinacion", () => {
    expect(datosLineaMitades(criolla, fabulosa, "promedio").productoId).toBe("");
  });

  it("al guardar, ese id vacio se traduce a NULL", () => {
    // Postgres: `producto_id` es uuid. Mandar "" revienta el insert con
    // "invalid input syntax for type uuid" y se pierde el cobro completo.
    expect(refProducto("")).toBeNull();
  });

  it("una linea normal sigue apuntando a su producto", () => {
    expect(refProducto("9f1c0b2a-0000-4000-8000-000000000001"))
      .toBe("9f1c0b2a-0000-4000-8000-000000000001");
  });

  it("lleva el precio ya resuelto por la regla vigente", () => {
    expect(datosLineaMitades(criolla, fabulosa, "promedio").precioUnit).toBe(35000);
    expect(datosLineaMitades(criolla, fabulosa, "mayor").precioUnit).toBe(45000);
  });

  it("guarda las dos mitades para la comanda de cocina", () => {
    const l = datosLineaMitades(criolla, fabulosa, "promedio");
    expect(l.mitades).toEqual([criolla, fabulosa]);
    expect(l.nombre).toBe("Criolla / La Fabulosa");
  });

  it("cuenta como pizza para los descuentos por categoria", () => {
    expect(datosLineaMitades(criolla, fabulosa, "promedio").grupo).toBe("pizza");
  });
});
