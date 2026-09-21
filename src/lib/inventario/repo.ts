"use client";

import { supabase } from "../supabase";
import { normalizarUnidad, type Conteo, type ConteoItem, type Insumo } from "./tipos";

export async function cargarInsumos(): Promise<Insumo[]> {
  const { data, error } = await supabase
    .from("insumo").select("*").eq("activo", true).order("orden");
  if (error) throw error;
  return (data ?? []) as Insumo[];
}

export async function actualizarUnidad(id: string, unidad: string | null) {
  const { error } = await supabase
    .from("insumo").update({ unidad: normalizarUnidad(unidad) }).eq("id", id);
  if (error) throw error;
}

export async function conteoAbierto(): Promise<Conteo | null> {
  const { data } = await supabase
    .from("conteo").select("*").eq("estado", "abierto")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as Conteo) ?? null;
}

export async function listarConteos(limite = 30): Promise<Conteo[]> {
  const { data, error } = await supabase
    .from("conteo").select("*").order("fecha", { ascending: false }).limit(limite);
  if (error) throw error;
  return (data ?? []) as Conteo[];
}

export async function abrirConteo(realizadoPor: string, fecha?: string) {
  const { data, error } = await supabase
    .from("conteo")
    .insert({ realizado_por: realizadoPor || null, fecha: fecha ?? undefined })
    .select().single();
  if (error) throw error;
  return data as Conteo;
}

/**
 * Guarda las cantidades. Se usa upsert por (conteo_id, insumo_id) para que
 * guardar dos veces no duplique filas: el conteo se va guardando mientras
 * alguien camina por la bodega, no de un solo golpe al final.
 */
export async function guardarCantidades(
  conteoId: string,
  insumos: Insumo[],
  cantidades: Record<string, number | null>,
  pedidos: Record<string, number | null> = {}
) {
  // Se guarda la fila si hay CUALQUIERA de las dos cosas: se puede pedir algo
  // que no se conto porque se vio la caja vacia de un vistazo.
  const filas = insumos
    .filter((i) => cantidades[i.id] != null || pedidos[i.id] != null)
    .map((i) => ({
      conteo_id: conteoId,
      insumo_id: i.id,
      nombre_snapshot: i.nombre,
      unidad_snapshot: i.unidad,
      cantidad: cantidades[i.id] ?? null,
      pedido: pedidos[i.id] ?? null,
    }));
  if (filas.length === 0) return 0;

  const { error } = await supabase
    .from("conteo_item")
    .upsert(filas, { onConflict: "conteo_id,insumo_id" });
  if (error) throw error;
  return filas.length;
}

export async function cerrarConteo(id: string) {
  const { error } = await supabase.from("conteo").update({
    estado: "cerrado",
    cerrado_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;
}

export async function cargarItems(conteoId: string): Promise<ConteoItem[]> {
  const { data, error } = await supabase
    .from("conteo_item").select("*").eq("conteo_id", conteoId);
  if (error) throw error;
  return (data ?? []) as ConteoItem[];
}

/**
 * Arma las filas del Excel: TODOS los insumos en el orden de la plantilla,
 * con la cantidad contada o vacio. La plantilla se exporta completa aunque
 * falten insumos por contar, porque asi es como se usa: se imprime y se
 * camina la bodega llenandola a mano.
 */
export function filasParaExcel(
  insumos: Insumo[],
  cantidades: Record<string, number | null>,
  pedidos: Record<string, number | null> = {}
): ConteoItem[] {
  return insumos.map((i) => ({
    insumo_id: i.id,
    nombre_snapshot: i.nombre,
    unidad_snapshot: i.unidad,
    cantidad: cantidades[i.id] ?? null,
    pedido: pedidos[i.id] ?? null,
  }));
}
