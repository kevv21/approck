import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  Por dónde sale el papel. La regla tiene que poder decirse en voz alta:
  si este teléfono tiene su propia impresora, imprime él; si no, la PC.
*/

const entorno = { apk: false, ble: false, elegida: null as null | { direccion: string; nombre: string } };
const enviados: { datos: string; direccion: string }[] = [];
const porBle: Uint8Array[] = [];

vi.mock("../nativo/rockzza", () => ({
  enApk: () => entorno.apk,
  Rockzza: { imprimir: async (o: { datos: string; direccion: string }) => { enviados.push(o); } },
}));
vi.mock("./bluetooth", () => ({
  AdaptadorBluetooth: class {
    estado() { return { conectada: entorno.ble }; }
    async imprimir(b: Uint8Array) { porBle.push(b); }
  },
}));
vi.mock("./puente", () => ({ AdaptadorPuente: class {} }));

const mem = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
});

const { salidaDirecta, imprimirDirecto } = await import("./salida");
const { guardarImpresora, impresoraElegida } = await import("./telefono");

beforeEach(() => {
  entorno.apk = false; entorno.ble = false; mem.clear();
  enviados.length = 0; porBle.length = 0;
});

describe("en el APK", () => {
  it("con impresora elegida imprime el teléfono, aunque nadie la haya conectado en esta sesión", async () => {
    entorno.apk = true;
    guardarImpresora({ direccion: "66:22:AA:BB:CC:01", nombre: "PT-210" });
    expect(salidaDirecta()).toBe("telefono");
    await imprimirDirecto(new Uint8Array([0x1b, 0x40, 0x41]));
    expect(enviados).toEqual([{ datos: btoa("\x1b@A"), direccion: "66:22:AA:BB:CC:01" }]);
  });

  it("sin impresora elegida, va a la PC", () => {
    entorno.apk = true;
    expect(salidaDirecta()).toBeNull();
  });

  it("el Bluetooth de Chrome no cuenta dentro del APK (ahí no existe)", () => {
    entorno.apk = true; entorno.ble = true;
    expect(salidaDirecta()).toBeNull();
  });

  it("dejar de usarla la borra del teléfono", () => {
    guardarImpresora({ direccion: "66:22:AA:BB:CC:01", nombre: "PT-210" });
    guardarImpresora(null);
    expect(impresoraElegida()).toBeNull();
  });
});

describe("en Chrome", () => {
  it("con la impresora BLE conectada imprime el teléfono", async () => {
    entorno.ble = true;
    expect(salidaDirecta()).toBe("bluetooth");
    await imprimirDirecto(new Uint8Array([1, 2]));
    expect(porBle).toHaveLength(1);
  });

  it("una impresora elegida en el APK no se usa fuera de él", () => {
    guardarImpresora({ direccion: "66:22:AA:BB:CC:01", nombre: "PT-210" });
    expect(salidaDirecta()).toBeNull();
  });

  it("sin nada conectado, va a la PC y no se puede imprimir directo", async () => {
    expect(salidaDirecta()).toBeNull();
    await expect(imprimirDirecto(new Uint8Array([1]))).rejects.toThrow(/no tiene impresora/);
  });
});
