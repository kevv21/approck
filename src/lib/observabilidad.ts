/**
 * Reporte de errores.
 *
 * Sentry es OPCIONAL: sin DSN configurado, todo esto se vuelve un console
 * y la app funciona igual. Nunca debe hacer fallar una operación de caja.
 */
type Contexto = Record<string, unknown>;

/**
 * Forma mínima de la API de Sentry que usamos. Se tipa a mano para no
 * obligar a instalar @sentry/nextjs: si el paquete no está, la app compila
 * y funciona igual.
 */
interface ApiSentry {
  captureException(e: unknown, hint?: { extra?: Contexto }): void;
  captureMessage(m: string, hint?: { level?: string; extra?: Contexto }): void;
  setUser(u: { username: string } | null): void;
}

let sentry: ApiSentry | null = null;
let intentado = false;

async function cargar(): Promise<ApiSentry | null> {
  if (intentado) return sentry;
  intentado = true;
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return null;
  try {
    // Import indirecto para que el bundler no lo exija en tiempo de build.
    const nombre = "@sentry/nextjs";
    sentry = (await import(/* webpackIgnore: true */ nombre)) as unknown as ApiSentry;
  } catch {
    sentry = null; // el paquete no está instalado: se sigue sin él
  }
  return sentry;
}

export function reportarError(e: unknown, contexto?: Contexto): void {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[approck]", msg, contexto ?? "");
  cargar().then((s) => {
    s?.captureException(e, contexto ? { extra: contexto } : undefined);
  }).catch(() => { /* reportar no puede romper nada */ });
}

export function reportarAviso(mensaje: string, contexto?: Contexto): void {
  console.warn("[approck]", mensaje, contexto ?? "");
  cargar().then((s) => {
    s?.captureMessage(mensaje, { level: "warning", extra: contexto });
  }).catch(() => {});
}

/** Marca quién está usando la app, para que los errores lleguen con nombre. */
export function identificar(nombre: string | null): void {
  cargar().then((s) => {
    s?.setUser(nombre ? { username: nombre } : null);
  }).catch(() => {});
}
