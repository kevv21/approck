"use client";

import { supabase } from "./supabase";
import { registrar } from "./auth/auditoria";
import { sesionActual } from "./auth/sesion";
import { calcularTotales } from "./pricing";
import { construirTicket, type DatosTicket } from "./ticket";
import { previsualizarTicket } from "./ticket";
import type {
  ConfigCobro, Descuento, LineaOrden, MetodoPago, Producto, TipoOrden, Totales,
} from "./types";

export async function cargarMenu(): Promise<Producto[]> {
  const { data, error } = await supabase
    .from("producto").select("*").eq("activo", true)
    .order("categoria").order("orden");
  if (error) throw error;
  return data as Producto[];
}

/**
 * Referencia al producto del catalogo, para la columna `orden_item.producto_id`.
 *
 * Una pizza mitad y mitad no sale del catalogo: es una combinacion, y llega
 * con el id vacio. La columna es `uuid`, asi que mandar "" rompe el insert
 * con "invalid input syntax for type uuid" y se pierde el cobro entero.
 * NULL es justamente lo que la llave foranea permite.
 */
export const refProducto = (id: string): string | null => id || null;

export async function turnoAbierto() {
  const { data } = await supabase
    .from("turno").select("*").is("cerrado_at", null).maybeSingle();
  return data;
}

/**
 * El turno que corresponde a un rango de fechas, para re-descargar el Excel de
 * un dia ya cerrado. Sin esto, `turnoAbierto()` devuelve null pasado el cierre
 * y el Excel salia sin bloque de turno y sin la cifra de PedidosYa.
 */
export async function turnoDeRango(desdeISO: string, hastaISO: string) {
  const { data } = await supabase
    .from("turno")
    .select("*")
    .gte("abierto_at", desdeISO)
    .lte("abierto_at", hastaISO)
    .order("abierto_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function abrirTurno(porQuien: string, fondoInicial: number) {
  const { data, error } = await supabase
    .from("turno")
    .insert({ abierto_por: porQuien, fondo_inicial: fondoInicial })
    .select().single();
  if (error) throw error;

  await registrar({
    accion: "apertura_caja",
    turnoId: data.id,
    detalle: { turno: data.numero, fondo: fondoInicial },
  });
  return data;
}

export async function cerrarTurno(
  id: string,
  efectivoContado: number,
  notas?: string,
  /** Total que reporto PedidosYa. No entra al arqueo de efectivo. */
  ventasPedidosya = 0,
) {
  const quien = sesionActual()?.nombre ?? "(sin sesión)";
  const { data, error } = await supabase
    .from("turno")
    .update({
      cerrado_at: new Date().toISOString(),
      efectivo_contado: efectivoContado,
      cerrado_por: quien,
      ventas_pedidosya: ventasPedidosya,
      notas,
    })
    .eq("id", id).select("numero, fondo_inicial").single();
  if (error) throw error;

  await registrar({
    accion: "cierre_caja",
    turnoId: id,
    detalle: {
      turno: data.numero, contado: efectivoContado,
      pedidosya: ventasPedidosya, notas: notas ?? null,
    },
  });
  return data;
}

const b64 = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

export const desdeB64 = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export type EstadoGuardado = "abierta" | "pagada";

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
  /**
   * "pagada" (por defecto) cobra e imprime. "abierta" la guarda SIN cobrar:
   * no cuenta en el cierre, no imprime, y se cobra despues editandola.
   *
   * Antes no existia: «Guardar sin cobrar» escribia la orden como PAGADA en
   * efectivo, asi que el cierre contaba plata que nunca entro a la caja.
   */
  estado?: EstadoGuardado;
  /** Encolar tambien el ticket de cocina */
  imprimirCocina?: boolean;
  /**
   * UUID puesto por el dispositivo. Es la clave de idempotencia: si la orden
   * sube pero la respuesta se pierde, el reintento la reconoce en vez de
   * duplicarla.
   */
  idLocal?: string;
  /** Se tomo sin conexion */
  creadaOffline?: boolean;
  /** Cuando la tomo el mesero, que puede ser mucho antes de subirla. */
  tomadaAt?: string;
}

/**
 * Guarda la orden con SNAPSHOT de nombres y precios y encola los tickets.
 * Ningun dispositivo imprime directo: todos escriben en print_job y la
 * estacion de caja es la unica que habla con la PT-210.
 */
export async function guardarYEncolar(d: DatosGuardarOrden) {
  // Idempotencia: si esta orden ya subio en un intento anterior cuya
  // respuesta se perdio, se devuelve la que existe en vez de crear otra.
  if (d.idLocal) {
    const { data: previa } = await supabase
      .from("orden").select("*").eq("id_local", d.idLocal).maybeSingle();
    if (previa) {
      return {
        orden: previa,
        totales: calcularTotales(d.lineas, d.descuentos, d.config),
        yaExistia: true,
      };
    }
  }

  const t = calcularTotales(d.lineas, d.descuentos, d.config);

  const { data: orden, error } = await supabase.from("orden").insert({
    // Solo al crear. La politica del dia (IVA, mitades, tipo de cambio) queda
    // congelada en la orden y editarla no la cambia.
    id_local: d.idLocal ?? null,
    creada_offline: d.creadaOffline ?? false,
    tomada_at: d.tomadaAt ?? new Date().toISOString(),
    iva_bps: d.config.ivaBps,
    precios_incluyen_iva: d.config.preciosIncluyenIva,
    precio_mitades: d.config.precioMitades,
    tipo_cambio: d.config.tipoCambio,
    ...columnasOrden(d, t),
  }).select().single();
  if (error) throw error;

  const { error: eItems } = await supabase.from("orden_item").insert(filasItems(t, orden.id));
  if (eItems) throw eItems;

  if (orden.estado === "pagada") await alCobrar(d, t, orden);

  return { orden, totales: t, yaExistia: false };
}

/**
 * Columnas de `orden` que se escriben al CREAR y al EDITAR. Una sola lista
 * para los dos caminos: si se separan, tarde o temprano una columna nueva se
 * guarda al crear y se pierde al editar.
 *
 * @escribe orden
 */
function columnasOrden(d: DatosGuardarOrden, t: Totales) {
  const pagada = (d.estado ?? "pagada") === "pagada";
  const buscar = (a: Descuento["alcance"]) => d.descuentos.find((x) => x.alcance === a);
  const dg = buscar("general"), dp = buscar("pizza"), db = buscar("bebida");
  const recibido = pagada ? d.recibido ?? null : null;
  return {
    turno_id: d.turnoId ?? null,
    tipo: d.tipo,
    mesa: d.mesa || null,
    cliente: d.cliente || null,
    telefono_cliente: d.telefonoCliente || null,
    direccion: d.direccion || null,
    notas: d.notas || null,
    atendio: d.atendio || null,
    mesero: d.atendio || sesionActual()?.nombre || null,
    cajero: sesionActual()?.nombre || null,
    // Tarifa usada, no la vigente: congela el calculo para las reimpresiones.
    empaque_por_pizza: d.config.cobrarEmpaque ? d.config.empaquePorPizza : 0,
    empaque_gravado: d.config.empaqueGravado,
    empaque: t.empaque,
    envio_gravado: d.config.envioGravado,
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
    recibido,
    cambio: recibido != null ? Math.max(0, recibido - t.total) : null,
    estado: pagada ? "pagada" : "abierta",
    cerrada_at: pagada ? new Date().toISOString() : null,
  };
}

/**
 * Lineas de `orden_item`, con SNAPSHOT de nombre y precio.
 *
 * @escribe orden_item
 */
function filasItems(t: Totales, ordenId: string) {
  return t.lineas.map((l) => ({
    orden_id: ordenId,
    producto_id: refProducto(l.productoId),
    nombre_snapshot: l.nombre,
    precio_snapshot: l.precioUnit,
    grupo_snapshot: l.grupo,
    aplica_iva_snapshot: l.aplicaIva !== false,
    // Sin esto, reimprimir una promo la recalculaba como base + 15%: C$575.
    iva_incluido_snapshot: l.ivaIncluido === true,
    cantidad: l.cantidad,
    notas: l.notas || null,
    modificadores: l.modificadores ?? null,
    mitades: l.mitades ?? null,
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
  }));
}

/** Lo que pasa cuando una orden queda cobrada: ticket y bitacora. */
async function alCobrar(
  d: DatosGuardarOrden, t: Totales,
  orden: { id: string; numero: number; created_at: string },
) {
  const base: DatosTicket = {
    numero: orden.numero, tipo: d.tipo, mesa: d.mesa, cliente: d.cliente,
    telefonoCliente: d.telefonoCliente, direccion: d.direccion, notas: d.notas,
    metodoPago: d.metodoPago, recibido: d.recibido, atendio: d.atendio,
    fecha: new Date(orden.created_at), totales: t,
  };

  await encolar(orden.id, "cliente", base);
  // Hoy NADIE la enciende: el dueño pidió que del cobro salga solo la hoja de
  // consumo. El camino se queda para volver a activarla con una línea, y
  // `reimprimir(id, true)` sigue sacando la comanda a pedido. Único borde:
  // una orden que quedó en la cola local ANTES de este cambio conserva
  // `imprimirCocina: true` en su payload y sacará comanda al sincronizar.
  if (d.imprimirCocina) await encolar(orden.id, "cocina", { ...base, documento: "cocina" });

  // El spec exige que todo descuento quede registrado con usuario, hora y
  // motivo. Se hace despues de guardar para no bloquear el cobro si falla.
  if (t.descTotal > 0) {
    await registrar({
      accion: "descuento",
      motivo: d.motivoDescuento || "(sin motivo)",
      ordenId: orden.id,
      turnoId: d.turnoId ?? null,
      detalle: {
        orden: orden.numero,
        monto: t.descTotal,
        pizzas: t.descPizzas,
        bebidas: t.descBebidas,
        general: t.descGeneral,
        porLinea: t.descLineas,
      },
    });
  }
}

/**
 * EDITAR UNA ORDEN YA GUARDADA, sin rehacerla.
 *
 * Pasa por la funcion `editar_orden` de la base (15_editar_orden.sql), no
 * por un update: BLINDAR congela el total y las lineas de una orden, y eso
 * sigue asi. La funcion es el unico camino, y reemplaza todo junto o nada.
 *
 * - Abierta -> abierta: se corrige el pedido. Sin bitacora: no es plata aun.
 * - Abierta -> pagada: se cobra. Imprime la hoja de consumo.
 * - Pagada  -> pagada: corrige un cobro. Exige motivo, queda en la bitacora
 *   con el antes y el despues, y reimprime la hoja corregida. La base se
 *   niega si el turno de esa orden ya se cerro.
 */
export async function editarOrden(
  id: string, d: DatosGuardarOrden, opciones: { motivo?: string; estabaPagada: boolean },
) {
  const t = calcularTotales(d.lineas, d.descuentos, d.config);
  const { data, error } = await supabase.rpc("editar_orden", {
    p_id: id,
    p_orden: columnasOrden(d, t),
    p_items: filasItems(t, id),
    p_motivo: opciones.motivo?.trim() || null,
  });
  if (error) throw error;
  const orden = data as { id: string; numero: number; created_at: string; estado: string };

  if (orden.estado === "pagada") {
    if (opciones.estabaPagada) {
      // El descuento ya se registro al cobrar; el cambio queda en la
      // bitacora como «edicion». Solo se imprime la hoja corregida.
      await encolar(id, "cliente", {
        numero: orden.numero, tipo: d.tipo, mesa: d.mesa, cliente: d.cliente,
        telefonoCliente: d.telefonoCliente, direccion: d.direccion, notas: d.notas,
        metodoPago: d.metodoPago, recibido: d.recibido, atendio: d.atendio,
        fecha: new Date(orden.created_at), totales: t,
      });
    } else {
      await alCobrar(d, t, orden);
    }
  }
  return { orden, totales: t };
}

/**
 * Anula una orden ya cobrada. El motivo es OBLIGATORIO: una anulacion sin
 * motivo es exactamente el agujero por donde se va la plata.
 */
export async function anularOrden(ordenId: string, motivo: string) {
  const limpio = motivo.trim();
  if (!limpio) throw new Error("La anulación necesita un motivo.");

  const quien = sesionActual()?.nombre ?? "(sin sesión)";
  const { data, error } = await supabase.from("orden").update({
    estado: "anulada",
    anulada_por: quien,
    anulada_motivo: limpio,
    anulada_at: new Date().toISOString(),
  }).eq("id", ordenId).select("numero, total").single();
  if (error) throw error;

  await registrar({
    accion: "anulacion",
    motivo: limpio,
    ordenId,
    detalle: { orden: data.numero, monto: data.total },
  });
  return data;
}

/**
 * QUITAR DEL HISTORIAL. No es una anulacion y no es un delete.
 *
 * La orden desaparece del listado de cierres, de los totales, del Excel y de
 * "Ultimas ordenes", y NO dice "anulada" en ninguna parte: eso es lo que se
 * pidio. La fila sigue en la base, marcada con quien la quito y cuando.
 *
 * Por que no se borra la fila: si una orden cobrada en efectivo se puede
 * hacer desaparecer sin rastro, el arqueo deja de servir para lo unico que
 * sirve. Quien cobra podria quedarse con la plata, borrar la orden, y la caja
 * cuadraria perfecto. Marcada, el arqueo da igual —la orden no cuenta— pero
 * queda de donde salio. Y se puede deshacer; un delete no.
 *
 * Para borrar de verdad las pruebas antes de abrir: `LIMPIAR_PRUEBAS.sql`.
 */
export async function ocultarOrden(ordenId: string, motivo: string) {
  const limpio = motivo.trim();
  if (!limpio) throw new Error("Decir por que se quita es lo que la separa de una venta desaparecida.");

  const quien = sesionActual()?.nombre ?? "(sin sesión)";
  const { data, error } = await supabase.from("orden").update({
    oculta_at: new Date().toISOString(),
    oculta_por: quien,
    oculta_motivo: limpio,
  }).eq("id", ordenId).select("numero, total").single();
  if (error) throw error;

  await registrar({
    accion: "exclusion",
    motivo: limpio,
    ordenId,
    detalle: { orden: data.numero, monto: data.total },
  });
  return data;
}

/** Devuelve al historial una orden quitada. */
export async function restaurarOrden(ordenId: string) {
  const { data, error } = await supabase.from("orden").update({
    oculta_at: null, oculta_por: null, oculta_motivo: null,
  }).eq("id", ordenId).select("numero, total").single();
  if (error) throw error;

  await registrar({
    accion: "restauracion",
    ordenId,
    detalle: { orden: data.numero, monto: data.total },
  });
  return data;
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

export interface OrdenBreve {
  id: string;
  numero: number | null;
  tipo: string;
  mesa: string | null;
  cliente: string | null;
  total: number;
  estado: string;
  created_at: string;
}

/**
 * Las ultimas ordenes, para poder REIMPRIMIR sin rehacer el pedido.
 *
 * Existe por un problema concreto de caja: si el ticket no sale —papel,
 * puente caido, impresora apagada— el cajero volvia a cargar el pedido entero
 * y lo cobraba otra vez. Esa segunda orden es real para la base, asi que el
 * cierre del dia sale con la venta DUPLICADA y el efectivo no cuadra.
 * Reimprimir no toca la base: encola el mismo ticket, marcado COPIA.
 */
export async function ultimasOrdenes(limite = 10): Promise<OrdenBreve[]> {
  const { data, error } = await supabase
    .from("orden")
    .select("id, numero, tipo, mesa, cliente, total, estado, created_at")
    .eq("estado", "pagada")
    .is("oculta_at", null)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as OrdenBreve[];
}

/**
 * Una orden guardada, reconstruida como la tenia la caja: lineas,
 * descuentos y la configuracion CONGELADA de ese dia. Sirve para reimprimir
 * (tiene que dar exactamente el mismo total) y para editar.
 */
export async function cargarOrden(ordenId: string) {
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
    ivaIncluido: (i.iva_incluido_snapshot as boolean) ?? false,
    modificadores: (i.modificadores as { nombre: string; precio: number }[]) ?? undefined,
    mitades: (i.mitades as LineaOrden["mitades"]) ?? undefined,
    descuentoLinea: (i.desc_linea_valor as number) > 0
      ? { tipo: i.desc_linea_tipo as "porcentaje" | "monto", valor: i.desc_linea_valor as number }
      : undefined,
  }));

  const descuentos: Descuento[] = [];
  if (o.desc_general_valor > 0) descuentos.push({ alcance: "general", tipo: o.desc_general_tipo, valor: o.desc_general_valor });
  if (o.desc_pizza_valor > 0)   descuentos.push({ alcance: "pizza",   tipo: o.desc_pizza_tipo,   valor: o.desc_pizza_valor });
  if (o.desc_bebida_valor > 0)  descuentos.push({ alcance: "bebida",  tipo: o.desc_bebida_tipo,  valor: o.desc_bebida_valor });

  // El SNAPSHOT de politica de la orden, no los ajustes de hoy.
  const config: ConfigCobro = {
    ivaBps: o.iva_bps,
    preciosIncluyenIva: o.precios_incluyen_iva ?? false,
    propinaBps: o.propina_bps,
    propinaSobre: o.propina_sobre,
    cobrarPropina: o.propina > 0,
    costoEnvio: o.costo_envio,
    envioGravado: o.envio_gravado ?? false,
    tipoCambio: o.tipo_cambio ?? 0,
    precioMitades: o.precio_mitades ?? "promedio",
    // La tarifa que se USO ese dia, no la de hoy. Si mañana el empaque sube a
    // C$40, la reimpresion de ayer tiene que seguir dando C$30.
    empaquePorPizza: o.empaque_por_pizza ?? 0,
    cobrarEmpaque: (o.empaque_por_pizza ?? 0) > 0,
    empaqueGravado: o.empaque_gravado ?? true,
  };

  return { o, lineas, descuentos, config };
}

/**
 * Las ordenes guardadas SIN cobrar. Van aparte de «Ultimas ordenes» porque
 * son trabajo pendiente: una mesa que todavia no paga no puede quedar
 * enterrada debajo de diez cobros.
 */
export async function ordenesAbiertas(): Promise<OrdenBreve[]> {
  const { data, error } = await supabase
    .from("orden")
    .select("id, numero, tipo, mesa, cliente, total, estado, created_at")
    .eq("estado", "abierta")
    .is("oculta_at", null)
    .order("created_at", { ascending: true })
    .limit(40);
  if (error) throw error;
  return (data ?? []) as OrdenBreve[];
}

/** Reimprime una orden ya cerrada. */
export async function reimprimir(ordenId: string, cocina = false) {
  const { o, lineas, descuentos, config } = await cargarOrden(ordenId);
  const t = calcularTotales(lineas, descuentos, config);

  await registrar({
    accion: "reimpresion",
    ordenId,
    detalle: { orden: o.numero, documento: cocina ? "cocina" : "cliente" },
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
