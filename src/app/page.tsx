"use client";

import { useEffect, useMemo, useState } from "react";
import PanelDescuentos from "@/components/PanelDescuentos";
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
import menuDemo from "@/lib/menu-demo.json";
import {
  CONFIG_DEFAULT, METODOS_PAGO, TIPOS_ORDEN,
  type ConfigCobro, type Descuento, type LineaOrden,
  nombreMitades,
  type MetodoPago, type MitadPizza, type Producto, type TipoOrden,
} from "@/lib/types";

export default function Caja() {
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

  const [turno, setTurno] = useState<{ id: string } | null>(null);
  const [verPreview, setVerPreview] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ txt: string; mal?: boolean } | null>(null);

  const [menuDesdeCache, setMenuDesdeCache] = useState(false);
  const [abrirMitades, setAbrirMitades] = useState(false);

  useEffect(() => {
    if (!hayConfig) {
      // Modo demo: sin base configurada la app igual se puede recorrer con el
      // menú real empaquetado. No guarda nada, pero deja probar el flujo
      // completo y la vista previa del recibo desde el teléfono.
      setMenu(menuDemo as Producto[]);
      setCat((menuDemo as Producto[])[0]?.categoria ?? "");
      return;
    }
    // Con respaldo local: si no hay internet se usa la copia guardada, para
    // poder seguir tomando órdenes.
    cargarMenuConRespaldo(cargarMenu, guardarMenuLocal)
      .then(({ productos, desdeCache }) => {
        setMenu(productos);
        setCat(productos[0]?.categoria ?? "");
        setMenuDesdeCache(desdeCache);
        if (desdeCache && productos.length === 0) {
          setAviso({ txt: "No hay menú guardado en este dispositivo. Conectate una vez para descargarlo.", mal: true });
        }
      })
      .catch((e) => setAviso({ txt: `No se pudo cargar el menú: ${e.message}`, mal: true }));
    turnoAbierto().then((t) => setTurno(t)).catch(() => {});
  }, []);

  const categorias = useMemo(
    () => [...new Set(menu.map((p) => p.categoria))],
    [menu]
  );

  // Solo las pizzas pueden partirse: una mitad de cerveza no existe.
  const pizzas = useMemo(
    () => menu.filter((p) => p.grupo_descuento === "pizza"),
    [menu]
  );

  const agregarMitades = (a: MitadPizza, b: MitadPizza, precio: number) => {
    setLineas((prev) => [...prev, {
      id: crypto.randomUUID(),
      // Sin producto del catálogo: es una combinación, no un ítem del menú.
      productoId: "",
      nombre: nombreMitades(a, b),
      precioUnit: precio,
      cantidad: 1,
      grupo: "pizza",
      aplicaIva: true,
      mitades: [a, b],
    }]);
    setAbrirMitades(false);
  };

  const config: ConfigCobro = {
    ...CONFIG_DEFAULT,
    cobrarPropina,
    propinaBps: Math.round(propinaPct * 100),
    costoEnvio: centavos(parseFloat(envio || "0") || 0),
  };

  const t = useMemo(
    () => calcularTotales(lineas, descuentos, config),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lineas, descuentos, cobrarPropina, propinaPct, envio]
  );

  const agregar = (p: Producto) => {
    setLineas((prev) => {
      const i = prev.findIndex((l) => l.productoId === p.id && !l.notas);
      if (i >= 0) {
        const c = [...prev];
        c[i] = { ...c[i], cantidad: c[i].cantidad + 1 };
        return c;
      }
      return [...prev, {
        id: crypto.randomUUID(), productoId: p.id, nombre: p.nombre,
        precioUnit: p.precio, cantidad: 1, grupo: p.grupo_descuento,
        aplicaIva: p.aplica_iva !== false,
      }];
    });
  };

  const cambiarCantidad = (id: string, delta: number) =>
    setLineas((prev) =>
      prev.flatMap((l) => {
        if (l.id !== id) return [l];
        const n = l.cantidad + delta;
        return n <= 0 ? [] : [{ ...l, cantidad: n }];
      })
    );

  const setNotaLinea = (id: string, notas: string) =>
    setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, notas } : l)));

  const limpiar = () => {
    setLineas([]); setDescuentos([]); setMotivoDesc("");
    setMesa(""); setCliente(""); setTelefono(""); setDireccion("");
    setNotas(""); setEnvio(""); setRecibido(""); setCobrarPropina(false);
  };

  const recibidoCent = centavos(parseFloat(recibido || "0") || 0);
  const cambio = recibidoCent > 0 ? recibidoCent - t.total : 0;

  const cobrar = async () => {
    if (lineas.length === 0) return;
    if (!hayConfig) {
      setAviso({ txt: "Modo demo: no hay dónde guardar la orden.", mal: true });
      return;
    }
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
          txt: "Sin conexión no se puede cobrar. Podés seguir tomando órdenes: se suben solas al volver la señal.",
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
    if (!hayConfig) {
      setAviso({ txt: "Modo demo: no hay dónde guardar la orden.", mal: true });
      return;
    }
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
    if (!hayConfig) {
      setAviso({ txt: "Modo demo: usá \"Imprimir en navegador\" para ver el ticket.", mal: true });
      return;
    }
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

  return (
    <div className="mx-auto grid max-w-7xl gap-3 p-3 lg:grid-cols-[1fr_400px]">
      {!hayConfig && (
        <div className="panel p-3 text-sm lg:col-span-2"
             style={{ borderColor: "var(--acc)" }}>
          <b style={{ color: "var(--acc)" }}>Modo demo.</b>{" "}
          <span style={{ color: "var(--txt-2)" }}>
            Sin base de datos configurada. Podés armar órdenes y ver el recibo,
            pero nada se guarda ni se imprime. Para probar la impresora andá a{" "}
            <b>Probar</b>; para usarlo de verdad, configurá Supabase (ver README).
          </span>
        </div>
      )}
      {/* ---------------------------------------------------------- menú -- */}
      <section className="panel p-3">
        {pizzas.length > 0 && (
          <button onClick={() => setAbrirMitades(true)}
                  className="mb-3 flex w-full items-center gap-3 rounded-lg p-3 text-left
                             transition active:scale-[0.99]"
                  style={{ background: "var(--panel-2)", border: "1px dashed var(--acc)" }}>
            <svg viewBox="0 0 100 100" className="h-9 w-9 shrink-0" aria-hidden="true">
              <circle cx="50" cy="50" r="46" fill="none"
                      stroke="var(--borde)" strokeWidth="6" />
              <path d="M50 4 A46 46 0 0 0 50 96 Z" fill="var(--acc)" />
              <path d="M50 4 A46 46 0 0 1 50 96 Z" fill="var(--acc-2)" opacity=".5" />
            </svg>
            <span>
              <b style={{ color: "var(--acc)" }}>Pizza mitad y mitad</b>
              <span className="block text-xs" style={{ color: "var(--txt-2)" }}>
                Se suman las dos y se divide entre 2
              </span>
            </span>
          </button>
        )}

        <div className="mb-3 flex flex-wrap gap-1.5">
          {categorias.map((c) => (
            <button key={c} onClick={() => setCat(c)}
                    className={`chip ${cat === c ? "chip-on" : ""}`}>{c}</button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {menu.filter((p) => p.categoria === cat).map((p) => (
            <button key={p.id} onClick={() => agregar(p)}
                    className="rounded-lg p-3 text-left transition active:scale-[0.97]"
                    style={{ background: "var(--panel-2)", border: "1px solid var(--borde)" }}>
              <div className="text-sm font-semibold leading-tight">{p.nombre}</div>
              {p.descripcion && (
                <div className="mt-1 line-clamp-2 text-[11px] leading-snug"
                     style={{ color: "var(--txt-2)" }}>{p.descripcion}</div>
              )}
              <div className="mono mt-2 text-sm font-bold" style={{ color: "var(--acc)" }}>
                {fmtC(p.precio)}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- pedido -- */}
      <section className="space-y-3">
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
                    <div className="mt-1 flex flex-col gap-0.5 pl-24 text-xs"
                         style={{ color: "var(--txt-2)" }}>
                      {l.mitades.map((mit, k) => (
                        <span key={k}>
                          <b style={{ color: k === 0 ? "var(--acc)" : "var(--acc-2)" }}>½</b>{" "}
                          {mit.nombre}
                        </span>
                      ))}
                    </div>
                  )}
                  {l.descTotal > 0 && (
                    <div className="mono mt-1 pl-24 text-right text-xs" style={{ color: "var(--acc-2)" }}>
                      desc. -{fmtC(l.descTotal)} → {fmtC(l.neto)}
                    </div>
                  )}
                  <input className="input mt-2 !min-h-0 !py-1 !text-xs"
                         placeholder="Nota (sin cebolla, bien cocida...)"
                         value={l.notas ?? ""}
                         onChange={(e) => setNotaLinea(l.id, e.target.value)} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* descuentos */}
        {lineas.length > 0 && (
          <div className="panel p-3">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide"
                style={{ color: "var(--txt-2)" }}>Descuentos</h3>
            <PanelDescuentos
              descuentos={descuentos} setDescuentos={setDescuentos}
              aplicados={{ general: t.descGeneral, pizza: t.descPizzas, bebida: t.descBebidas }}
            />
            {t.descTotal > 0 && (
              <input className="input mt-2" placeholder="Motivo del descuento (queda en el cierre)"
                     value={motivoDesc} onChange={(e) => setMotivoDesc(e.target.value)} />
            )}
          </div>
        )}

        {/* propina */}
        {lineas.length > 0 && (
          <div className="panel flex items-center gap-3 p-3">
            <button onClick={() => setCobrarPropina((v) => !v)}
                    className={`chip ${cobrarPropina ? "chip-on" : ""}`}>
              {cobrarPropina ? "Propina ON" : "Propina OFF"}
            </button>
            {cobrarPropina && (
              <>
                <div className="flex gap-1">
                  {[10, 15].map((p) => (
                    <button key={p} onClick={() => setPropinaPct(p)}
                            className={`chip ${propinaPct === p ? "chip-on" : ""}`}>{p}%</button>
                  ))}
                </div>
                <input className="input !w-20" inputMode="decimal" value={propinaPct}
                       onChange={(e) => setPropinaPct(parseFloat(e.target.value) || 0)} />
                <span className="mono ml-auto text-sm font-bold">{fmtC(t.propina)}</span>
              </>
            )}
          </div>
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

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="btn btn-ghost" onClick={() => setVerPreview((v) => !v)}>
                {verPreview ? "Ocultar" : "Ver ticket"}
              </button>
              <button className="btn btn-acc" disabled={guardando} onClick={cobrar}>
                {guardando ? "Guardando..." : "Cobrar e imprimir"}
              </button>
              <button className="btn btn-ok col-span-2" disabled={guardando}
                      onClick={guardarSinCobrar}>
                Guardar orden {menuDesdeCache ? "(sin conexión)" : ""}
              </button>
              <button className="btn btn-ghost col-span-2" disabled={guardando}
                      onClick={imprimirPrecuenta}>Imprimir pre-cuenta</button>
              {/* Respaldo del spec: si el puente está caído, igual se entrega
                  algo. Funciona en cualquier navegador, iPhone incluido. */}
              <button className="btn btn-ghost !min-h-0 !py-2 text-sm"
                      onClick={() => imprimirHtml(datosTicket())}>
                Imprimir en navegador
              </button>
              <button className="btn btn-ghost !min-h-0 !py-2 text-sm"
                      onClick={() => descargarHtml(datosTicket())}>
                Descargar recibo
              </button>
              <button className="btn btn-ghost col-span-2 !min-h-0 !py-2 text-sm"
                      onClick={limpiar}>Cancelar orden</button>
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
      </section>
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
