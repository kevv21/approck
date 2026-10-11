import { describe, expect, it } from "vitest";
import { hayNueva, ultimaDe, versionDeEtiqueta } from "./actualizacion";

const rel = (tag: string, extra: Partial<{ draft: boolean; prerelease: boolean; apk: boolean }> = {}) => ({
  tag_name: tag, draft: extra.draft ?? false, prerelease: extra.prerelease ?? false,
  published_at: "2026-10-11T00:00:00Z", body: null,
  assets: extra.apk === false ? [] : [{ name: `Rockzza-${tag}.apk`, browser_download_url: `https://github.com/x/${tag}.apk` }],
});

describe("qué versión de APK hay publicada", () => {
  it("lee el número de la etiqueta", () => {
    expect(versionDeEtiqueta("apk-v12")).toBe(12);
    expect(versionDeEtiqueta("v12")).toBeNull();
    expect(versionDeEtiqueta("apk-v")).toBeNull();
    expect(versionDeEtiqueta("apk-v1.2")).toBeNull();
  });

  it("elige la más alta, no la más reciente de la lista", () => {
    expect(ultimaDe([rel("apk-v3"), rel("apk-v10"), rel("apk-v9")])?.version).toBe(10);
  });

  it("ignora borradores, pre-versiones, otras etiquetas y releases sin .apk", () => {
    const u = ultimaDe([
      rel("apk-v2"), rel("apk-v5", { draft: true }), rel("apk-v6", { prerelease: true }),
      rel("apk-v7", { apk: false }), rel("sitio-v99"),
    ]);
    expect(u?.version).toBe(2);
    expect(u?.url).toBe("https://github.com/x/apk-v2.apk");
  });

  it("sin nada publicado no hay nada que ofrecer", () => {
    expect(ultimaDe([])).toBeNull();
  });
});

describe("cuándo se avisa", () => {
  it("solo si la publicada es mayor que la instalada", () => {
    const u = ultimaDe([rel("apk-v5")]);
    expect(hayNueva(4, u)).toBe(true);
    expect(hayNueva(5, u)).toBe(false);
    expect(hayNueva(6, u)).toBe(false);
  });

  it("si no se sabe qué versión está instalada, no molesta", () => {
    expect(hayNueva(Number("abc"), ultimaDe([rel("apk-v5")]))).toBe(false);
    expect(hayNueva(3, null)).toBe(false);
  });
});
