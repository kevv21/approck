import { beforeEach, describe, expect, it, vi } from "vitest";
import { inicioDe, puede, puedeVer } from "./permisos";

/*
  Dos cuentas por PIN. Lo que no puede pasar:
  - que la cuenta de revisión cobre, imprima, anule o abra la caja;
  - que una sesión de antes de las cuentas se tome como maestra sin PIN;
  - que una base sin 17_accesos.sql deje a la caja fuera.
*/

const base = {
  rpc: null as null | ((pin: string) => { data: unknown; error: unknown }),
  pinHash: null as string | null,
};

vi.mock("../supabase", () => ({
  supabase: {
    rpc: async (_: string, args: { p_pin: string }) => base.rpc!(args.p_pin),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { pin_hash: base.pinHash }, error: null }) }) }),
    }),
  },
  hayConfig: true,
}));
vi.mock("../observabilidad", () => ({ identificar: () => {} }));

function almacen() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", almacen());
  vi.stubGlobal("localStorage", almacen());
  base.rpc = null;
  base.pinHash = null;
});

const { entrar, sesionActual, rolDelPin } = await import("./sesion");

describe("qué puede cada cuenta", () => {
  it("la maestra puede todo", () => {
    for (const a of ["cobrar", "imprimir", "anular", "turno"] as const) {
      expect(puede("maestra", a)).toBe(true);
    }
    expect(puedeVer("maestra", "/")).toBe(true);
    expect(puedeVer("maestra", "/impresora")).toBe(true);
  });

  it("revisión no cobra, no imprime, no anula ni toca la caja", () => {
    for (const a of ["cobrar", "imprimir", "anular", "turno"] as const) {
      expect(puede("revision", a)).toBe(false);
    }
  });

  it("revisión ve los pedidos y el inventario, no la Caja ni la Impresora", () => {
    expect(puedeVer("revision", "/cierre")).toBe(true);
    expect(puedeVer("revision", "/inventario")).toBe(true);
    expect(puedeVer("revision", "/configuracion")).toBe(true);
    expect(puedeVer("revision", "/")).toBe(false);
    expect(puedeVer("revision", "/impresora")).toBe(false);
    expect(inicioDe("revision")).toBe("/cierre");
  });

  it("sin sesión no se puede nada", () => {
    expect(puede(null, "cobrar")).toBe(false);
    expect(puedeVer(undefined, "/cierre")).toBe(false);
  });
});

describe("entrar", () => {
  it("el PIN decide la cuenta, según la base", async () => {
    base.rpc = (pin) => ({ data: pin === "2468" ? "maestra" : pin === "5555" ? "revision" : null, error: null });
    expect((await entrar("Ana", "2468"))?.rol).toBe("maestra");
    expect((await entrar("Luis", "5555"))?.rol).toBe("revision");
    expect(sesionActual()).toMatchObject({ nombre: "Luis", rol: "revision" });
    expect(await entrar("X", "0000")).toBeNull();
  });

  it("una respuesta rara de la base no abre ninguna cuenta", async () => {
    base.rpc = () => ({ data: "admin", error: null });
    expect(await rolDelPin("1234")).toBeNull();
  });

  it("un error de la base se informa, no se toma como PIN malo", async () => {
    base.rpc = () => ({ data: null, error: { code: "42501", message: "permission denied" } });
    await expect(rolDelPin("1234")).rejects.toMatchObject({ code: "42501" });
  });

  it("base sin las cuentas: vale el PIN viejo y entra como maestra", async () => {
    base.rpc = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    // SHA-256 de "1234", el PIN con que viene el instalador.
    base.pinHash = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4";
    expect(await rolDelPin("1234")).toBe("maestra");
    expect(await rolDelPin("9999")).toBeNull();
  });
});

describe("sesiones guardadas", () => {
  it("una sesión de antes de las cuentas (sin rol) obliga a poner el PIN otra vez", () => {
    sessionStorage.setItem("approck:sesion", JSON.stringify({ nombre: "Ana", desde: "2026-10-01" }));
    expect(sesionActual()).toBeNull();
  });

  it("una sesión con un rol inventado tampoco vale", () => {
    sessionStorage.setItem("approck:sesion", JSON.stringify({ nombre: "Ana", desde: "x", rol: "admin" }));
    expect(sesionActual()).toBeNull();
  });
});
