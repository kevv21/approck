"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PanelDescuentos from "@/components/PanelDescuentos";
import BarraPedido from "@/components/BarraPedido";
import HojaPedido from "@/components/HojaPedido";
import { useAvisos } from "@/components/Avisos";
import Plegable from "@/components/Plegable";
import UltimasOrdenes from "@/components/UltimasOrdenes";
import MitadYMitad from "@/components/MitadYMitad";
import Menu from "@/components/caja/Menu";
import LineaPedido from "@/components/caja/LineaPedido";
import { Interruptor, Segmentado } from "@/components/Controles";
import { centavos, fmtC } from "@/lib/money";
import { calcularTotales } from "@/lib/pricing";
import {
  anularOrden, cargarMenu, cargarOrden, editarOrden, imprimirDocumento, reimprimir, turnoAbierto,
  type OrdenBreve,
} from "@/lib/repo";
import { cargarMenuConRespaldo, guardarOrden } from "@/lib/offline/servicio";
import { guardarMenuLocal } from "@/lib/offline/db";
import { hayInternet } from "@/lib/offline/conexion";
import { previsualizarTicket, type DatosTicket } from "@/lib/ticket";
import { descargarHtml, imprimirHtml } from "@/lib/printer";
import { imprimeDirecto, pcResponde } from "@/lib/printer/salida";
import { useRouter } from "next/navigation";
import { hayConfig } from "@/lib/supabase";
import { BASE_DESACTUALIZADA, noExisteColumna, noExisteFuncion } from "@/lib/diagnostico";
import {
  CONFIG_DEFAULT, METODOS_PAGO, TIPOS_ORDEN,
  type ConfigCobro, type Descuento, type LineaOrden,
  datosLineaMitades,
  type MetodoPago, type MitadPizza, type Producto, type TipoOrden,
} from "@/lib/types";

/** Nombres que caben cuatro en una fila de 360px. */
const TIPO_CORTO: Record<TipoOrden, string> = {
  mesa: "Mesa", para_llevar: "Llevar", delivery: "Delivery", retiro: "Retiro",
};

/** Categoría del catálogo cuyos productos son extras de pizza. */
const CATEGORIA_EXTRAS = "Extras";

/** Una orden guardada abierta en la caja para corregirla o cobrarla. */
interface Edicion {
  id: string;
  numero: number;
  /** Ya estaba cobrada: corregirla exige motivo y queda en la bitácora. */
  pagada: boolean;
  /** Lo que se cobró. Para mostrar cuánto falta cobrar o devolver. */
  totalAntes: number;
}

export default function Caja() {
  const { avisar } = useAvisos();
  const router = useRouter();
  // Se pregunta una vez al abrir si la PC de caja está viva, para que el
  // aviso de «no responde» no demore el cobro.
  useEffect(() => { pcResponde().catch(() => {}); }, []);
  const [menu, setMenu] = useState<Producto[]>([]);
  const [lineas, setLineas] = useState<LineaOrden[]>([]);
  const [descuentos, setDescuentos] = useState<Descuento[]>([]);
  const [motivoDesc, setMotivoDesc] = useState("");

  const [tipo, setTipo] = useState<TipoOrden>("mesa");
  const [mesa, setMesa] = useState("");
  const [cliente, setCliente] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [notas, setNotas] = useState("");
  const [atendio, setAtendio] = useState("");

  const [cobrarPropina, setCobrarPropina] = useState(false);
  const [propinaPct, setPropinaPct] = useState(10);
  const [envio, setEnvio] = useState("");
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("efectivo");
  const [recibido, setRecibido] = useState("");
  // Se puede quitar en el momento: a veces el cliente trae su propia caja.
  const [cobrarEmpaque, setCobrarEmpaque] = useState(true);

  /**
   * La política congelada de la orden que se edita (IVA, mitades, tarifa de
   * empaque). Una orden de ayer se corrige con las reglas de ayer.
   */
  const [configBase, setConfigBase] = useState<ConfigCobro>(CONFIG_DEFAULT);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  /**
   * Identificador del pedido en curso, el MISMO en todos los intentos de
   * guardarlo. Si el primer «Cobrar» entró pero la respuesta se perdió, el
   * segundo devuelve esa misma orden en vez de crear otra: la venta no sale
   * dos veces en el cierre. Se renueva solo al terminar o cancelar el pedido.
   */
  const [idPedido, setIdPedido] = useState(() => crypto.randomUUID());
  const [motivoEdicion, setMotivoEdicion] = useState("");

  const [turno, setTurno] = useState<{ id: string } | null>(null);
  const [verPreview, setVerPreview] = useState(false);
  const [verMas, setVerMas] = useState(false);
  const [hojaAbierta, setHojaAbierta] = useState(false);
  /** En teléfono: el menú para tomar pedidos, o las órdenes guardadas. */
  const [vista, setVista] = useState<"menu" | "ordenes">("menu");
  const [confirmaCancelar, setConfirmaCancelar] = useState(false);
  /** Motivo de la anulación de la orden abierta; null = diálogo cerrado. */
  const [motivoAnular, setMotivoAnular] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ txt: string; mal?: boolean } | null>(null);
  /** Sube tras cada orden guardada, para recargar las listas de órdenes. */
  const [refrescoOrdenes, setRefrescoOrdenes] = useState(0);

  const [menuDesdeCache, setMenuDesdeCache] = useState(false);
  // null = cerrado; "" = agregando una nueva; <id> = editando esa línea.
  const [editaMitades, setEditaMitades] = useState<string | null>(null);

  useEffect(() => {
    // Sin base configurada NO se carga un menú de mentira: se podían armar
    // pedidos completos que no se guardaban en ningún lado.
    if (!hayConfig) return;
    // Con respaldo local: si no hay internet se usa la copia guardada.
    cargarMenuConRespaldo(cargarMenu, guardarMenuLocal)
      .then(({ productos, desdeCache }) => {
        setMenu(productos);
        setMenuDesdeCache(desdeCache);
        if (desdeCache && productos.length === 0) {
          setAviso({ txt: "No hay menú guardado en este dispositivo. Conéctate una vez para descargarlo.", mal: true });
        }
      })
      .catch((e) => setAviso({ txt: `No se pudo cargar el menú: ${e.message}`, mal: true }));
    turnoAbierto().then((t) => setTurno(t)).catch(() => {});
  }, []);

  // Promociones primero, después las pizzas: son la mayoría de lo que se
  // vende. Las promos van delante a mano: su grupo es "otro" (ya traen sus
  // cajas) y sin esto el orden las mandaba al fondo, entre Bar y Postres.
  const categorias = useMemo(() => {
    // Los extras no se venden sueltos: viven dentro de cada pizza.
    const vistas = [...new Set(menu.map((p) => p.categoria))]
      .filter((c) => c !== CATEGORIA_EXTRAS);
    const esPromo = (c: string) => c === "Promociones";
    const esPizza = (c: string) =>
      !esPromo(c) && menu.some((p) => p.categoria === c && p.grupo_descuento === "pizza");
    return [
      ...vistas.filter(esPromo),
      ...vistas.filter(esPizza),
      ...vistas.filter((c) => !esPromo(c) && !esPizza(c)),
    ];
  }, [menu]);

  /** La línea es una promo: lleva dos pizzas aunque su grupo sea "otro". */
  const esPromo = (l: LineaOrden) =>
    menu.some((p) => p.id === l.productoId && p.categoria === "Promociones");

  const extras = useMemo(() => menu.filter((p) => p.categoria === CATEGORIA_EXTRAS), [menu]);
  const pizzas = useMemo(() => menu.filter((p) => p.grupo_descuento === "pizza"), [menu]);

  const config: ConfigCobro = {
    ...configBase,
    cobrarPropina,
    propinaBps: Math.round(propinaPct * 100),
    costoEnvio: centavos(parseFloat(envio || "0") || 0),
    // Solo si la pizza sale del local. En mesa no hay caja que pagar.
    cobrarEmpaque: cobrarEmpaque && tipo !== "mesa",
  };

  const t = useMemo(
    () => calcularTotales(lineas, descuentos, config),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lineas, descuentos, cobrarPropina, propinaPct, envio, cobrarEmpaque, tipo, configBase]
  );

  /** Línea del pedido cuyas mitades se están cambiando. */
  const lineaEnEdicion = editaMitades ? lineas.find((l) => l.id === editaMitades) ?? null : null;

  const confirmarMitades = (a: MitadPizza, b: MitadPizza) => {
    const datos = datosLineaMitades(a, b, config.precioMitades);
    setLineas((prev) =>
      lineaEnEdicion
        ? prev.map((l) => (l.id === lineaEnEdicion.id ? { ...l, ...datos } : l))
        : [...prev, { id: crypto.randomUUID(), cantidad: 1, ...datos }]
    );
    avisar({
      texto: lineaEnEdicion ? "Mitades cambiadas" : "Agregado",
      detalle: `${a.nombre} / ${b.nombre}`,
      tono: lineaEnEdicion ? "cambiado" : "agregado",
    });
    setEditaMitades(null);
  };

  const agregar = (p: Producto) => {
    setLineas((prev) => {
      // Solo se suma a una línea SIN nota ni extras: tocar «Diabla» otra vez
      // después de ponerle bacon a la primera daba dos Diablas con bacon.
      const i = prev.findIndex(
        (l) => l.productoId === p.id && !l.notas && !(l.modificadores?.length)
      );
      if (i >= 0) {
        const c = [...prev];
        const n = c[i].cantidad + 1;
        c[i] = { ...c[i], cantidad: n };
        // La cantidad RESULTANTE, no "+1": es lo que se compara con lo pedido.
        avisar({ texto: `${p.nombre} ×${n}`, detalle: "Cantidad actualizada", tono: "cambiado" });
        return c;
      }
      avisar({ texto: "Agregado", detalle: p.nombre, tono: "agregado" });
      return [...prev, {
        id: crypto.randomUUID(), productoId: p.id, nombre: p.nombre,
        precioUnit: p.precio, cantidad: 1, grupo: p.grupo_descuento,
        aplicaIva: p.aplica_iva !== false,
        ivaIncluido: p.precio_incluye_iva === true,
      }];
    });
  };

  const cambiarCantidad = (id: string, delta: number) =>
    setLineas((prev) => {
      const linea = prev.find((l) => l.id === id);
      if (!linea) return prev;
      const n = linea.cantidad + delta;

      if (n <= 0) {
        // Quitar una línea cargada a mano es lo más fácil de lamentar.
        const indice = prev.indexOf(linea);
        avisar({
          texto: "Quitado", detalle: linea.nombre, tono: "quitado",
          deshacer: () => setLineas((actual) => {
            const c = [...actual];
            c.splice(Math.min(indice, c.length), 0, linea);
            return c;
          }),
        });
        return prev.filter((l) => l.id !== id);
      }
      avisar({ texto: `${linea.nombre} ×${n}`, detalle: "Cantidad actualizada", tono: "cambiado" });
      return prev.map((l) => (l.id === id ? { ...l, cantidad: n } : l));
    });

  const setNotaLinea = (id: string, texto: string) =>
    setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, notas: texto } : l)));

  /**
   * Pone o quita un extra. Se guarda el NOMBRE y el PRECIO del momento, no
   * una referencia al catálogo: si mañana el bacon sube, la reimpresión de
   * hoy tiene que seguir diciendo lo que se cobró.
   */
  const alternarExtra = (lineaId: string, extra: Producto) => {
    const linea = lineas.find((l) => l.id === lineaId);
    if (!linea) return;
    const lleva = (linea.modificadores ?? []).some((m) => m.nombre === extra.nombre);
    setLineas((prev) => prev.map((l) => l.id !== lineaId ? l : {
      ...l,
      modificadores: lleva
        ? (l.modificadores ?? []).filter((m) => m.nombre !== extra.nombre)
        : [...(l.modificadores ?? []), { nombre: extra.nombre, precio: extra.precio }],
    }));
    avisar({
      texto: lleva ? `${extra.nombre} quitado` : `${extra.nombre} agregado`,
      detalle: linea.cantidad > 1 ? `${linea.nombre} ×${linea.cantidad}` : linea.nombre,
      tono: lleva ? "quitado" : "agregado",
    });
  };

  const limpiar = () => {
    setLineas([]); setDescuentos([]); setMotivoDesc("");
    setMesa(""); setCliente(""); setTelefono(""); setDireccion("");
    setNotas(""); setEnvio(""); setRecibido(""); setCobrarPropina(false);
    setCobrarEmpaque(true); setMetodoPago("efectivo");
    setConfigBase(CONFIG_DEFAULT); setEdicion(null); setMotivoEdicion("");
    setIdPedido(crypto.randomUUID());
  };

  /**
   * Abre una orden guardada en la caja, tal como se guardó, para corregirla
   * o cobrarla. No se pierde nada que esté a medio armar: si hay un pedido
   * en curso, primero hay que terminarlo o cancelarlo.
   */
  const abrirOrden = useCallback(async (o: OrdenBreve) => {
    if (lineas.length > 0 && edicion?.id !== o.id) {
      avisar({
        texto: "Hay un pedido en curso",
        detalle: "Guárdalo, cóbralo o cancélalo antes de abrir otra orden.",
        tono: "error",
      });
      return;
    }
    try {
      const { o: fila, lineas: ls, descuentos: ds, config: cfg } = await cargarOrden(o.id);
      setLineas(ls);
      setDescuentos(ds);
      setMotivoDesc(fila.desc_motivo ?? "");
      setTipo(fila.tipo);
      setMesa(fila.mesa ?? ""); setCliente(fila.cliente ?? "");
      setTelefono(fila.telefono_cliente ?? ""); setDireccion(fila.direccion ?? "");
      setNotas(fila.notas ?? ""); setAtendio(fila.atendio ?? "");
      setCobrarPropina(fila.propina > 0);
      if (fila.propina_bps) setPropinaPct(fila.propina_bps / 100);
      setEnvio(fila.costo_envio ? String(fila.costo_envio / 100) : "");
      setMetodoPago(fila.metodo_pago ?? "efectivo");
      setRecibido(fila.recibido ? String(fila.recibido / 100) : "");
      setCobrarEmpaque((fila.empaque_por_pizza ?? 0) > 0 || fila.tipo === "mesa");
      setConfigBase({
        ...CONFIG_DEFAULT,
        ...cfg,
        // Una orden de mesa no guardó tarifa (no se empaca). Si ahora pasa a
        // para llevar, se usa la de hoy.
        empaquePorPizza: cfg.empaquePorPizza || CONFIG_DEFAULT.empaquePorPizza,
      });
      setEdicion({ id: o.id, numero: fila.numero, pagada: fila.estado === "pagada",
                   totalAntes: fila.total });
      setMotivoEdicion("");
      setVista("menu");
      // En teléfono se abre la hoja; en PC el pedido ya está a la vista, y la
      // hoja montada bloquearía el desplazamiento de la página.
      if (window.matchMedia("(max-width: 1023px)").matches) setHojaAbierta(true);
      avisar({ texto: `Orden #${fila.numero} abierta`, detalle: "Cambia lo que haga falta y guarda",
               tono: "cambiado" });
    } catch (e) {
      avisar({ texto: "No se pudo abrir la orden", detalle: explicar(e), tono: "error" });
    }
  }, [lineas.length, edicion?.id, avisar]);

  const totalItems = lineas.reduce((n, l) => n + l.cantidad, 0);
  const recibidoCent = centavos(parseFloat(recibido || "0") || 0);
  const cambio = recibidoCent > 0 ? recibidoCent - t.total : 0;

  const datosOrden = (estado: "abierta" | "pagada") => ({
    lineas, descuentos, config, tipo,
    mesa, cliente, telefonoCliente: telefono, direccion, notas, atendio,
    metodoPago, recibido: estado === "pagada" && recibidoCent > 0 ? recibidoCent : undefined,
    motivoDescuento: motivoDesc, turnoId: turno?.id ?? null, estado,
    idLocal: idPedido,
  });

  /** El error en palabras de la caja. Una base atrasada no es «un error». */
  const explicar = (e: unknown) => {
    const err = e as { code?: string; message?: string };
    return noExisteFuncion(err) || noExisteColumna(err) ? BASE_DESACTUALIZADA : err.message ?? String(e);
  };

  /**
   * Un error del cobro, dicho donde se ve. El aviso de abajo del pedido queda
   * fuera de la pantalla en el teléfono (y detrás del aviso flotante), así
   * que el botón parecía no hacer nada. Si hay un campo que corregir, se lleva
   * la vista a él.
   */
  const fallar = (txt: string, campo?: string) => {
    setAviso({ txt, mal: true });
    avisar({ texto: "No se guardó", detalle: txt, tono: "error" });
    if (!campo) return;
    const el = [...document.querySelectorAll<HTMLInputElement>(`[aria-label="${campo}"]`)]
      .find((e) => e.offsetParent !== null);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  };

  /**
   * Tras guardar: se limpia todo y se confirma a la vista.
   *
   * Tres finales posibles, y cada uno se dice distinto:
   * - normal;
   * - guardada pero SIN ticket: la orden está bien, lo que falló es la cola
   *   de impresión. Antes esto se veía como «no se pudo guardar» y el cajero
   *   la cobraba otra vez;
   * - ya existía: era un reintento de una orden que sí había entrado. No se
   *   creó otra. Si el pedido cambió entre intentos, se corrige abriéndola.
   */
  const terminar = (
    texto: string, detalle: string,
    r: { id?: string; impreso?: boolean; yaExistia?: boolean; numero?: number } = {},
  ) => {
    setRefrescoOrdenes((n) => n + 1);
    limpiar();
    setHojaAbierta(false);
    setAviso(null);
    // Si el papel no sale, esto evita el error caro: rehacer el pedido y
    // cobrarlo otra vez, que duplica la venta en el cierre.
    const reimprimirla = r.id
      ? { accion: { texto: "Reimprimir", hacer: () => { reimprimir(r.id!).catch(() => {}); } } }
      : {};
    if (r.yaExistia) {
      avisar({
        texto: `La orden #${r.numero} ya estaba guardada`,
        detalle: "No se cobró dos veces. Si cambiaste algo después, ábrela en Órdenes guardadas.",
        tono: "cambiado",
        accion: { texto: "Ver órdenes", hacer: () => setVista("ordenes") },
      });
    } else if (r.impreso === false) {
      avisar({
        texto: `${texto}, sin ticket`,
        detalle: "Se guardó bien. El ticket no llegó a la impresora.",
        tono: "error", ...reimprimirla,
      });
    } else {
      avisar({ texto, detalle, tono: "agregado", ...reimprimirla });
      // El ticket quedó en la cola, pero si la PC de caja no está, ahí se
      // queda. Se dice en el momento, con el camino para imprimir ya.
      if (r.id && !imprimeDirecto()) {
        pcResponde().then((viva) => {
          if (viva) return;
          avisar({
            texto: `${texto} · la PC de caja no responde`,
            detalle: "El ticket sale cuando vuelva. Para imprimir ya, conecta la impresora por Bluetooth.",
            tono: "cambiado",
            accion: { texto: "Conectar", hacer: () => router.push("/impresora") },
          });
        });
      }
    }
  };

  const cobrar = async () => {
    if (lineas.length === 0) return;
    if (edicion?.pagada && !motivoEdicion.trim()) {
      return fallar("Falta el motivo de la corrección: queda en la bitácora.", "Motivo de la corrección");
    }
    // Al corregir una orden cobrada viene el «recibido» de entonces: si ahora
    // el total es mayor, hay que poner lo que se recibió de verdad.
    if (metodoPago === "efectivo" && recibidoCent > 0 && cambio < 0) {
      return fallar(`Recibido ${fmtC(recibidoCent)} es menos que el total ${fmtC(t.total)}.`, "Efectivo recibido");
    }
    setGuardando(true);
    setAviso(null);
    try {
      // Cobrar exige conexión: un cobro guardado solo en el teléfono no
      // existe para el arqueo de caja.
      if (!(await hayInternet())) {
        return fallar("Sin conexión no se puede cobrar. Puedes guardar la orden sin cobrar: se sube sola al volver la señal.");
      }
      if (edicion) {
        const { orden, impreso } = await editarOrden(edicion.id, datosOrden("pagada"),
          { motivo: motivoEdicion, estabaPagada: edicion.pagada });
        terminar(
          edicion.pagada ? `Orden #${orden.numero} corregida` : `Orden #${orden.numero} cobrada`,
          edicion.pagada ? "Hoja corregida enviada a imprimir" : "Enviada a imprimir",
          { id: orden.id, impreso },
        );
      } else {
        const r = await guardarOrden(datosOrden("pagada"));
        terminar(`Orden #${r.numero} cobrada`, "Enviada a imprimir", r);
      }
    } catch (e) {
      fallar(`No se pudo guardar: ${explicar(e)}`);
    } finally {
      setGuardando(false);
    }
  };

  /**
   * Guarda SIN cobrar: no cuenta en el cierre ni imprime. Queda en «Sin
   * cobrar» para abrirla después, agregarle lo que pidan y cobrarla.
   * Funciona sin conexión: se sube sola al reconectar.
   */
  const guardarSinCobrar = async () => {
    if (lineas.length === 0) return;
    setGuardando(true);
    setAviso(null);
    try {
      if (edicion) {
        if (!(await hayInternet())) {
          return fallar("Sin conexión no se puede cambiar una orden ya guardada.");
        }
        const { orden } = await editarOrden(edicion.id, datosOrden("abierta"), { estabaPagada: false });
        terminar(`Orden #${orden.numero} actualizada`, "Sigue sin cobrar");
        return;
      }
      const r = await guardarOrden(datosOrden("abierta"));
      terminar(
        r.offline ? `Guardada como T-${r.numero}` : `Orden #${r.numero} guardada`,
        r.offline ? "Se sube sola al volver la señal" : "Sin cobrar · la encuentras en Órdenes",
        { yaExistia: r.yaExistia, numero: r.numero },
      );
    } catch (e) {
      fallar(`No se pudo guardar: ${explicar(e)}`);
    } finally {
      setGuardando(false);
    }
  };

  /** Anula la orden guardada que está abierta en la caja. */
  const anular = async () => {
    if (!edicion || !motivoAnular?.trim()) return;
    setGuardando(true);
    try {
      if (!(await hayInternet())) {
        avisar({ texto: "No se anuló", detalle: "Sin conexión no se puede anular una orden.", tono: "error" });
        return;
      }
      const numero = edicion.numero;
      await anularOrden(edicion.id, motivoAnular);
      setMotivoAnular(null);
      setRefrescoOrdenes((n) => n + 1);
      limpiar();
      setHojaAbierta(false);
      avisar({ texto: `Orden #${numero} anulada`, detalle: "Ya no sale en el cierre", tono: "quitado" });
    } catch (e) {
      avisar({ texto: "No se anuló", detalle: explicar(e), tono: "error" });
    } finally {
      setGuardando(false);
    }
  };

  const imprimirPrecuenta = async () => {
    if (lineas.length === 0) return;
    setGuardando(true);
    setAviso(null);
    try {
      // La pre-cuenta no guarda la orden: es para que el cliente revise.
      const salida = await imprimirDocumento(null, "precuenta", {
        numero: edicion?.numero ?? 0, tipo, mesa, cliente, telefonoCliente: telefono, direccion,
        notas, mesero: atendio, fecha: new Date(), totales: t, documento: "precuenta",
      });
      avisar({
        texto: "Pre-cuenta enviada",
        detalle: salida === "bluetooth" ? "Por Bluetooth, desde este teléfono" : "A la PC de caja",
        tono: "agregado",
      });
    } catch (e) {
      fallar(`No se pudo imprimir: ${explicar(e)}`);
    } finally {
      setGuardando(false);
    }
  };

  const datosTicket = (): DatosTicket => ({
    numero: edicion?.numero ?? 0, tipo, mesa, cliente, telefonoCliente: telefono, direccion, notas,
    metodoPago, recibido: recibidoCent, mesero: atendio, fecha: new Date(), totales: t,
  });

  const textoCobrar = guardando ? "Guardando…"
    : edicion?.pagada ? "Guardar corrección e imprimir"
    : `Cobrar ${fmtC(t.total)}`;

  // ------------------------------------------------------------------ UI --

  /** Tipo de orden y datos del cliente. Una sola vez, para teléfono y PC. */
  const datos = (
    <div className="panel space-y-2 p-3">
      {/* En una fila y con nombres cortos: en dos filas ocupaba media hoja
          del pedido antes de llegar a lo pedido. */}
      <Segmentado<TipoOrden>
        etiqueta="Tipo de orden" valor={tipo} onCambio={setTipo}
        opciones={TIPOS_ORDEN.map((x) => ({ valor: x.valor, etiqueta: TIPO_CORTO[x.valor] }))} />
      <div className="grid grid-cols-2 gap-2">
        {tipo === "mesa" ? (
          <input className="input" placeholder="Mesa #" inputMode="numeric" value={mesa}
                 aria-label="Mesa" onChange={(e) => setMesa(e.target.value)} />
        ) : (
          <input className="input" placeholder="Cliente" value={cliente} aria-label="Cliente"
                 onChange={(e) => setCliente(e.target.value)} />
        )}
        <input className="input" placeholder="Atendió" value={atendio} aria-label="Atendió"
               onChange={(e) => setAtendio(e.target.value)} />
      </div>
      {tipo === "delivery" && (
        <div className="grid grid-cols-2 gap-2">
          <input className="input" placeholder="Teléfono" inputMode="tel" value={telefono}
                 aria-label="Teléfono" onChange={(e) => setTelefono(e.target.value)} />
          <input className="input" placeholder="Envío C$" inputMode="decimal" value={envio}
                 aria-label="Costo de envío" onChange={(e) => setEnvio(e.target.value)} />
          <input className="input col-span-2" placeholder="Dirección" value={direccion}
                 aria-label="Dirección" onChange={(e) => setDireccion(e.target.value)} />
        </div>
      )}
    </div>
  );

  /** Aviso de que se está corrigiendo una orden guardada, y cuánto cambia. */
  const bandaEdicion = edicion && (
    <div className="panel space-y-2 p-3" style={{ borderColor: "var(--acc)", background: "var(--acc-fondo)" }}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-sm font-bold" style={{ color: "var(--acc)" }}>
            Editando la orden #{edicion.numero}
          </div>
          <div className="text-xs" style={{ color: "var(--acc-2)" }}>
            {edicion.pagada ? "Ya estaba cobrada" : "Guardada sin cobrar"}
          </div>
        </div>
        <button className="btn btn-ghost btn-chico"
                onClick={() => { limpiar(); setHojaAbierta(false);
                                 avisar({ texto: "Sin cambios", detalle: `La orden #${edicion.numero} quedó como estaba`, tono: "quitado" }); }}>
          Salir sin guardar
        </button>
      </div>
      {edicion.pagada && (
        <>
          <Diferencia antes={edicion.totalAntes} ahora={t.total} />
          <input className="input" placeholder="Motivo de la corrección (obligatorio)"
                 value={motivoEdicion} onChange={(e) => setMotivoEdicion(e.target.value)}
                 aria-label="Motivo de la corrección" />
        </>
      )}
    </div>
  );

  const pedido = (
    <>
      {bandaEdicion}
      {datos}

      <div className="panel p-2.5">
        {lineas.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: "var(--txt-2)" }}>
            Toca un producto del menú para agregarlo
          </p>
        ) : (
          <div className="space-y-2">
            {t.lineas.map((l) => (
              <LineaPedido key={l.id} l={l} extras={extras}
                           admiteExtras={l.grupo === "pizza" || esPromo(l)} esPromo={esPromo(l)}
                           onCantidad={(d) => cambiarCantidad(l.id, d)}
                           onNota={(n) => setNotaLinea(l.id, n)}
                           onExtra={(e) => alternarExtra(l.id, e)}
                           onMitades={() => setEditaMitades(l.id)} />
            ))}
            <input className="input !min-h-11 !text-sm" placeholder="Nota para toda la orden"
                   value={notas} onChange={(e) => setNotas(e.target.value)}
                   aria-label="Nota para toda la orden" />
          </div>
        )}
      </div>

      {lineas.length > 0 && (
        <>
          {/* Lo opcional, plegado: abierto empujaba el total fuera de la vista. */}
          <Plegable titulo="Descuentos" activo={t.descTotal > 0}
                    resumen={t.descTotal > 0 ? `−${fmtC(t.descTotal)}` : undefined}>
            <PanelDescuentos descuentos={descuentos} setDescuentos={setDescuentos}
              aplicados={{ general: t.descGeneral, pizza: t.descPizzas, bebida: t.descBebidas }} />
            {t.descTotal > 0 && (
              <input className="input mt-2" placeholder="Motivo del descuento (queda en el cierre)"
                     value={motivoDesc} onChange={(e) => setMotivoDesc(e.target.value)} />
            )}
          </Plegable>

          <div className="space-y-2">
            <Interruptor activo={cobrarPropina} onCambio={setCobrarPropina}
                         detalle={cobrarPropina ? `${fmtC(t.propina)} · sin IVA` : "El cliente puede rechazarla"}>
              Propina {propinaPct}%
            </Interruptor>
            {cobrarPropina && (
              <Segmentado<number> etiqueta="Porcentaje de propina" valor={propinaPct}
                                  onCambio={setPropinaPct}
                                  opciones={[5, 10, 15].map((p) => ({ valor: p, etiqueta: `${p}%` }))} />
            )}
            {/* Solo cuando hay algo que empacar. A veces traen su propia caja. */}
            {tipo !== "mesa" && lineas.some((l) => l.grupo === "pizza") && (
              <Interruptor activo={cobrarEmpaque} onCambio={setCobrarEmpaque}
                           detalle={`${fmtC(configBase.empaquePorPizza)} por pizza${t.empaque > 0 ? ` · ${fmtC(t.empaque)}` : ""}`}>
                Cobrar empaque
              </Interruptor>
            )}
          </div>

          <div className="panel p-3.5">
            <dl className="mono space-y-1 text-sm">
              <Fila k="Subtotal" v={fmtC(t.subtotalBruto)} />
              {t.descPizzas > 0 && <Fila k="Desc. pizzas" v={`−${fmtC(t.descPizzas)}`} acc />}
              {t.descBebidas > 0 && <Fila k="Desc. bebidas" v={`−${fmtC(t.descBebidas)}`} acc />}
              {t.descGeneral > 0 && <Fila k="Desc. general" v={`−${fmtC(t.descGeneral)}`} acc />}
              {t.costoEnvio > 0 && <Fila k="Envío" v={fmtC(t.costoEnvio)} />}
              {t.empaque > 0 && <Fila k={`Empaque ×${t.pizzasEmpacadas}`} v={fmtC(t.empaque)} />}
              {/* El que se suma, igual que el recibo: una promo trae el
                  suyo adentro y no tiene por qué verse cobrado otra vez. */}
              {t.ivaAgregado > 0 && <Fila k="IVA 15%" v={fmtC(t.ivaAgregado)} />}
              {t.propina > 0 && <Fila k={`Propina ${propinaPct}%`} v={fmtC(t.propina)} />}
            </dl>
            <div className="mt-3 flex items-end justify-between border-t pt-3"
                 style={{ borderColor: "var(--borde)" }}>
              <span className="display text-2xl">Total</span>
              <span className="mono text-2xl font-bold">{fmtC(t.total)}</span>
            </div>

            <div className="mt-4 space-y-2">
              <span className="rotulo">Forma de pago</span>
              <Segmentado<MetodoPago> etiqueta="Forma de pago" valor={metodoPago} onCambio={setMetodoPago}
                opciones={METODOS_PAGO.map((m) => ({ valor: m.valor, etiqueta: m.etiqueta }))} />
              {metodoPago === "efectivo" && (
                <div className="grid grid-cols-2 items-center gap-2">
                  <input className="input mono" inputMode="decimal" placeholder="Recibido C$"
                         aria-label="Efectivo recibido"
                         value={recibido} onChange={(e) => setRecibido(e.target.value)} />
                  <div className="mono text-right leading-tight">
                    <div className="rotulo">Cambio</div>
                    <div className="text-lg font-bold"
                         style={{ color: cambio < 0 ? "var(--mal)" : recibidoCent > 0 ? "var(--ok)" : "var(--txt-3)" }}>
                      {cambio < 0 ? `Faltan ${fmtC(-cambio)}` : fmtC(Math.max(0, cambio))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Una sola acción principal. En teléfono vive clavada al pie de
                la hoja; aquí, solo en PC. */}
            <div className="mt-4 space-y-2">
              <button className="btn btn-acc hidden w-full !py-4 text-base lg:flex"
                      disabled={guardando || lineas.length === 0} onClick={cobrar}>
                {textoCobrar}
              </button>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                {!edicion?.pagada && (
                  <button className="btn btn-ghost" disabled={guardando} onClick={guardarSinCobrar}>
                    {edicion ? "Guardar cambios" : "Guardar sin cobrar"}
                  </button>
                )}
                <button className={`btn btn-ghost ${edicion?.pagada ? "col-span-2" : ""}`}
                        disabled={guardando} onClick={imprimirPrecuenta}>
                  Pre-cuenta
                </button>
              </div>

              <button className="btn-texto w-full justify-center" aria-expanded={verMas}
                      onClick={() => setVerMas((v) => !v)}>
                {verMas ? "Menos opciones" : "Más opciones"}
              </button>
              {verMas && (
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn btn-ghost btn-chico" onClick={() => setVerPreview((v) => !v)}>
                    {verPreview ? "Ocultar ticket" : "Ver ticket"}
                  </button>
                  {/* Respaldo del spec: si el puente está caído, igual se
                      entrega algo. Funciona en cualquier navegador. */}
                  <button className="btn btn-ghost btn-chico" onClick={() => imprimirHtml(datosTicket())}>
                    Imprimir aquí
                  </button>
                  <button className="btn btn-ghost btn-chico" onClick={() => descargarHtml(datosTicket())}>
                    Descargar recibo
                  </button>
                  {!edicion ? (
                    // Con confirmación: un toque borraba un pedido entero.
                    <button className="btn btn-mal-suave btn-chico" onClick={() => setConfirmaCancelar(true)}>
                      Cancelar orden
                    </button>
                  ) : (
                    // Una orden ya guardada no se «cancela»: se anula, con
                    // motivo, y sale del cierre y de lo vendido.
                    <button className="btn btn-mal-suave btn-chico" onClick={() => setMotivoAnular("")}>
                      Anular orden
                    </button>
                  )}
                </div>
              )}
              {menuDesdeCache && (
                <p className="text-center text-xs" style={{ color: "var(--acc-2)" }}>
                  Menú desde la copia local. Sin conexión solo se puede guardar sin cobrar.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {verPreview && lineas.length > 0 && (
        <pre className="panel mono overflow-x-auto p-3 text-[11px] leading-snug"
             style={{ color: "var(--txt-2)" }}>{previsualizarTicket(datosTicket())}</pre>
      )}

      {aviso && (
        <div role="alert" className="panel p-3 text-sm"
             style={{ color: aviso.mal ? "var(--mal)" : "var(--ok)",
                      borderColor: aviso.mal ? "var(--mal-fondo)" : undefined }}>
          {aviso.txt}
        </div>
      )}
    </>
  );

  // Sin base no se dibuja la caja: una caja a medias es peor que ninguna.
  if (!hayConfig) {
    return (
      <div className="mx-auto max-w-lg p-3">
        <div className="panel p-5" style={{ borderColor: "var(--mal)" }}>
          <b style={{ color: "var(--mal)" }}>Falta conectar la base de datos.</b>
          <p className="mt-2 text-sm leading-snug" style={{ color: "var(--txt-2)" }}>
            Sin ella no hay menú que mostrar ni dónde guardar una orden. Son dos
            variables de entorno y un archivo de SQL que se pega una sola vez.
          </p>
          <div className="mt-4 grid gap-2">
            <Link className="btn btn-acc text-center" href="/configuracion">Ver qué falta</Link>
            <Link className="btn btn-ghost text-center" href="/impresora">Probar la impresora</Link>
          </div>
        </div>
      </div>
    );
  }

  const ordenes = (
    <UltimasOrdenes refresco={refrescoOrdenes} onEditar={abrirOrden} editando={edicion?.id} />
  );

  return (
    <div className="mx-auto grid max-w-7xl gap-4 px-3 pb-28 pt-3 lg:grid-cols-[1fr_420px] lg:pb-6">
      {/* ---------------------------------------------------------- menú -- */}
      {/* min-w-0: sin esto la fila de categorías ensancha la columna y la
          página entera termina con desplazamiento horizontal. */}
      <section className="min-w-0">
        {/* En teléfono: tomar pedido u órdenes guardadas. En PC las órdenes
            están siempre en la columna de la derecha. */}
        <div className="mb-1 lg:hidden">
          <Segmentado<"menu" | "ordenes"> etiqueta="Vista de la caja" valor={vista} onCambio={setVista}
            opciones={[{ valor: "menu", etiqueta: "Menú" },
                       { valor: "ordenes", etiqueta: "Órdenes guardadas" }]} />
        </div>
        <div className={vista === "ordenes" ? "hidden lg:block" : undefined}>
          <Menu menu={menu} categorias={categorias} lineas={lineas}
                onAgregar={agregar} onMitades={() => setEditaMitades("")}
                hayPizzas={pizzas.length > 0} />
        </div>
        {vista === "ordenes" && <div className="mt-3 lg:hidden">{ordenes}</div>}
      </section>

      {/* -------------------------------------------------- pedido (PC) -- */}
      <aside className="hidden min-w-0 lg:block">
        <div className="sticky space-y-3 overflow-y-auto pb-4 pr-1 sin-barra"
             style={{ top: "calc(var(--header-alto) + 12px)",
                      maxHeight: "calc(100dvh - var(--header-alto) - 24px)" }}>
          {pedido}
          {ordenes}
        </div>
      </aside>

      {/* En teléfono el pedido no está a la vista: esta barra dice siempre
          cuánto llevas y lo abre con el pulgar. */}
      <BarraPedido items={totalItems} total={t.total} onAbrir={() => setHojaAbierta(true)}
                   editando={edicion ? `#${edicion.numero}` : null} />
      <HojaPedido abierta={hojaAbierta} onCerrar={() => setHojaAbierta(false)}
        titulo={edicion ? `Orden #${edicion.numero}` : "Pedido"}
        pie={
          <>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="display text-xl" style={{ color: "var(--txt-2)" }}>Total</span>
              <span className="mono text-2xl font-bold">{fmtC(t.total)}</span>
            </div>
            {/* Deshabilitado con el pedido vacío: un botón de cobrar activo
                sobre «TOTAL C$ 0.00» hace dudar de si el cobro anterior
                entró, y esa duda termina en la orden cargada dos veces. */}
            <button className="btn btn-acc w-full !py-4 text-base"
                    disabled={guardando || lineas.length === 0} onClick={cobrar}>
              {textoCobrar}
            </button>
          </>
        }>
        <div className="space-y-3">{pedido}</div>
      </HojaPedido>

      {/* Cancelar borra un pedido que puede llevar diez líneas cargadas a
          mano. Un toque accidental no debería poder hacerlo.
          Los diálogos van al centro y no abajo: abajo salen los avisos, y
          uno recién mostrado tapaba la pregunta. */}
      {confirmaCancelar && (
        <div role="dialog" aria-modal="true" aria-label="Cancelar la orden"
             className="fixed inset-0 z-[55] flex items-center justify-center p-3"
             style={{ background: "var(--velo)" }} onClick={() => setConfirmaCancelar(false)}>
          <div className="panel surgir w-full max-w-sm space-y-3 p-4" style={{ background: "var(--panel-3)" }}
               onClick={(e) => e.stopPropagation()}>
            <b className="block text-lg">¿Cancelar la orden?</b>
            <p className="text-sm" style={{ color: "var(--txt-2)" }}>
              {lineas.length === 1
                ? `Se borra 1 línea por ${fmtC(t.total)}.`
                : `Se borran ${lineas.length} líneas por ${fmtC(t.total)}.`}{" "}
              Se puede deshacer durante unos segundos.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn btn-ghost" onClick={() => setConfirmaCancelar(false)}>
                Seguir con la orden
              </button>
              <button className="btn btn-mal"
                      onClick={() => {
                        const antes = lineas;
                        limpiar();
                        setConfirmaCancelar(false);
                        setHojaAbierta(false);
                        avisar({
                          texto: "Orden cancelada",
                          detalle: `${antes.length} ${antes.length === 1 ? "línea" : "líneas"}`,
                          tono: "quitado",
                          deshacer: () => setLineas(antes),
                        });
                      }}>
                Sí, cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Anular una orden guardada: se canceló, o se cargó por error. Sale
          del cierre y del Excel; queda en la bitácora con quién y por qué. */}
      {motivoAnular !== null && edicion && (
        <div role="dialog" aria-modal="true" aria-label="Anular la orden"
             className="fixed inset-0 z-[55] flex items-center justify-center p-3"
             style={{ background: "var(--velo)" }} onClick={() => setMotivoAnular(null)}>
          <form className="panel surgir w-full max-w-sm space-y-3 p-4" style={{ background: "var(--panel-3)" }}
                onClick={(e) => e.stopPropagation()}
                onSubmit={(e) => { e.preventDefault(); anular(); }}>
            <b className="block text-lg">¿Anular la orden #{edicion.numero}?</b>
            <p className="text-sm leading-snug" style={{ color: "var(--txt-2)" }}>
              Sale del cierre y de lo vendido
              {edicion.pagada ? ` (se cobraron ${fmtC(edicion.totalAntes)})` : ""}.
              No se puede deshacer.
            </p>
            <input className="input" autoFocus placeholder="Motivo (obligatorio)"
                   aria-label="Motivo de la anulación" value={motivoAnular}
                   onChange={(e) => setMotivoAnular(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setMotivoAnular(null)}>
                No anular
              </button>
              <button type="submit" className="btn btn-mal" disabled={guardando || !motivoAnular.trim()}>
                Anular
              </button>
            </div>
          </form>
        </div>
      )}

      {editaMitades !== null && (
        <MitadYMitad
          pizzas={pizzas}
          regla={config.precioMitades}
          inicial={lineaEnEdicion?.mitades ?? null}
          onConfirmar={confirmarMitades}
          onCancelar={() => setEditaMitades(null)}
        />
      )}
    </div>
  );
}

/** Cuánto cambia el total de una orden ya cobrada: cobrar o devolver. */
function Diferencia({ antes, ahora }: { antes: number; ahora: number }) {
  const d = ahora - antes;
  return (
    <div className="mono flex items-center justify-between rounded-xl px-3 py-2 text-sm"
         style={{ background: "var(--panel)" }}>
      <span style={{ color: "var(--txt-2)" }}>{fmtC(antes)} → {fmtC(ahora)}</span>
      <b style={{ color: d === 0 ? "var(--txt-2)" : d > 0 ? "var(--acc)" : "var(--mal)" }}>
        {d === 0 ? "Mismo total" : d > 0 ? `Cobrar ${fmtC(d)} más` : `Devolver ${fmtC(-d)}`}
      </b>
    </div>
  );
}

function Fila({ k, v, acc }: { k: string; v: string; acc?: boolean }) {
  return (
    <div className="flex justify-between" style={acc ? { color: "var(--acc-2)" } : undefined}>
      <dt>{k}</dt><dd>{v}</dd>
    </div>
  );
}
