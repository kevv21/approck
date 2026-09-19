"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { observarConexion } from "@/lib/offline/conexion";
import { estadoSync, sincronizarPendientes } from "@/lib/offline/servicio";
import type { EstadoSync } from "@/lib/offline/tipos";

/**
 * Indicador de conexion y de ordenes por subir.
 *
 * El spec lo exige, y no es decorativo: sin esto un mesero puede pasar la
 * noche tomando ordenes sin darse cuenta de que ninguna subio.
 */
export default function IndicadorConexion() {
  const [e, setE] = useState<EstadoSync | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const enCurso = useRef(false);

  const refrescar = useCallback(async () => {
    try { setE(await estadoSync()); } catch { /* noop */ }
  }, []);

  const sincronizar = useCallback(async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setSincronizando(true);
    try {
      await sincronizarPendientes();
    } finally {
      enCurso.current = false;
      setSincronizando(false);
      refrescar();
    }
  }, [refrescar]);

  useEffect(() => {
    refrescar();
    const dejar = observarConexion((enLinea) => {
      refrescar();
      if (enLinea) sincronizar(); // al volver la señal, subir lo pendiente
    });
    const id = setInterval(refrescar, 20000);
    return () => { dejar(); clearInterval(id); };
  }, [refrescar, sincronizar]);

  if (!e) return null;

  const pendientes = e.pendientes + e.conError;
  const color = !e.enLinea ? "var(--mal)" : pendientes > 0 ? "var(--acc)" : "var(--ok)";

  const texto = !e.enLinea
    ? pendientes > 0 ? `Sin conexión · ${pendientes} por subir` : "Sin conexión"
    : pendientes > 0 ? `${pendientes} por subir` : "En línea";

  return (
    <button
      onClick={e.enLinea && pendientes > 0 ? sincronizar : refrescar}
      className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
      style={{ background: "var(--panel-2)", border: "1px solid var(--borde)" }}
      title={e.conError > 0 ? `${e.conError} con error al subir` : undefined}
    >
      <span className="inline-block h-2 w-2 rounded-full"
            style={{ background: color }} />
      <span style={{ color: "var(--txt-2)" }}>
        {sincronizando ? "Subiendo…" : texto}
      </span>
    </button>
  );
}
