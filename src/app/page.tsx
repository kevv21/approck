"use client";

import { useEffect, useMemo, useState } from "react";
import PanelDescuentos from "@/components/PanelDescuentos";
import { centavos, fmtC } from "@/lib/money";
import { calcularTotales } from "@/lib/pricing";
import { cargarMenu, encolar, guardarYEncolar, turnoAbierto } from "@/lib/repo";
import { previsualizarTicket } from "@/lib/ticket";
import { hayConfig } from "@/lib/supabase";
import {
  CONFIG_DEFAULT, METODOS_PAGO, TIPOS_ORDEN,
  type ConfigCobro, type Descuento, type LineaOrden,
  type MetodoPago, type Producto, type TipoOrden,
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

  useEffect(() => {
    if (!hayConfig) return;
    cargarMenu()
      .then((m) => { setMenu(m); setCat(m[0]?.categoria ?? ""); })
      .catch((e) => setAviso({ txt: `No se pudo cargar el menú: ${e.message}`, mal: true }));
    turnoAbierto().then((t) => setTurno(t)).catch(() => {});
  }, []);

  const categorias = useMemo(
    () => [...new Set(menu.map((p) => p.categoria))],
    [menu]
  );

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
    if (metodoPago === "efectivo" && recibidoCent > 0 && cambio < 0) {
      setAviso({ txt: "El monto recibido es menor que el total.", mal: true });
      return;
    }
    setGuardando(true);
    setAviso(null);
    try {
      const { orden } = await guardarYEncolar({
        lineas, descuentos, config, tipo,
        mesa, cliente, telefonoCliente: telefono, direccion, notas, atendio,
        metodoPago, recibido: recibidoCent > 0 ? recibidoCent : undefined,
        motivoDescuento: motivoDesc, turnoId: turno?.id ?? null, imprimirCocina,
      });
      setAviso({ txt: `Orden #${orden.numero} cobrada y enviada a la estación de impresión.` });
      limpiar();
    } catch (e) {
      setAviso({ txt: `Error al guardar: ${(e as Error).message}`, mal: true });
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

  const previsualizacion = previsualizarTicket({
    numero: 0, tipo, mesa, cliente, telefonoCliente: telefono, direccion, notas,
    metodoPago, recibido: recibidoCent, mesero: atendio,
    fecha: new Date(), totales: t,
  });

  if (!hayConfig) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="panel p-5">
          <h2 className="mb-2 text-lg font-bold">Falta configurar Supabase</h2>
          <p className="text-sm" style={{ color: "var(--txt-2)" }}>
            Copia <code className="mono">.env.example</code> a{" "}
            <code className="mono">.env.local</code> y pon la URL y la anon key
            de tu proyecto. Los pasos completos están en el README.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-3 p-3 lg:grid-cols-[1fr_400px]">
      {/* ---------------------------------------------------------- menú -- */}
      <section className="panel p-3">
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
              <button className="btn btn-ghost col-span-2" disabled={guardando}
                      onClick={imprimirPrecuenta}>Imprimir pre-cuenta</button>
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
