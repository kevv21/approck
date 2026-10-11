"use client";

import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { Rockzza, enApk } from "@/lib/nativo/rockzza";
import { cerrarUltimo } from "@/lib/nativo/atras";
import { buscarUltima, hayNueva, type VersionApk } from "@/lib/apk/actualizacion";

/**
 * LO QUE SOLO EXISTE DENTRO DEL APK
 *
 * - El botón de atrás de Android: cierra primero lo que esté abierto encima
 *   (ver `useAtras`), después vuelve a la pantalla anterior, y en la primera
 *   pantalla manda la app al fondo en vez de cerrarla. Cerrarla con un toque
 *   de más en plena atención obliga a esperar que vuelva a cargar.
 * - El aviso de APK nuevo. Lo de todos los días se actualiza solo (viene de
 *   Vercel); esto es para cuando cambia la parte de Android.
 *
 * En el navegador no dibuja nada.
 */

/** Cada cuánto se pregunta a GitHub. Más seguido no cambia nada: los APK salen rara vez. */
const CADA_MS = 6 * 60 * 60 * 1000;
const CLAVE_REVISADO = "rockzza:apk-revisado";
const CLAVE_DESCARTADO = "rockzza:apk-descartado";

export default function AppNativa() {
  const [nueva, setNueva] = useState<VersionApk | null>(null);
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    if (!enApk()) return;
    document.documentElement.classList.add("apk");

    const atras = App.addListener("backButton", ({ canGoBack }) => {
      if (cerrarUltimo()) return;
      if (canGoBack) window.history.back();
      else App.minimizeApp();
    });

    const revisar = async (forzar = false) => {
      try {
        const ultima = Number(localStorage.getItem(CLAVE_REVISADO) ?? 0);
        if (!forzar && Date.now() - ultima < CADA_MS) return;
        const [info, publicada] = await Promise.all([App.getInfo(), buscarUltima()]);
        localStorage.setItem(CLAVE_REVISADO, String(Date.now()));
        const descartada = Number(sessionStorage.getItem(CLAVE_DESCARTADO) ?? 0);
        if (hayNueva(Number(info.build), publicada) && publicada!.version !== descartada) {
          setNueva(publicada);
        }
      } catch {
        // Sin internet o GitHub sin responder: se pregunta la próxima vez.
      }
    };
    revisar(true);
    const volver = App.addListener("resume", () => { revisar(); });

    return () => {
      atras.then((h) => h.remove());
      volver.then((h) => h.remove());
    };
  }, []);

  if (!nueva) return null;

  return (
    <div role="status" className="surgir flex items-center gap-3 border-b px-3 py-2"
         style={{ background: "var(--acc-fondo)", borderColor: "var(--acc)" }}>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-sm font-bold" style={{ color: "var(--acc)" }}>
          Hay una versión nueva de Rockzza
        </div>
        <div className="text-xs" style={{ color: "var(--acc-2)" }}>
          {descargando
            ? "Cuando termine la descarga, ábrela y toca Actualizar."
            : "Lo que vendiste y tu sesión no se pierden."}
        </div>
      </div>
      <button className="btn btn-acc btn-chico"
              onClick={() => {
                setDescargando(true);
                Rockzza.abrirEnNavegador({ url: nueva.url }).catch(() => setDescargando(false));
              }}>
        Descargar
      </button>
      <button className="btn-texto px-2" aria-label="Ahora no" style={{ minHeight: "40px" }}
              onClick={() => {
                try { sessionStorage.setItem(CLAVE_DESCARTADO, String(nueva.version)); } catch { /* noop */ }
                setNueva(null);
              }}>
        ✕
      </button>
    </div>
  );
}
