import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdaptadorRawBT, PAQUETE_RAWBT } from "./rawbt";

/** Stub mínimo de navegador para probar la construcción del intent. */
function enAndroid(destino: { href: string }) {
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 13)" });
  vi.stubGlobal("localStorage", {
    getItem: () => null, setItem: () => {}, removeItem: () => {},
  });
  vi.stubGlobal("location", {
    origin: "https://pos.example", pathname: "/estacion", search: "",
    get href() { return destino.href; },
    set href(v: string) { destino.href = v; },
  });
  vi.stubGlobal("window", { location: destino });
  vi.stubGlobal("btoa", (s: string) => Buffer.from(s, "binary").toString("base64"));
}

describe("adaptador RawBT", () => {
  let destino: { href: string };
  beforeEach(() => { destino = { href: "" }; enAndroid(destino); });

  it("arma el intent con el formato que RawBT espera", async () => {
    await new AdaptadorRawBT().imprimir(new Uint8Array([0x1b, 0x40, 0x41]));
    expect(destino.href).toMatch(/^intent:base64,/);
    expect(destino.href).toContain(`package=${PAQUETE_RAWBT}`);
    expect(destino.href).toContain("scheme=rawbt");
    expect(destino.href.endsWith("end;")).toBe(true);
  });

  it("codifica los bytes ESC/POS en base64, sin escaparlos de más", async () => {
    await new AdaptadorRawBT().imprimir(new Uint8Array([0x1b, 0x40, 0x41]));
    const b64 = destino.href.slice("intent:base64,".length).split("#")[0];
    expect(Buffer.from(b64, "base64")).toEqual(Buffer.from([0x1b, 0x40, 0x41]));
  });

  it("incluye la URL de rebote: es la única forma de saber si falta la app", async () => {
    await new AdaptadorRawBT().imprimir(new Uint8Array([0x41]));
    expect(destino.href).toContain("S.browser_fallback_url=");
    expect(decodeURIComponent(destino.href)).toContain("?sinrawbt=1");
  });

  it("rechaza trabajos que no caben en un intent en vez de fallar mudo", async () => {
    // El modo imagen puede pasarse del límite; mejor un error claro.
    await expect(new AdaptadorRawBT().imprimir(new Uint8Array(200_000)))
      .rejects.toThrow(/no cabe en un intent/);
  });

  it("no se ofrece fuera de Android", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone)" });
    const a = new AdaptadorRawBT();
    expect(a.disponible()).toBe(false);
    expect(a.motivoNoDisponible()).toContain("app de Android");
  });

  it("saber que falta la app no lo vuelve indisponible: hay que poder reintentar", () => {
    // Antes esto lo sacaba de la lista de métodos, y como la lista se calcula
    // una sola vez, "ya la instalé" no lo traía de vuelta.
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (k === "approck:rawbt" ? "no" : null),
      setItem: () => {}, removeItem: () => {},
    });
    const a = new AdaptadorRawBT();
    expect(a.disponible()).toBe(true);
    expect(a.motivoNoDisponible()).toContain("no está instalada");
  });
});
