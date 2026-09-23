import { describe, expect, it } from "vitest";
import { calcularTotales } from "./pricing";
import { aplicarBps, centavos, repartirProporcional } from "./money";
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
  const dGen: Descuento[] = [{ alcance: "general", tipo: "porcentaje", valor: 1000 }];

  it("por defecto el envio queda fuera del IVA, como ordena el spec", () => {
    const t = calcularTotales(pedido, dGen, {
      ...CONFIG_DEFAULT, costoEnvio: centavos(50), cobrarPropina: true,
    });
    expect(t.baseProductos).toBe(centavos(1044)); // 1160 - 116
    expect(t.costoEnvio).toBe(centavos(50));
    expect(t.baseGravable).toBe(centavos(1044));  // el envio NO entra
    expect(t.iva).toBe(centavos(156.6));
    expect(t.propina).toBe(centavos(104.4));      // 10% de 1044, sin el envio
    expect(t.total).toBe(centavos(1355));
  });

  it("con envioGravado el envio entra en la base y paga IVA", () => {
    const t = calcularTotales(pedido, dGen, {
      ...CONFIG_DEFAULT, costoEnvio: centavos(50),
      cobrarPropina: true, envioGravado: true,
    });
    expect(t.baseGravable).toBe(centavos(1094));
    expect(t.iva).toBe(centavos(164.1));          // 156.60 + 7.50 del envio
    expect(t.propina).toBe(centavos(104.4));      // la propina no lo incluye
    expect(t.total).toBe(centavos(1362.5));
  });

  it("el envio nunca recibe descuento", () => {
    const todo: Descuento[] = [{ alcance: "general", tipo: "porcentaje", valor: 10000 }];
    const t = calcularTotales(pedido, todo, {
      ...CONFIG_DEFAULT, costoEnvio: centavos(50),
    });
    expect(t.baseProductos).toBe(0);
    expect(t.costoEnvio).toBe(centavos(50));
    expect(t.total).toBe(centavos(50));
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


describe("productos exentos de IVA", () => {
  it("un item exento no aporta IVA pero si suma al total", () => {
    const mixto: LineaOrden[] = [
      { ...linea("Diabla", 300, 1, "pizza") },
      { ...linea("Agua", 100, 1, "bebida"), aplicaIva: false },
    ];
    const t = calcularTotales(mixto, [], CONFIG_DEFAULT);
    expect(t.baseProductos).toBe(centavos(400));
    expect(t.baseGravable).toBe(centavos(300)); // solo la pizza
    expect(t.baseExenta).toBe(centavos(100));
    expect(t.iva).toBe(centavos(45));           // 15% de 300, no de 400
    expect(t.total).toBe(centavos(445));
  });

  it("el desglose por linea marca el exento con IVA cero", () => {
    const mixto: LineaOrden[] = [
      { ...linea("Diabla", 300, 1, "pizza") },
      { ...linea("Agua", 100, 1, "bebida"), aplicaIva: false },
    ];
    const t = calcularTotales(mixto, [], CONFIG_DEFAULT);
    expect(t.lineas[0].iva).toBe(centavos(45));
    expect(t.lineas[1].iva).toBe(0);
    expect(t.lineas[1].base).toBe(centavos(100));
  });
});

describe("modo: precios que YA incluyen IVA", () => {
  const conIva = { ...CONFIG_DEFAULT, preciosIncluyenIva: true };

  it("desglosa el IVA hacia atras", () => {
    // C$115 con IVA incluido -> base 100, IVA 15
    const t = calcularTotales([linea("Pizza", 115, 1, "pizza")], [], conIva);
    expect(t.baseProductos).toBe(centavos(100));
    expect(t.iva).toBe(centavos(15));
    expect(t.total).toBe(centavos(115)); // el cliente paga lo que dice la carta
  });

  it("base + IVA de cada linea reconstruye su neto", () => {
    const t = calcularTotales(pedido, [], conIva);
    for (const l of t.lineas) {
      expect(l.base + l.iva).toBe(l.neto);
    }
    expect(t.total).toBe(t.subtotalBruto);
  });

  it("el descuento se aplica sobre el precio con IVA que ve el cliente", () => {
    const d: Descuento[] = [{ alcance: "general", tipo: "porcentaje", valor: 1000 }];
    const t = calcularTotales([linea("Pizza", 115, 1, "pizza")], d, conIva);
    expect(t.descGeneral).toBe(centavos(11.5));
    expect(t.total).toBe(centavos(103.5));
  });
});

describe("descuento manual por linea", () => {
  it("se aplica antes que los de categoria y general", () => {
    const l: LineaOrden[] = [
      { ...linea("Diabla", 300, 1, "pizza"),
        descuentoLinea: { tipo: "monto", valor: centavos(100) } },
    ];
    const t = calcularTotales(l, [{ alcance: "pizza", tipo: "porcentaje", valor: 1000 }], CONFIG_DEFAULT);
    expect(t.descLineas).toBe(centavos(100));
    expect(t.descPizzas).toBe(centavos(20)); // 10% de 200, no de 300
    expect(t.baseProductos).toBe(centavos(180));
  });

  it("no puede dejar la linea en negativo", () => {
    const l: LineaOrden[] = [
      { ...linea("Diabla", 300, 1, "pizza"),
        descuentoLinea: { tipo: "monto", valor: centavos(9999) } },
    ];
    const t = calcularTotales(l, [], CONFIG_DEFAULT);
    expect(t.lineas[0].neto).toBe(0);
    expect(t.total).toBe(0);
  });
});

describe("modificadores", () => {
  it("el recargo del modificador entra en el bruto y se multiplica por cantidad", () => {
    const l: LineaOrden[] = [
      { ...linea("Diabla", 300, 2, "pizza"),
        modificadores: [{ nombre: "Extra queso", precio: centavos(50) }] },
    ];
    const t = calcularTotales(l, [], CONFIG_DEFAULT);
    expect(t.subtotalBruto).toBe(centavos(700)); // (300 + 50) * 2
  });
});

describe("multimoneda", () => {
  it("convierte el total a dolares con el tipo de cambio configurado", () => {
    const t = calcularTotales([linea("Pizza", 368, 1, "pizza")], [], {
      ...CONFIG_DEFAULT, tipoCambio: centavos(36.8),
    });
    expect(t.total).toBe(centavos(423.2));   // 368 + 15%
    expect(t.totalUsd).toBe(1150);           // US$ 11.50
  });

  it("sin tipo de cambio no calcula equivalente", () => {
    const t = calcularTotales(pedido, [], CONFIG_DEFAULT);
    expect(t.totalUsd).toBeNull();
  });
});

describe("precision: redondeo solo al final", () => {
  it("el IVA sale de la base sin redondear, no de una base ya redondeada", () => {
    // 3 lineas con un descuento que produce fracciones de centavo
    const l: LineaOrden[] = [
      linea("A", 33.33, 1, "pizza"),
      linea("B", 33.33, 1, "pizza"),
      linea("C", 33.34, 1, "pizza"),
    ];
    const d: Descuento[] = [{ alcance: "general", tipo: "porcentaje", valor: 3333 }];
    const t = calcularTotales(l, d, CONFIG_DEFAULT);
    // El total tiene que ser consistente con la base y el IVA reportados
    expect(t.baseProductos + t.iva).toBe(t.total);
  });

  it("los descuentos repartidos suman exactamente el descuento total", () => {
    const d: Descuento[] = [{ alcance: "general", tipo: "monto", valor: centavos(777) }];
    const t = calcularTotales(pedido, d, CONFIG_DEFAULT);
    const suma = t.lineas.reduce((a, l) => a + l.descTotal, 0);
    expect(suma).toBe(t.descTotal);
    expect(t.descTotal).toBe(centavos(777));
  });
});

// ---------------------------------------------------------------------------
// Empaque: C$ por PIZZA cuando la orden sale del local.
// ---------------------------------------------------------------------------
describe("empaque por pizza", () => {
  const pizza = (nombre: string, precio: number, cantidad = 1): LineaOrden => ({
    id: nombre, productoId: nombre, nombre, precioUnit: centavos(precio),
    cantidad, grupo: "pizza",
  });
  const bebida: LineaOrden = {
    id: "b", productoId: "b", nombre: "Toña", precioUnit: centavos(60),
    cantidad: 4, grupo: "bebida",
  };
  const conEmpaque = { ...CONFIG_DEFAULT, cobrarEmpaque: true };

  it("en mesa no se cobra: no hay caja que pagar", () => {
    const t = calcularTotales([pizza("Criolla", 250)], [], CONFIG_DEFAULT);
    expect(t.empaque).toBe(0);
    expect(t.pizzasEmpacadas).toBe(0);
  });

  it("cuenta UNIDADES, no líneas: tres en una línea son tres cajas", () => {
    const t = calcularTotales([pizza("Criolla", 250, 3)], [], conEmpaque);
    expect(t.pizzasEmpacadas).toBe(3);
    expect(t.empaque).toBe(centavos(90));
  });

  it("solo las pizzas pagan empaque; las bebidas no", () => {
    const t = calcularTotales([pizza("Criolla", 250), bebida], [], conEmpaque);
    expect(t.pizzasEmpacadas).toBe(1);
    expect(t.empaque).toBe(centavos(30));
  });

  it("paga IVA, porque se vende junto con la comida", () => {
    const sinEmpaque = calcularTotales([pizza("Criolla", 250)], [], CONFIG_DEFAULT);
    const conE = calcularTotales([pizza("Criolla", 250)], [], conEmpaque);
    // C$30 de empaque + su 15% = C$34.50 más caro.
    expect(conE.total - sinEmpaque.total).toBe(centavos(34.5));
    expect(conE.iva - sinEmpaque.iva).toBe(centavos(4.5));
  });

  it("se puede dejar exento sin tocar código", () => {
    const t = calcularTotales([pizza("Criolla", 250)], [],
      { ...conEmpaque, empaqueGravado: false });
    expect(t.empaque).toBe(centavos(30));
    // El IVA es solo el de la pizza: 250 × 15%
    expect(t.iva).toBe(centavos(37.5));
  });

  it("no recibe descuento ni genera propina, igual que el envío", () => {
    const base = { ...conEmpaque, cobrarPropina: true, propinaBps: 1000 };
    const t = calcularTotales([pizza("Criolla", 200)], [], base);
    // La propina sale del producto (C$200), no del empaque.
    expect(t.propina).toBe(centavos(20));

    const conDesc = calcularTotales([pizza("Criolla", 200)],
      [{ alcance: "general", tipo: "porcentaje", valor: 5000 }], conEmpaque);
    // El 50% se lo lleva la pizza; el empaque sigue costando C$30.
    expect(conDesc.empaque).toBe(centavos(30));
  });

  it("una mitad y mitad es UNA caja, no dos", () => {
    const mitades: LineaOrden = {
      id: "m", productoId: "", nombre: "Criolla / La Fabulosa",
      precioUnit: centavos(350), cantidad: 1, grupo: "pizza",
      mitades: [
        { productoId: "a", nombre: "Criolla", precio: centavos(250) },
        { productoId: "b", nombre: "La Fabulosa", precio: centavos(450) },
      ],
    };
    const t = calcularTotales([mitades], [], conEmpaque);
    expect(t.pizzasEmpacadas).toBe(1);
    expect(t.empaque).toBe(centavos(30));
  });

  it("con tarifa en cero no cobra nada aunque esté encendido", () => {
    const t = calcularTotales([pizza("Criolla", 250)], [],
      { ...conEmpaque, empaquePorPizza: 0 });
    expect(t.empaque).toBe(0);
  });
});

// Promos de dos pizzas — 2026-09-23
//
// El dueño las fijó en C$500 que el cliente PAGA, con las cajas y el IVA ya
// adentro. Eso obliga a guardar la BASE, no los C$500: si se guardaran 500 y
// el motor les sumara el 15%, el cliente pagaría C$575.
//
// 50000 / 1.15 = 43478.26 centavos, y la columna es entera. Se guarda 43478,
// que al sumarle el IVA da exactamente C$500.00.
describe("promos de dos pizzas", () => {
  const PROMO_BASE = 43478;
  const promo = (cantidad = 1): LineaOrden => ({
    id: "p", productoId: "p", nombre: "Promo 2 Hawaianas",
    precioUnit: PROMO_BASE, cantidad,
    // "otro" y no "pizza": la promo ya trae las cajas, así que el empaque
    // por pizza NO se le suma encima.
    grupo: "otro",
  });

  it("una promo le cuesta al cliente exactamente C$500.00", () => {
    const t = calcularTotales([promo()], [], CONFIG_DEFAULT);
    expect(t.total).toBe(centavos(500));
  });

  it("el IVA sale desglosado, no escondido: la promo no es exenta", () => {
    const t = calcularTotales([promo()], [], CONFIG_DEFAULT);
    expect(t.iva).toBe(centavos(65.22));
    expect(t.baseGravable).toBe(centavos(434.78));
    expect(t.baseExenta).toBe(0);
  });

  it("no se le cobra empaque aunque la orden salga del local", () => {
    const t = calcularTotales([promo()], [],
      { ...CONFIG_DEFAULT, cobrarEmpaque: true });
    expect(t.empaque).toBe(0);
    expect(t.pizzasEmpacadas).toBe(0);
    expect(t.total).toBe(centavos(500));
  });

  // Esta prueba fija un DEFECTO conocido, para que nadie lo "arregle" de la
  // forma equivocada. 50000 / 1.15 no cae en centavos enteros, así que dos
  // promos dan C$999.99 y no C$1000.00.
  //
  // Las dos salidas obvias son peores:
  //  - Marcar la promo como exenta de IVA daría totales redondos, pero le
  //    miente al contador: el IVA del cierre saldría por debajo.
  //  - Redondear el total de cada línea rompe "redondeo solo en el total
  //    final", que es la regla del spec y afecta a toda la carta.
  // Un centavo sobre C$1000, en un país donde no circulan monedas de ese
  // tamaño, cuesta menos que cualquiera de las dos.
  it("dos promos dan C$999.99, y es a propósito", () => {
    const t = calcularTotales([promo(2)], [], CONFIG_DEFAULT);
    expect(t.total).toBe(centavos(999.99));
    expect(t.baseExenta).toBe(0);
  });

  // La tarjeta del menú muestra el precio CON IVA solo para las promos, para
  // que nadie cotice los C$434.78 por teléfono. Esta prueba fija que ese
  // número y el total del cobro sean el mismo: si un día se cambia el precio
  // de la promo y solo cuadra uno de los dos, la caja discute con la tarjeta.
  it("lo que muestra la tarjeta es lo que termina cobrando", () => {
    const enTarjeta = PROMO_BASE + aplicarBps(PROMO_BASE, CONFIG_DEFAULT.ivaBps);
    const t = calcularTotales([promo()], [], CONFIG_DEFAULT);
    expect(enTarjeta).toBe(t.total);
    expect(enTarjeta).toBe(centavos(500));
  });

  it("una pizza suelta en la misma orden SÍ paga su caja", () => {
    const suelta: LineaOrden = {
      id: "s", productoId: "s", nombre: "Diabla",
      precioUnit: centavos(300), cantidad: 1, grupo: "pizza",
    };
    const t = calcularTotales([promo(), suelta], [],
      { ...CONFIG_DEFAULT, cobrarEmpaque: true });
    // Una sola caja: la de la Diabla. Las dos de la promo ya están pagadas.
    expect(t.pizzasEmpacadas).toBe(1);
    expect(t.empaque).toBe(centavos(30));
  });
});

// Extras de pizza — 2026-09-23
//
// El motor los sumaba desde la fase 2 (`modificadores`), pero no había forma
// de agregarlos desde la caja. Estas pruebas fijan lo que ya hacía, ahora que
// se van a usar de verdad.
describe("extras de pizza", () => {
  const diabla = (cantidad = 1, extras: { nombre: string; precio: number }[] = []): LineaOrden => ({
    id: "d", productoId: "d", nombre: "Diabla", precioUnit: centavos(300),
    cantidad, grupo: "pizza", modificadores: extras,
  });
  const BACON = { nombre: "Extra Bacon", precio: centavos(60) };
  const BORDE = { nombre: "Borde de queso", precio: centavos(85) };

  it("el extra se suma al precio de la pizza, y paga IVA como ella", () => {
    const t = calcularTotales([diabla(1, [BACON])], [], CONFIG_DEFAULT);
    expect(t.subtotalBruto).toBe(centavos(360));
    expect(t.iva).toBe(centavos(54));
    expect(t.total).toBe(centavos(414));
  });

  it("con cantidad 2, el extra va en las dos pizzas de la línea", () => {
    const t = calcularTotales([diabla(2, [BACON, BORDE])], [], CONFIG_DEFAULT);
    // (300 + 60 + 85) × 2
    expect(t.subtotalBruto).toBe(centavos(890));
  });

  it("el empaque cuenta pizzas, no extras", () => {
    const t = calcularTotales([diabla(2, [BACON, BORDE])], [],
      { ...CONFIG_DEFAULT, cobrarEmpaque: true });
    expect(t.pizzasEmpacadas).toBe(2);
    expect(t.empaque).toBe(centavos(60));
  });

  it("un descuento a pizzas alcanza también al extra que lleva encima", () => {
    const t = calcularTotales([diabla(1, [BACON])],
      [{ alcance: "pizza", tipo: "porcentaje", valor: 1000 }], CONFIG_DEFAULT);
    // 10% de 360, no de 300: el extra es parte de esa pizza.
    expect(t.descPizzas).toBe(centavos(36));
  });
});
