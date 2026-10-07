import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatosGuardarOrden } from "../repo";
import type { OrdenLocal } from "./tipos";

/*
  El camino de una orden desde la caja: con señal sube, sin señal se encola.
  Lo que se fija aquí es que el MISMO pedido nunca termine como dos órdenes,
  ni subiendo dos veces ni encolándose dos veces.
*/

const estado = {
  enLinea: true,
  cola: new Map<string, OrdenLocal>(),
  subidas: [] as string[],
};

vi.mock("./conexion", () => ({ hayInternet: async () => estado.enLinea }));
vi.mock("../repo", () => ({
  guardarYEncolar: async (d: DatosGuardarOrden) => {
    estado.subidas.push(d.idLocal!);
    return {
      orden: { id: "remota", numero: 150, created_at: "", estado: "pagada" },
      yaExistia: estado.subidas.filter((x) => x === d.idLocal).length > 1,
      impreso: true,
    };
  },
}));
vi.mock("./db", () => ({
  encolarOrdenLocal: async (o: OrdenLocal) => { estado.cola.set(o.idLocal, o); },
  leerOrdenLocal: async (id: string) => estado.cola.get(id) ?? null,
  actualizarOrdenLocal: async (id: string, p: Partial<OrdenLocal>) => {
    Object.assign(estado.cola.get(id)!, p);
  },
  siguienteNumeroTemp: async () => estado.cola.size + 1,
  contarPorEstado: async () => ({ pendientes: 0, conError: 0 }),
  leerMenuLocal: async () => null,
  ordenesPendientes: async () => [],
  purgarSincronizadas: async () => {},
}));

const { guardarOrden } = await import("./servicio");

const pedido = (extra: Partial<DatosGuardarOrden> = {}) =>
  ({ idLocal: "pedido-1", lineas: [], descuentos: [], estado: "abierta", ...extra }) as unknown as DatosGuardarOrden;

beforeEach(() => {
  estado.enLinea = true; estado.cola.clear(); estado.subidas = [];
});

describe("con señal", () => {
  it("sube con el idLocal que puso la caja, no con uno inventado", async () => {
    await guardarOrden(pedido());
    expect(estado.subidas).toEqual(["pedido-1"]);
  });

  it("informa cuando el reintento era una orden que ya estaba", async () => {
    await guardarOrden(pedido());
    const r = await guardarOrden(pedido());
    expect(r.yaExistia).toBe(true);
  });
});

describe("sin señal", () => {
  beforeEach(() => { estado.enLinea = false; });

  it("encola con el idLocal de la caja", async () => {
    const r = await guardarOrden(pedido());
    expect(r.offline).toBe(true);
    expect(estado.cola.has("pedido-1")).toBe(true);
  });

  it("guardar dos veces el mismo pedido actualiza la misma entrada, no crea otra", async () => {
    const a = await guardarOrden(pedido({ notas: "primera" }));
    const b = await guardarOrden(pedido({ notas: "segunda" }));
    expect(estado.cola.size).toBe(1);
    expect(b.numero).toBe(a.numero);
    expect(estado.cola.get("pedido-1")!.payload.notas).toBe("segunda");
  });

  it("dos pedidos distintos son dos entradas", async () => {
    await guardarOrden(pedido({ idLocal: "pedido-1" }));
    await guardarOrden(pedido({ idLocal: "pedido-2" }));
    expect(estado.cola.size).toBe(2);
  });

  it("el idLocal viaja dentro de lo encolado: la subida usa el mismo", async () => {
    await guardarOrden(pedido());
    expect(estado.cola.get("pedido-1")!.payload.idLocal).toBe("pedido-1");
  });
});
