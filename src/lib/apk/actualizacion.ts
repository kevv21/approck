/**
 * ACTUALIZAR EL APK
 *
 * Casi nada necesita un APK nuevo: la app viene de Vercel y se actualiza sola
 * con cada publicación. El APK cambia solo cuando cambia la parte de Android
 * (la impresora, el ícono, los permisos). Entonces GitHub lo compila y lo
 * publica como «release» con la etiqueta `apk-v<número>`, y la app avisa.
 *
 * El número es el `versionCode` de Android: lo pone el workflow
 * (.github/workflows/apk.yml) y lo lee la app con App.getInfo().build.
 */

export const REPO = "kevv21/approck";
export const PREFIJO = "apk-v";

export interface VersionApk {
  version: number;
  /** Lo que se descarga: el .apk de esa versión. */
  url: string;
  publicada: string;
  notas: string;
}

/** «apk-v12» → 12. Cualquier otra etiqueta no es un APK. */
export function versionDeEtiqueta(tag: string): number | null {
  if (!tag.startsWith(PREFIJO)) return null;
  const n = Number(tag.slice(PREFIJO.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

interface ReleaseGithub {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string;
  body: string | null;
  assets: { name: string; browser_download_url: string }[];
}

/** La versión más alta publicada que trae un .apk. */
export function ultimaDe(releases: ReleaseGithub[]): VersionApk | null {
  let mejor: VersionApk | null = null;
  for (const r of releases) {
    if (r.draft || r.prerelease) continue;
    const v = versionDeEtiqueta(r.tag_name);
    const apk = r.assets.find((a) => a.name.endsWith(".apk"));
    if (v == null || !apk) continue;
    if (!mejor || v > mejor.version) {
      mejor = { version: v, url: apk.browser_download_url, publicada: r.published_at, notas: r.body ?? "" };
    }
  }
  return mejor;
}

export const hayNueva = (instalada: number, ultima: VersionApk | null) =>
  ultima != null && Number.isFinite(instalada) && ultima.version > instalada;

/** Pregunta a GitHub. Sin cuenta: el repositorio es público. */
export async function buscarUltima(): Promise<VersionApk | null> {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
  return ultimaDe((await r.json()) as ReleaseGithub[]);
}
