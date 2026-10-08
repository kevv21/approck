import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG_DEFAULT, type LineaOrden } from "./types";
import type { DatosGuardarOrden } from "./repo";

/*
  Guardar una orden: lo que no puede pasar nunca es que la venta salga dos
  veces en el cierre, ni que una orden guardada parezca no guardada.

  Se simula la base con lo justo: la funcion `crear_orden` (idempotente por
  id_local, como la de 16_crear_orden.sql), la cola de impresion y las tablas
  del camino viejo.
*/

interface Fila { id: string; numero: number; created_at: string; estado: string; id_local: string; total: number }

const base = {
  ordenes: [] as Fila[],
  items: [] as Record<string, unknown>[],
  jobs: [] as { orden_id: string; tipo: string }[],
  rpcs: [] as { p_orden: Record<string, unknown>; p_items: unknown[] }[],
  /** Simula una base sin la funcion nueva (instalador sin correr). */
  sinFuncion: false,
  /** La cola de impresion falla (puente caido, sin permiso, etc.). */
  colaFalla: false,
};

function reiniciar() {
  base.ordenes = []; base.items = []; base.jobs = []; base.rpcs = [];
  base.sinFuncion = false; base.colaFalla = false;
}

function nuevaFila(o: Record<string, unknown>): Fila {
  const f = {
    ...(o as object), id: `o${base.ordenes.length + 1}`, numero: 100 + base.ordenes.length,
    created_at: "2026-10-08T20:00:00Z",
  } as unknown as Fila;
  base.ordenes.push(f);
  return f;
}

vi.mock("./supabase", () => {
  const tabla = (nombre: string) => {
    const filtros: [string, unknown][] = [];
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { filtros.push([c, v]); return q; },
      maybeSingle: async () => {
        const f = base.ordenes.find((o) => filtros.every(([c, v]) => (o as never)[c] === v));
        return { data: f ?? null, error: null };
      },
      insert: (v: unknown) => {
        if (nombre === "print_job") {
          if (base.colaFalla) return Promise.resolve({ error: { message: "cola caida" } });
          base.jobs.push(v as { orden_id: string; tipo: string });
          return Promise.resolve({ error: null });
        }
        if (nombre === "orden_item") { base.items.push(...(v as Record<string, unknown>[])); return Promise.resolve({ error: null }); }
        if (nombre === "orden") {
          const f = nuevaFila(v as Record<string, unknown>);
          return { select: () => ({ single: async () => ({ data: f, error: null }) }) };
        }
        return Promise.resolve({ error: null });
      },
      then: (res: (x: unknown) => void) => {
        // select head:true count de print_job
        const n = base.jobs.filter((j) => filtros.every(([c, v]) => (j as never)[c] === v)).length;
        res({ count: n, error: null });
      },
    };
    return q;
  };
  return {
    supabase: {
      from: tabla,
      rpc: async (nombre: string, args: { p_orden: Record<string, unknown>; p_items: unknown[] }) => {
        if (nombre !== "crear_orden" || base.sinFuncion) {
          return { data: null, error: { code: "PGRST202", message: "Could not find the function public.crear_orden" } };
        }
        base.rpcs.push(args);
        const previa = base.ordenes.find((o) => o.id_local === args.p_orden.id_local);
        if (previa) return { data: { orden: previa, ya_existia: true }, error: null };
        const f = nuevaFila(args.p_orden);
        base.items.push(...(args.p_items as Record<string, unknown>[]).map((i) => ({ ...i, orden_id: f.id })));
        return { data: { orden: f, ya_existia: false }, error: null };
      },
    },
    hayConfig: true,
  };
});
vi.mock("./auth/auditoria", () => ({ registrar: async () => {} }));
vi.mock("./auth/sesion", () => ({ sesionActual: () => ({ nombre: "Ana" }) }));
vi.mock("./observabilidad", () => ({ reportarError: () => {} }));



const { guardarYEncolar, imprimirDocumento } = await import("./repo");

const pizza: LineaOrden = {
  id: "l1", productoId: "", nombre: "Hawaiana", precioUnit: 29000, cantidad: 1,
  grupo: "pizza", aplicaIva: true,
};

const datos = (extra: Partial<DatosGuardarOrden> = {}): DatosGuardarOrden => ({
  lineas: [pizza], descuentos: [], config: { ...CONFIG_DEFAULT }, tipo: "mesa",
  metodoPago: "efectivo", estado: "pagada", idLocal: "pedido-1", ...extra,
});

beforeEach(reiniciar);

describe("cobrar dos veces el mismo pedido", () => {
  it("el reintento con el mismo idLocal devuelve la misma orden, no otra", async () => {
    const a = await guardarYEncolar(datos());
    const b = await guardarYEncolar(datos());
    expect(base.ordenes).toHaveLength(1);
    expect(b.orden.id).toBe(a.orden.id);
    expect(a.yaExistia).toBe(false);
    expect(b.yaExistia).toBe(true);
  });

  it("el reintento no imprime un segundo ticket si el primero ya estaba en cola", async () => {
    await guardarYEncolar(datos());
    await guardarYEncolar(datos());
    expect(base.jobs.filter((j) => j.tipo === "cliente")).toHaveLength(1);
  });

  it("si el primer intento se guardó pero el ticket no, el reintento lo encola", async () => {
    base.colaFalla = true;
    const a = await guardarYEncolar(datos());
    expect(a.impreso).toBe(false);
    expect(base.jobs).toHaveLength(0);

    base.colaFalla = false;
    const b = await guardarYEncolar(datos());
    expect(b.yaExistia).toBe(true);
    expect(b.impreso).toBe(true);
    expect(base.jobs).toHaveLength(1);
    expect(base.ordenes).toHaveLength(1);
  });

  it("pedidos distintos son órdenes distintas", async () => {
    await guardarYEncolar(datos({ idLocal: "pedido-1" }));
    await guardarYEncolar(datos({ idLocal: "pedido-2" }));
    expect(base.ordenes).toHaveLength(2);
  });
});

describe("un fallo de impresión no es un fallo al guardar", () => {
  it("la orden queda guardada y se informa sin ticket, sin lanzar", async () => {
    base.colaFalla = true;
    const r = await guardarYEncolar(datos());
    expect(r.orden.numero).toBe(100);
    expect(r.impreso).toBe(false);
    expect(base.ordenes).toHaveLength(1);
  });
});

describe("lo que se manda a la base", () => {
  it("orden y líneas van en UNA sola llamada, con el idLocal del pedido", async () => {
    await guardarYEncolar(datos());
    expect(base.rpcs).toHaveLength(1);
    expect(base.rpcs[0].p_orden.id_local).toBe("pedido-1");
    expect(base.rpcs[0].p_items).toHaveLength(1);
    // Hawaiana 290 + 15% = 333.50
    expect(base.rpcs[0].p_orden.total).toBe(33350);
  });

  it("guardar sin cobrar no imprime y no queda como pagada", async () => {
    const r = await guardarYEncolar(datos({ estado: "abierta" }));
    expect(r.orden.estado).toBe("abierta");
    expect(base.rpcs[0].p_orden.cerrada_at).toBeNull();
    expect(base.jobs).toHaveLength(0);
  });

  it("sin idLocal se inventa uno: nunca se manda vacío", async () => {
    await guardarYEncolar(datos({ idLocal: undefined }));
    expect(String(base.rpcs[0].p_orden.id_local)).toMatch(/[0-9a-f-]{36}/);
  });
});

describe("base sin actualizar (falta crear_orden)", () => {
  it("guarda por el camino viejo en vez de dejar la caja parada", async () => {
    base.sinFuncion = true;
    const r = await guardarYEncolar(datos());
    expect(r.orden.numero).toBe(100);
    expect(base.items).toHaveLength(1);
    expect(base.items[0].orden_id).toBe(r.orden.id);
  });

  it("y aun así no duplica en el reintento", async () => {
    base.sinFuncion = true;
    await guardarYEncolar(datos());
    const b = await guardarYEncolar(datos());
    expect(b.yaExistia).toBe(true);
    expect(base.ordenes).toHaveLength(1);
  });
});

describe("por dónde sale el ticket", () => {
  it("queda en la cola como pendiente, para que lo imprima la PC de caja", async () => {
    await guardarYEncolar(datos());
    expect(base.jobs).toHaveLength(1);
    expect((base.jobs[0] as { estado?: string }).estado).toBeUndefined(); // pendiente por defecto
    expect((base.jobs[0] as { tipo: string }).tipo).toBe("cliente");
  });

  it("la pre-cuenta también va a la cola, sin orden asociada", async () => {
    await imprimirDocumento(null, "precuenta", {
      numero: 0, tipo: "mesa", fecha: new Date(), totales: { lineas: [] } as never,
    });
    expect(base.jobs).toEqual([expect.objectContaining({ orden_id: null, tipo: "precuenta" })]);
  });
});
