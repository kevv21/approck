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
  // El dueño pidió que el papel diga solo esto. Ya no lleva la negación
  // explícita de "no es factura fiscal"; sigue sin afirmar que lo sea.
  it("el papel se declara hoja de consumo", () => {
    expect(previsualizarTicket(datos())).toContain("Hoja de consumo");
    expect(LEYENDA_FISCAL).toBe("Hoja de consumo");
  });

  it("se puede apagar la leyenda desde settings", () => {
    const txt = previsualizarTicket(datos({ mostrarLeyendaFiscal: false }));
    expect(txt).not.toContain("Hoja de consumo");
  });

  // El método de pago sale del papel por decisión del dueño. Para el arqueo
  // vive en la base, que es donde se cuadra la caja.
  it("no imprime el método de pago", () => {
    for (const m of ["efectivo", "banpro", "bac"] as const) {
      const txt = previsualizarTicket(datos({ metodoPago: m }));
      expect(txt, m).not.toContain("Pago:");
      expect(txt, m).not.toContain("Banpro");
      expect(txt, m).not.toContain("BAC");
    }
  });

  // Recibido y Cambio se quedan: no son la etiqueta del método, son la cuenta
  // que el cliente revisa en el mostrador antes de irse.
  it("sigue imprimiendo recibido y cambio en efectivo", () => {
    const txt = previsualizarTicket(datos({ metodoPago: "efectivo" }));
    expect(txt).toContain("Recibido:");
    expect(txt).toContain("Cambio:");
  });

  it("las reimpresiones se marcan COPIA, no REIMPRESIÓN", () => {
    const txt = previsualizarTicket(datos({ reimpresion: true }));
    expect(txt).toContain("COPIA");
    expect(txt).not.toContain("REIMPRESIÓN");
  });

  it("desglosa subtotal, descuentos, IVA, envío, propina y total", () => {
    const txt = previsualizarTicket(datos());
    for (const e of ["Subtotal", "Desc. pizzas", "IVA 15%", "Envío", "Propina", "TOTAL"]) {
      expect(txt, e).toContain(e);
    }
  });

  it("imprime el IVA aunque el total podría cuadrar sin él", () => {
    // Sin esta línea, el cliente ve un salto entre los productos y el total.
    const t = previsualizarTicket(datos());
    expect(t).toMatch(/IVA 15%\s+C\$\s+[\d.]+/);
  });

  it("los montos van con C$ y sin separador de miles", () => {
    const txt = previsualizarTicket(datos());
    expect(txt).toMatch(/TOTAL\s+C\$\s+\d+\.\d{2}/);
    expect(txt).not.toMatch(/C\$\s+\d,\d{3}/);
  });

  it("el importe del ítem va en la última línea del nombre partido", () => {
    const txt = previsualizarTicket(datos());
    const l = txt.split("\n");
    const i = l.findIndex((x) => x.includes("Hawaiana Super"));
    expect(l[i]).not.toMatch(/\d\.\d{2}$/);      // primera línea: sin monto
    expect(l[i + 1]).toMatch(/Saiyajin\s+\d+\.\d{2}$/); // última: con monto
  });

  it("lista los modificadores con su recargo", () => {
    expect(previsualizarTicket(datos())).toContain("Extra queso");
  });

  it("muestra el equivalente en dólares", () => {
    expect(previsualizarTicket(datos())).toContain("Equivale a US$");
  });

  it("identifica al mesero y al cajero", () => {
    const txt = previsualizarTicket(datos());
    expect(txt).toContain("Mesero: Ana");
    expect(txt).toContain("Cajero: Luis");
  });

  it("dice Cambio, como lo pidió el dueño", () => {
    const txt = previsualizarTicket(datos());
    expect(txt).toContain("Cambio:");
    expect(txt).not.toContain("Vuelto:");
  });

  it("abre con la línea de separación sobre el nombre del negocio", () => {
    const l = previsualizarTicket(datos()).split("\n");
    expect(l[0]).toBe("=".repeat(32));
    expect(l[1]).toContain("ROCK MUNCHIES");
  });

  it("centra el encabezado en la vista previa, igual que en el papel", () => {
    const l = previsualizarTicket(datos()).split("\n");
    expect(l[1]).toMatch(/^\s+ROCK MUNCHIES$/); // centrado, no pegado al borde
  });

  it("dice Orden, no Recibo", () => {
    expect(previsualizarTicket(datos())).toContain("Orden #0142");
  });
});

describe("pre-cuenta", () => {
  const txt = () => previsualizarTicket(datos({ documento: "precuenta" }));

  it("se identifica como pre-cuenta y advierte que no es comprobante", () => {
    expect(txt()).toContain("PRE-CUENTA");
    expect(txt()).toContain("No es comprobante de pago");
  });

  it("no muestra el pago ni el cajero porque todavía no se cobró", () => {
    expect(txt()).not.toContain("Cambio:");
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
  it("cada codepage codifica la ñ con SU propio byte", () => {
    // Este es el bug que tenía el selector: mandaba siempre bytes CP1252
    // aunque la impresora estuviera puesta en CP850, y salía basura.
    const cp437 = construirTicket(datos(), { codepage: 0 });
    const cp850 = construirTicket(datos(), { codepage: 2 });
    const cp1252 = construirTicket(datos(), { codepage: 16 });
    expect(Array.from(cp437)).toContain(0xa4);  // ñ en CP437
    expect(Array.from(cp850)).toContain(0xa4);  // ñ en CP850
    expect(Array.from(cp1252)).toContain(0xf1); // ñ en CP1252
    expect(Array.from(cp1252)).not.toContain(0xa4);
  });

  it("la vista previa se lee bien en cualquier codepage", () => {
    for (const cp of [0, 2, 16]) {
      expect(previsualizarTicket(datos(), cp), `cp${cp}`).toContain("Toña");
    }
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

// Empaque: si se cobra, tiene que verse en el recibo. Un total C$90 más alto
// sin línea que lo explique es la clase de cosa que el cliente reclama en la
// puerta y el repartidor no sabe contestar.
describe("empaque", () => {
  const conEmpaque = datos({
    totales: calcularTotales(lineas, [], {
      ...CONFIG_DEFAULT, cobrarEmpaque: true, tipoCambio: centavos(36.8),
    }),
  });

  it("imprime la línea con el conteo de pizzas", () => {
    const txt = previsualizarTicket(conEmpaque);
    // 1 Hawaiana + 2 Diablas = 3 cajas.
    expect(txt).toContain(transliterar("Empaque x3"));
    expect(txt).toContain("90.00");
  });

  it("no aparece cuando la orden es de mesa", () => {
    const txt = previsualizarTicket(datos({
      totales: calcularTotales(lineas, [], CONFIG_DEFAULT),
    }));
    expect(txt).not.toContain("Empaque");
  });
});
