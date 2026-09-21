"use client";

import { useEffect, useMemo, useState } from "react";
import PanelDescuentos from "@/components/PanelDescuentos";
import BarraPedido from "@/components/BarraPedido";
import HojaPedido from "@/components/HojaPedido";
import { useAvisos } from "@/components/Avisos";
import Plegable from "@/components/Plegable";
import MitadYMitad from "@/components/MitadYMitad";
import { centavos, fmtC } from "@/lib/money";
import { calcularTotales } from "@/lib/pricing";
import { cargarMenu, encolar, turnoAbierto } from "@/lib/repo";
import { cargarMenuConRespaldo, guardarOrden } from "@/lib/offline/servicio";
import { guardarMenuLocal } from "@/lib/offline/db";
import { hayInternet } from "@/lib/offline/conexion";
import { previsualizarTicket, type DatosTicket } from "@/lib/ticket";
import { descargarHtml, imprimirHtml } from "@/lib/printer";
import { hayConfig } from "@/lib/supabase";
import Link from "next/link";
import {
  CONFIG_DEFAULT, METODOS_PAGO, TIPOS_ORDEN,
  type ConfigCobro, type Descuento, type LineaOrden,
  datosLineaMitades,
  type MetodoPago, type MitadPizza, type Producto, type TipoOrden,
} from "@/lib/types";

export default function Caja() {
  const { avisar } = useAvisos();
  const [menu, setMenu] = useState<Producto[]>([]);
  const [cat, setCat] = useState<string>("");
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
  const [imprimirCocina, setImprimirCocina] = useState(true);
  // Se puede quitar en el momento: a veces el cliente trae su propia caja, o
  // se lleva una sola porción.
  const [cobrarEmpaque, setCobrarEmpaque] = useState(true);

  const [turno, setTurno] = useState<{ id: string } | null>(null);
  const [verPreview, setVerPreview] = useState(false);
  const [verMas, setVerMas] = useState(false);
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const [notaAbierta, setNotaAbierta] = useState<string | null>(null);
  const [confirmaCancelar, setConfirmaCancelar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ txt: string; mal?: boolean } | null>(null);

  const [menuDesdeCache, setMenuDesdeCache] = useState(false);
  // null = cerrado; "" = agregando una nueva; <id> = editando esa linea.
  const [editaMitades, setEditaMitades] = useState<string | null>(null);

  useEffect(() => {
    // Sin base configurada NO se carga un menú de mentira. Antes se cargaba
    // uno empaquetado y la pantalla se veía normal: se podían armar pedidos
    // completos que no se guardaban en ningún lado. En una caja eso no es una
    // demostración, es una forma de perder una venta. Se muestra qué falta.
    if (!hayConfig) return;
    // Con respaldo local: si no hay internet se usa la copia guardada, para
    // poder seguir tomando órdenes.
    cargarMenuConRespaldo(cargarMenu, guardarMenuLocal)
      .then(({ productos, desdeCache }) => {
        setMenu(productos);
        setCat(productos[0]?.categoria ?? "");
        setMenuDesdeCache(desdeCache);
        if (desdeCache && productos.length === 0) {
          setAviso({ txt: "No hay menú guardado en este dispositivo. Conéctate una vez para descargarlo.", mal: true });
        }
      })
      .catch((e) => setAviso({ txt: `No se pudo cargar el menú: ${e.message}`, mal: true }));
    turnoAbierto().then((t) => setTurno(t)).catch(() => {});
  }, []);

  // Pizzas primero: son la mayoría de lo que se vende, y en una fila que se
  // desliza lo que queda fuera de pantalla cuesta un gesto más.
  const categorias = useMemo(() => {
    const vistas = [...new Set(menu.map((p) => p.categoria))];
    const esPizza = (c: string) =>
      menu.some((p) => p.categoria === c && p.grupo_descuento === "pizza");
    return [...vistas.filter(esPizza), ...vistas.filter((c) => !esPizza(c))];
  }, [menu]);

  // Solo las pizzas pueden partirse: una mitad de cerveza no existe.
  // Son 26 repartidas en cinco categorias, asi que el selector las ofrece
  // todas, no solo las de la categoria abierta.
  const pizzas = useMemo(
    () => menu.filter((p) => p.grupo_descuento === "pizza"),
    [menu]
  );

  const catEsDePizzas = useMemo(
    () => pizzas.length > 0 && menu.some(
      (p) => p.categoria === cat && p.grupo_descuento === "pizza"),
    [menu, cat, pizzas.length]
  );

  /** Línea del pedido que se está editando, si el modal se abrió para eso. */
  const lineaEnEdicion = editaMitades
    ? lineas.find((l) => l.id === editaMitades) ?? null
    : null;

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

  const config: ConfigCobro = {
    ...CONFIG_DEFAULT,
    cobrarPropina,
    propinaBps: Math.round(propinaPct * 100),
    costoEnvio: centavos(parseFloat(envio || "0") || 0),
    // Solo si la pizza sale del local. En mesa no hay caja que pagar.
    cobrarEmpaque: cobrarEmpaque && tipo !== "mesa",
  };

  const t = useMemo(
    () => calcularTotales(lineas, descuentos, config),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lineas, descuentos, cobrarPropina, propinaPct, envio, cobrarEmpaque, tipo]
  );

  const agregar = (p: Producto) => {
    setLineas((prev) => {
      const i = prev.findIndex((l) => l.productoId === p.id && !l.notas);
      if (i >= 0) {
        const c = [...prev];
        const n = c[i].cantidad + 1;
        c[i] = { ...c[i], cantidad: n };
        // Se dice la cantidad RESULTANTE, no "+1": es lo que hay que
        // comprobar contra lo que pidió el cliente.
        avisar({ texto: `${p.nombre} ×${n}`, detalle: "Cantidad actualizada",
                 tono: "cambiado" });
        return c;
      }
      avisar({ texto: "Agregado", detalle: p.nombre, tono: "agregado" });
      return [...prev, {
        id: crypto.randomUUID(), productoId: p.id, nombre: p.nombre,
        precioUnit: p.precio, cantidad: 1, grupo: p.grupo_descuento,
        aplicaIva: p.aplica_iva !== false,
      }];
    });
  };

  const cambiarCantidad = (id: string, delta: number) =>
    setLineas((prev) => {
      const linea = prev.find((l) => l.id === id);
      if (!linea) return prev;
      const n = linea.cantidad + delta;

      if (n <= 0) {
        // Quitar una línea de un pedido cargado a mano es lo más fácil de
        // lamentar, así que se puede volver atrás.
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
      avisar({ texto: `${linea.nombre} ×${n}`, detalle: "Cantidad actualizada",
               tono: "cambiado" });
      return prev.map((l) => (l.id === id ? { ...l, cantidad: n } : l));
    });

  const setNotaLinea = (id: string, notas: string) =>
    setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, notas } : l)));

  const limpiar = () => {
    setLineas([]); setDescuentos([]); setMotivoDesc("");
    setMesa(""); setCliente(""); setTelefono(""); setDireccion("");
    setNotas(""); setEnvio(""); setRecibido(""); setCobrarPropina(false);
  };

  const totalItems = lineas.reduce((n, l) => n + l.cantidad, 0);

  const recibidoCent = centavos(parseFloat(recibido || "0") || 0);
  const cambio = recibidoCent > 0 ? recibidoCent - t.total : 0;

  const cobrar = async () => {
    if (lineas.length === 0) return;
    if (metodoPago === "efectivo" && recibidoCent > 0 && cambio < 0) {
      setAviso({ txt: "El monto recibido es menor que el total.", mal: true });
      return;
    }
    setGuardando(true);
    setAviso(null);
    try {
      // El spec exige conexión para cobrar, y con razón: un cobro guardado
      // solo en el teléfono no existe para el arqueo de caja.
      if (!(await hayInternet())) {
        setAviso({
          txt: "Sin conexión no se puede cobrar. Puedes seguir tomando órdenes: se suben solas al volver la señal.",
          mal: true,
        });
        return;
      }

      const r = await guardarOrden({
        lineas, descuentos, config, tipo,
        mesa, cliente, telefonoCliente: telefono, direccion, notas, atendio,
        metodoPago, recibido: recibidoCent > 0 ? recibidoCent : undefined,
        motivoDescuento: motivoDesc, turnoId: turno?.id ?? null, imprimirCocina,
      });
      setAviso({ txt: `Orden #${r.numero} cobrada y enviada a la estación de impresión.` });
      limpiar();
    } catch (e) {
      setAviso({ txt: `Error al guardar: ${(e as Error).message}`, mal: true });
    } finally {
      setGuardando(false);
    }
  };

  /** Guarda sin cobrar. Funciona sin conexión: se sube sola al reconectar. */
  const guardarSinCobrar = async () => {
    if (lineas.length === 0) return;
    setGuardando(true);
    setAviso(null);
    try {
      const r = await guardarOrden({
        lineas, descuentos, config, tipo,
        mesa, cliente, telefonoCliente: telefono, direccion, notas, atendio,
        metodoPago, motivoDescuento: motivoDesc,
        turnoId: turno?.id ?? null, imprimirCocina,
      });
      setAviso({
        txt: r.offline
          ? `Orden guardada en este dispositivo como T-${r.numero}. Se sube sola al volver la conexión.`
          : `Orden #${r.numero} guardada.`,
      });
      limpiar();
    } catch (e) {
      setAviso({ txt: `Error: ${(e as Error).message}`, mal: true });
    } finally {
      setGuardando(false);
    }
  };

  const imprimirPrecuenta = async () => {
    if (lineas.length === 0) return;
    setGuardando(true);
    setAviso(null);
    try {
      // La pre-cuenta no cierra ni guarda la orden: es solo para que el
      // cliente revise antes de pagar.
      await encolar(null, "precuenta", {
        numero: 0, tipo, mesa, cliente, telefonoCliente: telefono, direccion,
        notas, mesero: atendio, fecha: new Date(), totales: t,
        documento: "precuenta",
      });
      setAviso({ txt: "Pre-cuenta enviada a la estación de impresión." });
    } catch (e) {
      setAviso({ txt: `Error: ${(e as Error).message}`, mal: true });
    } finally {
      setGuardando(false);
    }
  };

  const datosTicket = (): DatosTicket => ({
    numero: 0, tipo, mesa, cliente, telefonoCliente: telefono, direccion, notas,
    metodoPago, recibido: recibidoCent, mesero: atendio,
    fecha: new Date(), totales: t,
  });

  const previsualizacion = previsualizarTicket(datosTicket());

  /*
    El pedido, una sola vez. En PC vive en su columna; en teléfono, dentro de
    la hoja que sube desde abajo. Duplicar este bloque era la forma segura de
    que las dos versiones se separaran con el tiempo.
  */
  const pedido = (
    <>
          {/* carrito */}
          <div className="panel p-3">
            {lineas.length === 0 ? (
              <p className="py-6 text-center text-sm" style={{ color: "var(--txt-2)" }}>
                Toca un producto para agregarlo
              </p>
            ) : (
              <div className="space-y-2">
                {t.lineas.map((l) => (
                  <div key={l.id} className="rounded-lg p-2" style={{ background: "var(--panel-2)" }}>
                    <div className="flex items-center gap-2">
                      <button className="btn btn-ghost !min-h-0 !px-3 !py-1"
                              onClick={() => cambiarCantidad(l.id, -1)}>−</button>
                      <span className="mono w-6 text-center font-bold">{l.cantidad}</span>
                      <button className="btn btn-ghost !min-h-0 !px-3 !py-1"
                              onClick={() => cambiarCantidad(l.id, +1)}>+</button>
                      <span className="flex-1 text-sm font-medium leading-tight">{l.nombre}</span>
                      <span className="mono text-sm font-bold">{fmtC(l.bruto)}</span>
                    </div>
                    {l.mitades && (
                      <div className="mt-1.5 flex items-end justify-between gap-2">
                        <div className="flex flex-col gap-0.5 text-xs"
                             style={{ color: "var(--txt-2)" }}>
                          {l.mitades.map((mit, k) => (
                            <span key={k} className="flex items-center gap-1.5">
                              <span aria-hidden="true"
                                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                                    style={{ background: k === 0 ? "var(--acc)" : "var(--mitad-b)" }} />
                              <span>½ {mit.nombre}</span>
                            </span>
                          ))}
                        </div>
                        {/* Cambiar una mitad sin borrar y rehacer la línea. */}
                        <button className="btn btn-ghost !min-h-0 shrink-0 !px-2.5 !py-1 !text-xs"
                                onClick={() => setEditaMitades(l.id)}>
                          Cambiar
                        </button>
                      </div>
                    )}
                    {l.descTotal > 0 && (
                      <div className="mono mt-1 text-right text-xs" style={{ color: "var(--acc-2)" }}>
                        desc. -{fmtC(l.descTotal)} → {fmtC(l.neto)}
                      </div>
                    )}
                    {/* La nota es la excepción: una fila por línea en un pedido
                        de diez ítems era media pantalla de campos vacíos. */}
                    {(notaAbierta === l.id || l.notas) ? (
                      <input className="input mt-2 !min-h-10 !text-xs" autoFocus={notaAbierta === l.id}
                             placeholder="Nota (sin cebolla, bien cocida...)"
                             value={l.notas ?? ""}
                             onChange={(e) => setNotaLinea(l.id, e.target.value)} />
                    ) : (
                      <button className="mt-1.5 text-xs font-semibold"
                              style={{ color: "var(--txt-3)" }}
                              onClick={() => setNotaAbierta(l.id)}>
                        + Nota
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Descuentos plegados: son la excepción, y abiertos empujaban el
              total y el botón de cobrar fuera de la pantalla. */}
          {lineas.length > 0 && (
            <Plegable titulo="Descuentos" activo={t.descTotal > 0}
                      resumen={t.descTotal > 0 ? `−${fmtC(t.descTotal)}` : undefined}>
              <PanelDescuentos
                descuentos={descuentos} setDescuentos={setDescuentos}
                aplicados={{ general: t.descGeneral, pizza: t.descPizzas, bebida: t.descBebidas }}
              />
              {t.descTotal > 0 && (
                <input className="input mt-2" placeholder="Motivo del descuento (queda en el cierre)"
                       value={motivoDesc} onChange={(e) => setMotivoDesc(e.target.value)} />
              )}
            </Plegable>
          )}

          {/* Propina plegada, como los descuentos: es opcional y el cliente
              puede rechazarla, así que no merece un panel entero abierto. */}
          {lineas.length > 0 && (
            <Plegable titulo="Propina" activo={cobrarPropina}
                      resumen={cobrarPropina ? fmtC(t.propina) : undefined}>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setCobrarPropina((v) => !v)}
                        className={`chip ${cobrarPropina ? "chip-on" : ""}`}>
                  {cobrarPropina ? "Se cobra" : "No se cobra"}
                </button>
                {cobrarPropina && (
                  <>
                    {[10, 15].map((pc) => (
                      <button key={pc} onClick={() => setPropinaPct(pc)}
                              className={`chip ${propinaPct === pc ? "chip-on" : ""}`}>{pc}%</button>
                    ))}
                    <input className="input !w-20" inputMode="decimal" value={propinaPct}
                           aria-label="Porcentaje de propina"
                           onChange={(e) => setPropinaPct(parseFloat(e.target.value) || 0)} />
                  </>
                )}
              </div>
            </Plegable>
          )}

          {/* totales */}
          {lineas.length > 0 && (
            <div className="panel p-3">
              <dl className="mono space-y-1 text-sm">
                <Fila k="Subtotal" v={fmtC(t.subtotalBruto)} />
                {t.descPizzas > 0 && <Fila k="Desc. pizzas" v={`-${fmtC(t.descPizzas)}`} acc />}
                {t.descBebidas > 0 && <Fila k="Desc. bebidas" v={`-${fmtC(t.descBebidas)}`} acc />}
                {t.descGeneral > 0 && <Fila k="Desc. general" v={`-${fmtC(t.descGeneral)}`} acc />}
                {t.costoEnvio > 0 && <Fila k="Envío" v={fmtC(t.costoEnvio)} />}
              {t.empaque > 0 && (
                <Fila k={`Empaque ×${t.pizzasEmpacadas}`} v={fmtC(t.empaque)} />
              )}
                <Fila k="IVA 15%" v={fmtC(t.iva)} />
                {t.propina > 0 && <Fila k={`Propina ${propinaPct}%`} v={fmtC(t.propina)} />}
                <div className="my-2 border-t" style={{ borderColor: "var(--borde)" }} />
                <div className="flex justify-between text-xl font-black">
                  <span>TOTAL</span><span>{fmtC(t.total)}</span>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {METODOS_PAGO.map((m) => (
                  <button key={m.valor} onClick={() => setMetodoPago(m.valor)}
                          className={`chip ${metodoPago === m.valor ? "chip-on" : ""}`}>
                    {m.etiqueta}
                  </button>
                ))}
              </div>

              {metodoPago === "efectivo" && (
                <div className="mt-2 flex items-center gap-2">
                  <input className="input" inputMode="decimal" placeholder="Recibido C$"
                         value={recibido} onChange={(e) => setRecibido(e.target.value)} />
                  <div className="mono whitespace-nowrap text-sm">
                    Cambio:{" "}
                    <b style={{ color: cambio < 0 ? "var(--mal)" : "var(--ok)" }}>
                      {fmtC(Math.max(0, cambio))}
                    </b>
                  </div>
                </div>
              )}

              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={imprimirCocina}
                       onChange={(e) => setImprimirCocina(e.target.checked)} />
                También imprimir ticket de cocina
              </label>

              {/* Solo aparece cuando hay algo que empacar. A veces el cliente
                  trae su propia caja. */}
              {tipo !== "mesa" && lineas.some((l) => l.grupo === "pizza") && (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={cobrarEmpaque}
                         onChange={(e) => setCobrarEmpaque(e.target.checked)} />
                  Cobrar empaque ({fmtC(CONFIG_DEFAULT.empaquePorPizza)} por pizza)
                </label>
              )}

              {/*
                Jerarquía: antes eran siete botones del mismo tamaño y el de
                cobrar quedaba perdido entre ellos. En una caja con fila
                esperando, la acción principal tiene que ser una sola y obvia;
                lo demás se busca cuando hace falta.
              */}
              <div className="mt-3 space-y-2">
                {/* En teléfono este botón vive clavado al pie de la hoja: aquí
                    quedaba bajo el pliegue en cuanto había tres ítems. */}
                <button className="btn btn-acc hidden w-full !py-4 text-base lg:flex"
                        disabled={guardando} onClick={cobrar}>
                  {guardando ? "Guardando…" : `Cobrar ${fmtC(t.total)} e imprimir`}
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button className="btn btn-ok" disabled={guardando}
                          onClick={guardarSinCobrar}>
                    Guardar sin cobrar
                  </button>
                  <button className="btn btn-ghost" disabled={guardando}
                          onClick={imprimirPrecuenta}>
                    Pre-cuenta
                  </button>
                </div>

                <button className="btn btn-ghost w-full !min-h-0 !py-2 text-sm"
                        onClick={() => setVerMas((v) => !v)}>
                  {verMas ? "Menos opciones" : "Más opciones"}
                </button>

                {verMas && (
                  <div className="grid grid-cols-2 gap-2">
                    <button className="btn btn-ghost !min-h-0 !py-2 text-sm"
                            onClick={() => setVerPreview((v) => !v)}>
                      {verPreview ? "Ocultar ticket" : "Ver ticket"}
                    </button>
                    {/* Respaldo del spec: si el puente está caído, igual se
                        entrega algo. Funciona en cualquier navegador, iPhone
                        incluido. */}
                    <button className="btn btn-ghost !min-h-0 !py-2 text-sm"
                            onClick={() => imprimirHtml(datosTicket())}>
                      Imprimir en navegador
                    </button>
                    <button className="btn btn-ghost !min-h-0 !py-2 text-sm"
                            onClick={() => descargarHtml(datosTicket())}>
                      Descargar recibo
                    </button>
                    {/* Con confirmación: un toque borraba un pedido entero. */}
                    <button className="btn btn-mal !min-h-0 !py-2 text-sm"
                            onClick={() => setConfirmaCancelar(true)}>
                      Cancelar orden
                    </button>
                  </div>
                )}

                {menuDesdeCache && (
                  <p className="text-center text-xs" style={{ color: "var(--acc-2)" }}>
                    Menú desde la copia local. Sin conexión solo se puede guardar.
                  </p>
                )}
              </div>
            </div>
          )}

          {verPreview && (
            <pre className="panel mono overflow-x-auto p-3 text-[11px] leading-snug"
                 style={{ color: "var(--txt-2)" }}>{previsualizacion}</pre>
          )}

          {aviso && (
            <div className="panel p-3 text-sm"
                 style={{ color: aviso.mal ? "var(--mal)" : "var(--ok)" }}>
              {aviso.txt}
            </div>
          )}
    </>
  );

  // Sin base no se dibuja la caja. Antes se dibujaba igual, con un menú
  // empaquetado, y se veía normal: alguien podía tomar un pedido entero que
  // no iba a quedar en ninguna parte. Una caja a medias es peor que ninguna.
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
            <Link className="btn btn-acc text-center" href="/configuracion">
              Ver qué falta
            </Link>
            <Link className="btn btn-ghost text-center" href="/prueba">
              Probar la impresora
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-3 p-3 pb-28 lg:grid-cols-[1fr_400px] lg:pb-3">
      {/* ---------------------------------------------------------- menú -- */}
      {/* min-w-0: sin esto la fila de categorías que se desliza ensancha la
          columna del grid (los hijos traen min-width:auto) y la página
          entera termina con scroll horizontal. */}
      <section className="panel min-w-0 p-3">
        {/*
          Una sola fila que se desliza, no cinco que se apilan. Con doce
          categorías envueltas, en un teléfono había que bajar media pantalla
          antes de ver el primer producto, y eso es lo que se toca todo el
          tiempo. Las pizzas van primero porque son la mayoría de los pedidos.
        */}
        <div className="-mx-3 mb-3 flex gap-1.5 overflow-x-auto px-3 pb-1"
             style={{ scrollbarWidth: "none" }}>
          {categorias.map((c) => (
            <button key={c} onClick={() => setCat(c)}
                    className={`chip shrink-0 ${cat === c ? "chip-on" : ""}`}>{c}</button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {/*
            La mitad y mitad es UNA OPCION MAS para agregar, no un cartel fijo
            arriba de todo: antes ocupaba lugar incluso mirando las cervezas.
            Aparece como primera tarjeta cuando la categoria abierta es de
            pizzas, que es el unico momento en que alguien la busca.
          */}
          {catEsDePizzas && (
            <button onClick={() => setEditaMitades("")}
                    className="rounded-lg p-3 text-left transition active:scale-[0.97]"
                    style={{ background: "var(--panel-2)",
                             border: "1px dashed var(--acc)" }}>
              <svg viewBox="0 0 100 100" className="h-7 w-7" aria-hidden="true">
                <circle cx="50" cy="50" r="46" fill="none"
                        stroke="var(--borde)" strokeWidth="6" />
                <path d="M50 4 A46 46 0 0 0 50 96 Z" fill="var(--acc)" />
                <path d="M50 4 A46 46 0 0 1 50 96 Z" fill="var(--mitad-b)" />
              </svg>
              <div className="mt-1 text-sm font-semibold leading-tight"
                   style={{ color: "var(--acc)" }}>
                Mitad y mitad
              </div>
              <div className="mt-0.5 text-[11px] leading-snug"
                   style={{ color: "var(--txt-2)" }}>
                Elige dos pizzas
              </div>
            </button>
          )}
          {menu.filter((p) => p.categoria === cat).map((p) => {
            // Cuántas van ya de este producto. Sin esto había que abrir el
            // pedido para saberlo, y con prisa se tocaba de más.
            const yaVan = lineas
              .filter((l) => l.productoId === p.id)
              .reduce((n, l) => n + l.cantidad, 0);
            return (
              <button key={p.id} onClick={() => agregar(p)}
                      className="relative flex flex-col rounded-xl p-3 text-left transition"
                      style={{
                        background: "var(--panel-2)",
                        border: `1px solid ${yaVan ? "var(--acc)" : "var(--borde)"}`,
                        transitionDuration: "120ms",
                      }}>
                {yaVan > 0 && (
                  <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center
                                   justify-center rounded-full px-1.5 text-xs font-black"
                        style={{ background: "var(--acc)", color: "var(--sobre-acc)" }}
                        aria-label={`${yaVan} en el pedido`}>
                    {yaVan}
                  </span>
                )}
                <div className="pr-7 text-sm font-semibold leading-tight">{p.nombre}</div>
                {p.descripcion && (
                  <div className="mt-1 line-clamp-2 text-[11px] leading-snug"
                       style={{ color: "var(--txt-3)" }}>{p.descripcion}</div>
                )}
                <div className="mono mt-auto pt-2 text-sm font-bold"
                     style={{ color: "var(--acc)" }}>
                  {fmtC(p.precio)}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* -------------------------------------------------------- pedido -- */}
      {/* --------------------------------------------- datos de la orden -- */}
      {/* Fuera de la hoja a propósito: el tipo se elige ANTES de agregar
          nada, y la hoja solo se abre cuando ya hay algo en el pedido. */}
      <section className="min-w-0 lg:hidden">
        <div className="panel p-3">
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            {TIPOS_ORDEN.map((x) => (
              <button key={x.valor} onClick={() => setTipo(x.valor)}
                      className={`chip text-center ${tipo === x.valor ? "chip-on" : ""}`}>
                {x.etiqueta}
              </button>
            ))}
          </div>

          <div className="grid gap-2">
            {tipo === "mesa" && (
              <input className="input" placeholder="Mesa #" value={mesa}
                     onChange={(e) => setMesa(e.target.value)} />
            )}
            {(tipo === "delivery" || tipo === "retiro" || tipo === "para_llevar") && (
              <input className="input" placeholder="Cliente" value={cliente}
                     onChange={(e) => setCliente(e.target.value)} />
            )}
            {tipo === "delivery" && (
              <>
                <input className="input" placeholder="Teléfono" inputMode="tel"
                       value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                <input className="input" placeholder="Dirección" value={direccion}
                       onChange={(e) => setDireccion(e.target.value)} />
                <input className="input" placeholder="Costo de envío (C$)" inputMode="decimal"
                       value={envio} onChange={(e) => setEnvio(e.target.value)} />
              </>
            )}
            <input className="input" placeholder="Atendió (nombre)" value={atendio}
                   onChange={(e) => setAtendio(e.target.value)} />
          </div>
        </div>

      </section>

      {/* -------------------------------------------------------- pedido -- */}
      <section className="hidden min-w-0 space-y-3 lg:block">
        <div className="panel p-3">
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            {TIPOS_ORDEN.map((x) => (
              <button key={x.valor} onClick={() => setTipo(x.valor)}
                      className={`chip text-center ${tipo === x.valor ? "chip-on" : ""}`}>
                {x.etiqueta}
              </button>
            ))}
          </div>

          <div className="grid gap-2">
            {tipo === "mesa" && (
              <input className="input" placeholder="Mesa #" value={mesa}
                     onChange={(e) => setMesa(e.target.value)} />
            )}
            {(tipo === "delivery" || tipo === "retiro" || tipo === "para_llevar") && (
              <input className="input" placeholder="Cliente" value={cliente}
                     onChange={(e) => setCliente(e.target.value)} />
            )}
            {tipo === "delivery" && (
              <>
                <input className="input" placeholder="Teléfono" inputMode="tel"
                       value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                <input className="input" placeholder="Dirección" value={direccion}
                       onChange={(e) => setDireccion(e.target.value)} />
                <input className="input" placeholder="Costo de envío (C$)" inputMode="decimal"
                       value={envio} onChange={(e) => setEnvio(e.target.value)} />
              </>
            )}
            <input className="input" placeholder="Atendió (nombre)" value={atendio}
                   onChange={(e) => setAtendio(e.target.value)} />
          </div>
        </div>

        {pedido}
      </section>

      {/* En teléfono, el pedido no está a la vista: esta barra dice siempre
          cuánto llevas y lo abre con el pulgar. */}
      <BarraPedido items={totalItems} total={t.total}
                   onAbrir={() => setHojaAbierta(true)} />
      <HojaPedido
        abierta={hojaAbierta} onCerrar={() => setHojaAbierta(false)}
        pie={
          <>
            <div className="mono mb-2 flex items-baseline justify-between">
              <span className="text-sm font-bold uppercase tracking-wide"
                    style={{ color: "var(--txt-2)" }}>Total</span>
              <span className="text-2xl font-black">{fmtC(t.total)}</span>
            </div>
            <button className="btn btn-acc w-full !py-4 text-base"
                    disabled={guardando} onClick={cobrar}>
              {guardando ? "Guardando…" : "Cobrar e imprimir"}
            </button>
          </>
        }
      >
        <div className="space-y-3">{pedido}</div>
      </HojaPedido>

      {/* Cancelar borra un pedido que puede llevar diez líneas cargadas a
          mano. Un toque accidental no debería poder hacerlo. */}
      {confirmaCancelar && (
        <div role="dialog" aria-modal="true"
             className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: "rgba(0,0,0,.65)" }}
             onClick={() => setConfirmaCancelar(false)}>
          <div className="panel w-full max-w-sm space-y-3 p-4"
               onClick={(e) => e.stopPropagation()}>
            <b>¿Cancelar la orden?</b>
            <p className="text-sm" style={{ color: "var(--txt-2)" }}>
              {lineas.length === 1
                ? `Se borra 1 línea por ${fmtC(t.total)}.`
                : `Se borran ${lineas.length} líneas por ${fmtC(t.total)}.`}{" "}
              No se puede deshacer.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn btn-ghost"
                      onClick={() => setConfirmaCancelar(false)}>
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

      {/* El selector de mitades. Estaba escrito pero nunca se montaba, así
          que el botón no abría nada. */}
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

function Fila({ k, v, acc }: { k: string; v: string; acc?: boolean }) {
  return (
    <div className="flex justify-between" style={acc ? { color: "var(--acc-2)" } : undefined}>
      <dt>{k}</dt><dd>{v}</dd>
    </div>
  );
}
