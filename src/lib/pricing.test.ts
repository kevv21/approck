import { describe, expect, it } from "vitest";
import { calcularTotales } from "./pricing";
import { centavos, repartirProporcional } from "./money";
import { CONFIG_DEFAULT, type Descuento, type LineaOrden } from "./types";

const linea = (
  nombre: string,
  precio: number,
  cantidad: number,
  grupo: LineaOrden["grupo"]
): LineaOrden => ({
  id: nombre,
  productoId: nombre,
  nombre,
  precioUnit: centavos(precio),
  cantidad,
  grupo,
});

// Pedido de referencia usado en varias pruebas.
// 1 Hawaiana Super Saiyajin 440 + 2 Diabla 300 + 2 Tona 60 = 1160
const pedido: LineaOrden[] = [
  linea("Hawaiana Super Saiyajin", 440, 1, "pizza"),
  linea("Diabla", 300, 2, "pizza"),
  linea("Tona", 60, 2, "bebida"),
];

describe("sin descuentos", () => {
  it("suma el bruto y agrega IVA 15% encima (precios sin IVA)", () => {
    const t = calcularTotales(pedido, [], CONFIG_DEFAULT);
    expect(t.subtotalBruto).toBe(centavos(1160));
    expect(t.baseProductos).toBe(centavos(1160));
    expect(t.iva).toBe(centavos(174)); // 1160 * 0.15
    expect(t.total).toBe(centavos(1334));
  });
});

describe("descuento por categoria", () => {
  it("10% a pizzas no toca las bebidas", () => {
    const d: Descuento[] = [{ alcance: "pizza", tipo: "porcentaje", valor: 1000 }];
    const t = calcularTotales(pedido, d, CONFIG_DEFAULT);
    // pizzas = 440 + 600 = 1040 -> 10% = 104
    expect(t.descPizzas).toBe(centavos(104));
    expect(t.descBebidas).toBe(0);
    expect(t.baseProductos).toBe(centavos(1056));
    const tona = t.lineas.find((l) => l.nombre === "Tona")!;
    expect(tona.descTotal).toBe(0);
  });

  it("50% a bebidas no toca las pizzas", () => {
    const d: Descuento[] = [{ alcance: "bebida", tipo: "porcentaje", valor: 5000 }];
    const t = calcularTotales(pedido, d, CONFIG_DEFAULT);
    expect(t.descBebidas).toBe(centavos(60)); // 120 * 0.5
    expect(t.descPizzas).toBe(0);
  });

  it("monto fijo a pizzas se reparte y cuadra al centavo", () => {
    const d: Descuento[] = [
      { alcance: "pizza", tipo: "monto", valor: centavos(100) },
    ];
    const t = calcularTotales(pedido, d, CONFIG_DEFAULT);
    expect(t.descPizzas).toBe(centavos(100));
    const sumaLineas = t.lineas.reduce((a, l) => a + l.descCategoria, 0);
    expect(sumaLineas).toBe(centavos(100)); // sin centavos perdidos
  });
});

describe("apilado de descuentos", () => {
  it("10% pizzas + 10% general da 19% efectivo, no 20%", () => {
    const d: Descuento[] = [
      { alcance: "pizza", tipo: "porcentaje", valor: 1000 },
      { alcance: "general", tipo: "porcentaje", valor: 1000 },
    ];
    const t = calcularTotales(pedido, d, CONFIG_DEFAULT);
    expect(t.descPizzas).toBe(centavos(104));
    // remanente = 1160 - 104 = 1056 -> 10% = 105.60
    expect(t.descGeneral).toBe(centavos(105.6));
    expect(t.descTotal).toBe(centavos(209.6));
    expect(t.baseProductos).toBe(centavos(950.4));
  });
});

describe("guardas", () => {
  it("un descuento mayor al pedido no produce totales negativos", () => {
    const d: Descuento[] = [
      { alcance: "general", tipo: "monto", valor: centavos(99999) },
    ];
    const t = calcularTotales(pedido, d, CONFIG_DEFAULT);
    expect(t.baseProductos).toBe(0);
    expect(t.total).toBe(0);
    expect(t.lineas.every((l) => l.neto >= 0)).toBe(true);
  });

  it("un porcentaje sobre 100% se recorta a 100%", () => {
    const d: Descuento[] = [
      { alcance: "general", tipo: "porcentaje", valor: 50000 },
    ];
    const t = calcularTotales(pedido, d, CONFIG_DEFAULT);
    expect(t.baseProductos).toBe(0);
  });

  it("un descuento de categoria sin lineas de ese grupo es inocuo", () => {
    const soloPizzas = [linea("Diabla", 300, 1, "pizza")];
    const d: Descuento[] = [{ alcance: "bebida", tipo: "porcentaje", valor: 5000 }];
    const t = calcularTotales(soloPizzas, d, CONFIG_DEFAULT);
    expect(t.descBebidas).toBe(0);
    expect(t.baseProductos).toBe(centavos(300));
  });
});

describe("envio y propina", () => {
  it("el envio paga IVA pero no recibe descuento ni genera propina", () => {
    const d: Descuento[] = [{ alcance: "general", tipo: "porcentaje", valor: 1000 }];
    const t = calcularTotales(pedido, d, {
      ...CONFIG_DEFAULT,
      costoEnvio: centavos(50),
      cobrarPropina: true,
    });
    expect(t.baseProductos).toBe(centavos(1044)); // 1160 - 116
    expect(t.costoEnvio).toBe(centavos(50));
    expect(t.baseGravable).toBe(centavos(1094));
    expect(t.iva).toBe(centavos(164.1));
    expect(t.propina).toBe(centavos(104.4)); // 10% de 1044, sin el envio
    expect(t.total).toBe(centavos(1362.5));
  });

  it("propina sobre base+IVA cuando se configura asi", () => {
    const t = calcularTotales(pedido, [], {
      ...CONFIG_DEFAULT,
      cobrarPropina: true,
      propinaSobre: "base_con_iva",
    });
    expect(t.propina).toBe(centavos(133.4)); // (1160 + 174) * 0.10
  });

  it("propina apagada es cero", () => {
    const t = calcularTotales(pedido, [], CONFIG_DEFAULT);
    expect(t.propina).toBe(0);
  });
});

describe("repartirProporcional", () => {
  it("la suma siempre es exacta, sin centavos perdidos", () => {
    const casos: [number, number[]][] = [
      [10000, [3333, 3333, 3334]],
      [1, [500, 500]],
      [9999, [1, 1, 1]],
      [777, [100, 200, 300, 177]],
    ];
    for (const [monto, pesos] of casos) {
      const r = repartirProporcional(monto, pesos);
      const total = pesos.reduce((a, b) => a + b, 0);
      expect(r.reduce((a, b) => a + b, 0)).toBe(Math.min(monto, total));
    }
  });

  it("nunca reparte mas que el peso de cada linea", () => {
    const r = repartirProporcional(5000, [100, 200]);
    expect(r[0]).toBeLessThanOrEqual(100);
    expect(r[1]).toBeLessThanOrEqual(200);
  });
});
