"use client";

import { supabase } from "./supabase";
import { calcularTotales } from "./pricing";
import { construirTicket, type DatosTicket } from "./ticket";
import { previsualizarTicket } from "./ticket";
import type {
  ConfigCobro, Descuento, LineaOrden, MetodoPago, Producto, TipoOrden,
} from "./types";

export async function cargarMenu(): Promise<Producto[]> {
  const { data, error } = await supabase
    .from("producto").select("*").eq("activo", true)
    .order("categoria").order("orden");
  if (error) throw error;
  return data as Producto[];
}

export async function turnoAbierto() {
  const { data } = await supabase
    .from("turno").select("*").is("cerrado_at", null).maybeSingle();
  return data;
}

export async function abrirTurno(porQuien: string, fondoInicial: number) {
  const { data, error } = await supabase
    .from("turno")
    .insert({ abierto_por: porQuien, fondo_inicial: fondoInicial })
    .select().single();
  if (error) throw error;
  return data;
}

export async function cerrarTurno(id: string, efectivoContado: number, notas?: string) {
  const { error } = await supabase
    .from("turno")
    .update({ cerrado_at: new Date().toISOString(), efectivo_contado: efectivoContado, notas })
    .eq("id", id);
  if (error) throw error;
}

const b64 = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

export const desdeB64 = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export interface DatosGuardarOrden {
  lineas: LineaOrden[];
  descuentos: Descuento[];
  config: ConfigCobro;
  tipo: TipoOrden;
  mesa?: string;
  cliente?: string;
  telefonoCliente?: string;
  direccion?: string;
  notas?: string;
  atendio?: string;
  metodoPago: MetodoPago;
  recibido?: number;
  motivoDescuento?: string;
  turnoId?: string | null;
  /** Encolar tambien el ticket de cocina */
  imprimirCocina?: boolean;
}

/**
 * Guarda la orden con SNAPSHOT de nombres y precios y encola los tickets.
 * Ningun dispositivo imprime directo: todos escriben en print_job y la
 * estacion de caja es la unica que habla con la PT-210.
 */
export async function guardarYEncolar(d: DatosGuardarOrden) {
  const t = calcularTotales(d.lineas, d.descuentos, d.config);
  const buscar = (a: Descuento["alcance"]) => d.descuentos.find((x) => x.alcance === a);
  const dg = buscar("general"), dp = buscar("pizza"), db = buscar("bebida");

  const { data: orden, error } = await supabase.from("orden").insert({
    turno_id: d.turnoId ?? null,
    tipo: d.tipo,
    mesa: d.mesa || null,
    cliente: d.cliente || null,
    telefono_cliente: d.telefonoCliente || null,
    direccion: d.direccion || null,
    notas: d.notas || null,
    atendio: d.atendio || null,
    iva_bps: d.config.ivaBps,
    precios_incluyen_iva: d.config.preciosIncluyenIva,
    envio_gravado: d.config.envioGravado,
    tipo_cambio: d.config.tipoCambio,
    propina_bps: d.config.propinaBps,
    propina_sobre: d.config.propinaSobre,
    desc_general_tipo: dg?.tipo ?? null, desc_general_valor: dg?.valor ?? 0,
    desc_pizza_tipo: dp?.tipo ?? null,   desc_pizza_valor: dp?.valor ?? 0,
    desc_bebida_tipo: db?.tipo ?? null,  desc_bebida_valor: db?.valor ?? 0,
    desc_motivo: d.motivoDescuento || null,
    subtotal_bruto: t.subtotalBruto,
    desc_pizzas: t.descPizzas, desc_bebidas: t.descBebidas,
    desc_general: t.descGeneral, desc_total: t.descTotal,
    desc_lineas: t.descLineas,
    base_productos: t.baseProductos, costo_envio: t.costoEnvio,
    base_gravable: t.baseGravable, base_exenta: t.baseExenta,
    iva: t.iva, propina: t.propina, total: t.total, total_usd: t.totalUsd,
    metodo_pago: d.metodoPago,
    recibido: d.recibido ?? null,
    cambio: d.recibido != null ? Math.max(0, d.recibido - t.total) : null,
    estado: "pagada",
    cerrada_at: new Date().toISOString(),
  }).select().single();
  if (error) throw error;

  const { error: eItems } = await supabase.from("orden_item").insert(
    t.lineas.map((l) => ({
      orden_id: orden.id,
      producto_id: l.productoId,
      nombre_snapshot: l.nombre,
      precio_snapshot: l.precioUnit,
      grupo_snapshot: l.grupo,
      aplica_iva_snapshot: l.aplicaIva !== false,
      cantidad: l.cantidad,
      notas: l.notas || null,
      modificadores: l.modificadores ?? null,
      desc_linea_tipo: l.descuentoLinea?.tipo ?? null,
      desc_linea_valor: l.descuentoLinea?.valor ?? 0,
      bruto: l.bruto,
      desc_linea: l.descLinea,
      desc_categoria: l.descCategoria,
      desc_general: l.descGeneral,
      desc_total: l.descTotal,
      neto: l.neto,
      base: l.base,
      iva: l.iva,
    }))
  );
  if (eItems) throw eItems;

  const base: DatosTicket = {
    numero: orden.numero, tipo: d.tipo, mesa: d.mesa, cliente: d.cliente,
    telefonoCliente: d.telefonoCliente, direccion: d.direccion, notas: d.notas,
    metodoPago: d.metodoPago, recibido: d.recibido, atendio: d.atendio,
    fecha: new Date(orden.created_at), totales: t,
  };

  await encolar(orden.id, "cliente", base);
  if (d.imprimirCocina) await encolar(orden.id, "cocina", { ...base, documento: "cocina" });

  return { orden, totales: t };
}

export async function encolar(
  ordenId: string | null,
  tipo: "cliente" | "cocina" | "prueba" | "precuenta",
  datos: DatosTicket
) {
  const bytes = construirTicket(datos, { transliterar: false });
  const { error } = await supabase.from("print_job").insert({
    orden_id: ordenId,
    tipo,
    payload_b64: b64(bytes),
    preview: previsualizarTicket(datos),
  });
  if (error) throw error;
}

export async function encolarBytes(
  ordenId: string | null,
  tipo: "cliente" | "cocina" | "prueba" | "precuenta",
  bytes: Uint8Array,
  preview = ""
) {
  const { error } = await supabase.from("print_job").insert({
    orden_id: ordenId, tipo, payload_b64: b64(bytes), preview,
  });
  if (error) throw error;
}

export async function jobsPendientes() {
  const { data, error } = await supabase
    .from("print_job").select("*")
    .in("estado", ["pendiente", "error"])
    .lt("intentos", 5)
    .order("created_at").limit(20);
  if (error) throw error;
  return data ?? [];
}

export async function marcarJob(
  id: string,
  estado: "imprimiendo" | "impreso" | "error",
  err?: string,
  intentos?: number
) {
  await supabase.from("print_job").update({
    estado,
    error: err ?? null,
    ...(intentos != null ? { intentos } : {}),
    ...(estado === "impreso" ? { impreso_at: new Date().toISOString() } : {}),
  }).eq("id", id);
}

/** Reimprime una orden ya cerrada. */
export async function reimprimir(ordenId: string, cocina = false) {
  const { data: o, error } = await supabase
    .from("orden").select("*, orden_item(*)").eq("id", ordenId).single();
  if (error) throw error;

  const lineas: LineaOrden[] = o.orden_item.map((i: Record<string, unknown>) => ({
    id: i.id as string,
    productoId: (i.producto_id as string) ?? "",
    nombre: i.nombre_snapshot as string,
    precioUnit: i.precio_snapshot as number,
    cantidad: i.cantidad as number,
    grupo: i.grupo_snapshot as LineaOrden["grupo"],
    notas: (i.notas as string) ?? undefined,
    aplicaIva: (i.aplica_iva_snapshot as boolean) ?? true,
    modificadores: (i.modificadores as { nombre: string; precio: number }[]) ?? undefined,
    descuentoLinea: (i.desc_linea_valor as number) > 0
      ? { tipo: i.desc_linea_tipo as "porcentaje" | "monto", valor: i.desc_linea_valor as number }
      : undefined,
  }));

  const descuentos: Descuento[] = [];
  if (o.desc_general_valor > 0) descuentos.push({ alcance: "general", tipo: o.desc_general_tipo, valor: o.desc_general_valor });
  if (o.desc_pizza_valor > 0)   descuentos.push({ alcance: "pizza",   tipo: o.desc_pizza_tipo,   valor: o.desc_pizza_valor });
  if (o.desc_bebida_valor > 0)  descuentos.push({ alcance: "bebida",  tipo: o.desc_bebida_tipo,  valor: o.desc_bebida_valor });

  // Se recalcula con el SNAPSHOT de politica de la orden, no con los ajustes
  // de hoy: una reimpresion tiene que dar exactamente el mismo total.
  const t = calcularTotales(lineas, descuentos, {
    ivaBps: o.iva_bps,
    preciosIncluyenIva: o.precios_incluyen_iva ?? false,
    propinaBps: o.propina_bps,
    propinaSobre: o.propina_sobre,
    cobrarPropina: o.propina > 0,
    costoEnvio: o.costo_envio,
    envioGravado: o.envio_gravado ?? false,
    tipoCambio: o.tipo_cambio ?? 0,
  });

  await encolar(ordenId, cocina ? "cocina" : "cliente", {
    numero: o.numero, tipo: o.tipo, mesa: o.mesa, cliente: o.cliente,
    telefonoCliente: o.telefono_cliente, direccion: o.direccion, notas: o.notas,
    metodoPago: o.metodo_pago, recibido: o.recibido, atendio: o.atendio,
    fecha: new Date(o.created_at), totales: t,
    reimpresion: !cocina,
    documento: cocina ? "cocina" : "cliente",
    ancho: (o.ancho_papel as 58 | 80) ?? 58,
    tipoCambio: o.tipo_cambio ?? 0,
  });
}
