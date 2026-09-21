"use client";

import { useEffect, useState } from "react";

const MARCA_RESCATE = "approck:rescate-cache";

/**
 * Registra el service worker y, sobre todo, se recupera cuando la caché queda
 * envenenada.
 *
 * El service worker viejo (v1) guardaba las respuestas fallidas. Con
 * estrategia «caché primero», un chunk que falló una vez quedaba guardado
 * como error PARA SIEMPRE: el teléfono mostraba «Application error» y
 * reinstalar la PWA no servía, porque la caché sobrevive a la desinstalación.
 * Había que entrar a los ajustes de Android a borrar los datos del sitio, y
 * nadie en una cocina va a hacer eso.
 *
 * Por eso esto existe: si un chunk no carga, se limpia todo y se recarga UNA
 * vez. Si vuelve a pasar tras el rescate, no se insiste —sería un bucle— y el
 * error se deja ver, que es más honesto que una pantalla en blanco recargando
 * sola para siempre.
 */
export default function RegistrarSW() {
  const [hayVersionNueva, setHayVersionNueva] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const rescatar = async () => {
      // Una sola vez por pestaña: si el rescate no arregla, recargar en bucle
      // es peor que el problema.
      try {
        if (sessionStorage.getItem(MARCA_RESCATE)) return;
        sessionStorage.setItem(MARCA_RESCATE, "1");
      } catch { return; }
      try {
        const claves = await caches.keys();
        await Promise.all(claves.map((k) => caches.delete(k)));
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      } catch { /* sin caché que limpiar */ }
      location.reload();
    };

    const esChunk = (m: string) =>
      /ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported/i.test(m);

    const alError = (e: ErrorEvent) => { if (esChunk(e.message)) rescatar(); };
    const alRechazo = (e: PromiseRejectionEvent) => {
      const m = String((e.reason as Error)?.message ?? e.reason ?? "");
      if (esChunk(m)) rescatar();
    };
    window.addEventListener("error", alError);
    window.addEventListener("unhandledrejection", alRechazo);

    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // El nuevo ya no se mete solo: avisa y espera. Meterse en medio de un
      // pedido es lo que dejaba la pantalla en blanco.
      const mirar = () => { if (reg.waiting) setHayVersionNueva(true); };
      mirar();
      reg.addEventListener("updatefound", () => {
        reg.installing?.addEventListener("statechange", mirar);
      });
    }).catch(() => {
      // No es fatal: la app funciona igual, solo pierde el arranque offline.
    });

    return () => {
      window.removeEventListener("error", alError);
      window.removeEventListener("unhandledrejection", alRechazo);
    };
  }, []);

  if (!hayVersionNueva) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-3">
      <div className="panel mx-auto flex max-w-md items-center gap-3 p-3"
           style={{ borderColor: "var(--acc)" }}>
        <span className="flex-1 text-sm">
          Hay una versión nueva lista.
          <span className="block text-xs" style={{ color: "var(--txt-2)" }}>
            Se aplica al recargar. Termina el pedido primero.
          </span>
        </span>
        <button className="btn btn-acc shrink-0 !px-4 !py-2 text-sm"
                onClick={async () => {
                  const reg = await navigator.serviceWorker.getRegistration();
                  reg?.waiting?.postMessage("activar-ya");
                  location.reload();
                }}>
          Recargar
        </button>
      </div>
    </div>
  );
}
