import { describe, expect, it } from "vitest";
import { MAX_INTENTOS, sincronizar, type PuertoSync } from "./sync";
import type { OrdenLocal } from "./tipos";
import type { DatosGuardarOrden } from "../repo";
import { CONFIG_DEFAULT } from "../types";

const payload = {} as DatosGuardarOrden;

const orden = (idLocal: string, creadaAt: string, intentos = 0): OrdenLocal => ({
  idLocal, numeroTemp: 1, estado: "pendiente", payload,
  creadaAt, intentos,
});

/** Puerto falso en memoria, para probar el motor sin IndexedDB ni red. */
function puerteFalso(
  iniciales: OrdenLocal[],
  subir: (o: OrdenLocal) => Promise<{ idRemoto: string; numero: number }>
) {
  const store = new Map(iniciales.map((o) => [o.idLocal, { ...o }]));
  const ordenSubida: string[] = [];
  const marcas: { id: string; parche: Partial<OrdenLocal> }[] = [];

  const puerto: PuertoSync = {
    async pendientes() {
      return [...store.values()]
        .filter((o) => o.estado === "pendiente" || o.estado === "error")
        .sort((a, b) => a.creadaAt.localeCompare(b.creadaAt));
    },
    async subir(o) {
      ordenSubida.push(o.idLocal);
      return subir(o);
    },
    async marcar(id, parche) {
      marcas.push({ id, parche });
      Object.assign(store.get(id)!, parche);
    },
  };
  return { puerto, store, ordenSubida, marcas };
}

const ok = async (o: OrdenLocal) => ({ idRemoto: `r-${o.idLocal}`, numero: 100 });
const falla = async () => { throw new Error("sin conexión"); };

describe("orden de subida", () => {
  it("sube en el orden en que se crearon, no en el que estén guardadas", async () => {
    const f = puerteFalso(
      [orden("c", "2026-09-19T21:00:00Z"),
       orden("a", "2026-09-19T19:00:00Z"),
       orden("b", "2026-09-19T20:00:00Z")],
      ok
    );
    await sincronizar(f.puerto);
    expect(f.ordenSubida).toEqual(["a", "b", "c"]);
  });
});

describe("subida exitosa", () => {
  it("guarda el id remoto y el número real que asignó el servidor", async () => {
    const f = puerteFalso([orden("a", "2026-09-19T19:00:00Z")],
      async () => ({ idRemoto: "uuid-remoto", numero: 143 }));
    const r = await sincronizar(f.puerto);

    expect(r.subidas).toBe(1);
    const guardada = f.store.get("a")!;
    expect(guardada.estado).toBe("sincronizada");
    expect(guardada.idRemoto).toBe("uuid-remoto");
    expect(guardada.numeroReal).toBe(143);
    expect(guardada.error).toBeUndefined();
  });

  it("marca subiendo ANTES de subir, para no repetir si el proceso muere", async () => {
    const f = puerteFalso([orden("a", "2026-09-19T19:00:00Z")], ok);
    await sincronizar(f.puerto);
    expect(f.marcas[0].parche.estado).toBe("subiendo");
  });
});

describe("manejo de fallos", () => {
  it("se detiene al primer fallo en vez de quemar reintentos de todas", async () => {
    const f = puerteFalso(
      [orden("a", "2026-09-19T19:00:00Z"),
       orden("b", "2026-09-19T20:00:00Z"),
       orden("c", "2026-09-19T21:00:00Z")],
      falla
    );
    const r = await sincronizar(f.puerto);

    expect(f.ordenSubida).toEqual(["a"]); // no intentó b ni c
    expect(r.fallidas).toBe(1);
    expect(r.detenido).toBe(true);
    expect(f.store.get("b")!.intentos).toBe(0);
  });

  it("registra el error y cuenta el intento", async () => {
    const f = puerteFalso([orden("a", "2026-09-19T19:00:00Z")], falla);
    await sincronizar(f.puerto);
    const g = f.store.get("a")!;
    expect(g.estado).toBe("error");
    expect(g.intentos).toBe(1);
    expect(g.error).toBe("sin conexión");
  });

  it("reintenta las que quedaron en error", async () => {
    const f = puerteFalso([orden("a", "2026-09-19T19:00:00Z")], falla);
    await sincronizar(f.puerto);
    expect(f.store.get("a")!.estado).toBe("error");

    const f2 = puerteFalso([{ ...f.store.get("a")! }], ok);
    const r = await sincronizar(f2.puerto);
    expect(r.subidas).toBe(1);
    expect(f2.store.get("a")!.estado).toBe("sincronizada");
  });

  it("descarta las que pasaron el máximo de intentos, sin borrarlas", async () => {
    const f = puerteFalso(
      [orden("a", "2026-09-19T19:00:00Z", MAX_INTENTOS)], ok
    );
    const r = await sincronizar(f.puerto);

    expect(r.descartadas).toBe(1);
    expect(r.subidas).toBe(0);
    expect(f.ordenSubida).toEqual([]);
    // Sigue existiendo para que alguien la revise a mano.
    expect(f.store.get("a")).toBeDefined();
  });

  it("una descartada no impide subir las siguientes", async () => {
    const f = puerteFalso(
      [orden("vieja", "2026-09-19T18:00:00Z", MAX_INTENTOS),
       orden("nueva", "2026-09-19T19:00:00Z")],
      ok
    );
    const r = await sincronizar(f.puerto);
    expect(r.descartadas).toBe(1);
    expect(r.subidas).toBe(1);
    expect(f.ordenSubida).toEqual(["nueva"]);
  });
});

describe("sin pendientes", () => {
  it("no hace nada y no falla", async () => {
    const f = puerteFalso([], ok);
    const r = await sincronizar(f.puerto);
    expect(r).toEqual({ subidas: 0, fallidas: 0, descartadas: 0, detenido: false });
  });

  it("ignora las que ya están sincronizadas", async () => {
    const f = puerteFalso(
      [{ ...orden("a", "2026-09-19T19:00:00Z"), estado: "sincronizada" }], ok
    );
    const r = await sincronizar(f.puerto);
    expect(r.subidas).toBe(0);
    expect(f.ordenSubida).toEqual([]);
  });
});

describe("configuración por defecto", () => {
  it("la propina viene apagada: se prende por orden", () => {
    expect(CONFIG_DEFAULT.cobrarPropina).toBe(false);
  });
});
