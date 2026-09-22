"use client";

import { supabase } from "../supabase";
import { sesionActual } from "./sesion";

export type AccionAuditoria =
  | "anulacion" | "descuento" | "cambio_precio" | "reimpresion"
  | "apertura_caja" | "cierre_caja" | "login_fallido"
  // Quitar del historial no es anular: la orden no cuenta en el cierre y no
  // figura como anulada en ninguna pantalla. Aqui SI queda, porque es lo
  // unico que separa "sacar una orden de prueba" de "hacer desaparecer una
  // venta cobrada en efectivo".
  | "exclusion" | "restauracion";

export interface EntradaAuditoria {
  accion: AccionAuditoria;
  motivo?: string | null;
  ordenId?: string | null;
  turnoId?: string | null;
  detalle?: Record<string, unknown>;
}

/**
 * Registra una accion en la bitacora.
 *
 * Nunca lanza: una bitacora que hace fallar el cobro es peor que una
 * incompleta. El error se manda a Sentry y la caja sigue trabajando.
 */
export async function registrar(e: EntradaAuditoria): Promise<void> {
  const u = sesionActual();
  try {
    await supabase.from("audit_log").insert({
      accion: e.accion,
      usuario: u?.nombre ?? "(sin sesión)",
      motivo: e.motivo ?? null,
      orden_id: e.ordenId ?? null,
      turno_id: e.turnoId ?? null,
      detalle: e.detalle ?? null,
    });
  } catch (err) {
    const { reportarError } = await import("../observabilidad");
    reportarError(err, { contexto: "auditoria", accion: e.accion });
  }
}

export interface FilaAuditoria {
  id: string;
  accion: AccionAuditoria;
  usuario: string;
  motivo: string | null;
  detalle: Record<string, unknown> | null;
  created_at: string;
}

export async function listarAuditoria(
  desde: string, hasta: string, accion?: AccionAuditoria
): Promise<FilaAuditoria[]> {
  let q = supabase.from("audit_log").select("*")
    .gte("created_at", desde).lte("created_at", hasta)
    .order("created_at", { ascending: false }).limit(500);
  if (accion) q = q.eq("accion", accion);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FilaAuditoria[];
}
