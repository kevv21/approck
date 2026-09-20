import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Este módulo tumbó un despliegue en Vercel: `createClient("")` lanza
 * "supabaseUrl is required", y como el cliente se construía al cargar el
 * módulo, el error salía durante el prerenderizado y rompía el build entero.
 *
 * Las pruebas fijan las dos garantías: importar nunca lanza, y el cliente no
 * se construye hasta que alguien lo usa.
 */
const cargar = async () => {
  vi.resetModules();
  return import("./supabase");
};

afterEach(() => {
  vi.doUnmock("@supabase/supabase-js");
  vi.restoreAllMocks();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

describe("importar el módulo nunca rompe el build", () => {
  it("con las variables vacías — el caso que falló en Vercel", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    const m = await cargar();
    expect(m.hayConfig).toBe(false);
  });

  it("con las variables ausentes", async () => {
    const m = await cargar();
    expect(m.hayConfig).toBe(false);
  });

  it("con el marcador de .env.example sin reemplazar", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://xxxxxxxxxxxx.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOi...";
    const m = await cargar();
    expect(m.hayConfig).toBe(false);
  });

  it("con una URL que no es URL", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "no-es-una-url";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "abc";
    const m = await cargar();
    expect(m.hayConfig).toBe(false);
  });

  it("con configuración real sí reconoce que la hay", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefghij.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.x.y";
    const m = await cargar();
    expect(m.hayConfig).toBe(true);
  });
});

describe("construcción perezosa", () => {
  it("el cliente no se crea al importar, sino al primer uso", async () => {
    const createClient = vi.fn(() => ({ from: vi.fn() }));
    vi.doMock("@supabase/supabase-js", () => ({ createClient }));
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    const m = await cargar();
    expect(createClient).not.toHaveBeenCalled();
    // Importar no tocó createClient; usarlo sí lo construye.
    expect(typeof m.supabase.from).toBe("function");
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("devuelve siempre la misma instancia", async () => {
    const createClient = vi.fn(() => ({ from: vi.fn() }));
    vi.doMock("@supabase/supabase-js", () => ({ createClient }));
    const m = await cargar();
    expect(m.supabase.from).toBeDefined();
    expect(m.supabase.from).toBeDefined();
    expect(createClient).toHaveBeenCalledTimes(1);
  });
});
