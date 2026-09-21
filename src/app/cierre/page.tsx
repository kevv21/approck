"use client";

import { useCallback, useEffect, useState } from "react";
import { descargarBlob, generarCierreExcel, nombreArchivoCierre, type FilaOrden } from "@/lib/excel";
import { fmtC, centavos, aCordobas } from "@/lib/money";
import { abrirTurno, anularOrden, cerrarTurno, reimprimir, turnoAbierto, turnoDeRango } from "@/lib/repo";
import { listarAuditoria, type FilaAuditoria } from "@/lib/auth/auditoria";
import { hayConfig, supabase } from "@/lib/supabase";
import { hayInternet } from "@/lib/offline/conexion";
import { METODOS_PAGO, TIPOS_ORDEN } from "@/lib/types";

const hoyISO = () => new Date().toISOString().slice(0, 10);

interface Turno {
  id: string; numero: number | null; abierto_por: string; abierto_at: string;
  fondo_inicial: number; efectivo_contado: number | null;
  cerrado_at?: string | null;
  ventas_pedidosya?: number | null;
}

export default function Cierre() {
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [ordenes, setOrdenes] = useState<FilaOrden[]>([]);
  const [turno, setTurno] = useState<Turno | null>(null);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const [quien, setQuien] = useState("");
  const [bitacora, setBitacora] = useState<FilaAuditoria[]>([]);
  const [verBitacora, setVerBitacora] = useState(false);
  const [fondo, setFondo] = useState("");
  const [contado, setContado] = useState("");
  const [pedidosYa, setPedidosYa] = useState("");

  const rango = useCallback(() => {
    const d = new Date(`${desde}T00:00:00`);
    const h = new Date(`${hasta}T23:59:59.999`);
    return { d, h };
  }, [desde, hasta]);

  const buscar = useCallback(async () => {
    if (!hayConfig) return;
    setCargando(true);
    setAviso(null);
    try {
      const { d, h } = rango();
      const { data, error } = await supabase
        .from("orden")
        .select("*, orden_item(*)")
        .gte("created_at", d.toISOString())
        .lte("created_at", h.toISOString())
        .order("numero");
      if (error) throw error;
      setOrdenes(
        (data ?? []).map((o: Record<string, unknown>) => ({
          ...o, items: o.orden_item,
        })) as unknown as FilaOrden[]
      );
    } catch (e) {
      setAviso(`Error: ${(e as Error).message}`);
    } finally {
      setCargando(false);
    }
  }, [rango]);

  // El turno abierto si lo hay; si no, el ultimo del rango consultado, para
  // que re-descargar el Excel de un dia cerrado no pierda ni el bloque de
  // turno ni la cifra de PedidosYa que se anoto ese dia.
  useEffect(() => {
    buscar();
    const { d, h } = rango();
    (async () => {
      const t = (await turnoAbierto())
        ?? (await turnoDeRango(d.toISOString(), h.toISOString()));
      setTurno(t as Turno | null);
      const py = (t as Turno | null)?.ventas_pedidosya ?? 0;
      setPedidosYa(py > 0 ? String(aCordobas(py)) : "");
    })().catch(() => {});
  }, [buscar, rango]);

  // `turno` puede ser uno ya cerrado (el del rango consultado): solo el
  // abierto admite contar efectivo y cerrar.
  const turnoAbiertoAhora = turno != null && !turno.cerrado_at;

  const pagadas = ordenes.filter((o) => o.estado === "pagada");
  const sumar = (f: (o: FilaOrden) => number) => pagadas.reduce((a, o) => a + f(o), 0);

  const exportar = async () => {
    const { d, h } = rango();
    const blob = await generarCierreExcel({
      desde: d, hasta: h, ordenes,
      turno: turno ? { ...turno, ventas_pedidosya: centavos(parseFloat(pedidosYa || "0") || 0) } : null,
    });
    descargarBlob(blob, nombreArchivoCierre(new Date(), turno?.numero));
  };

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-3">
      {/* turno */}
      <div className="panel p-4">
        <h2 className="mb-2 font-bold">Turno de caja</h2>
        {turnoAbiertoAhora ? (
          <div className="space-y-2">
            <p className="text-sm" style={{ color: "var(--txt-2)" }}>
              Abierto por <b>{turno!.abierto_por}</b> el{" "}
              {new Date(turno!.abierto_at).toLocaleString("es-NI", { hour12: false })} ·
              fondo {fmtC(turno!.fondo_inicial)}
            </p>
            <div className="flex flex-wrap gap-2">
              <input className="input !w-auto flex-1" inputMode="decimal"
                     placeholder="Efectivo contado C$" value={contado}
                     onChange={(e) => setContado(e.target.value)} />
              <button className="btn btn-mal" onClick={async () => {
                // El spec exige conexión para cerrar caja: un arqueo calculado
                // contra datos que quizá no subieron no sirve para nada.
                if (!(await hayInternet())) {
                  setAviso("Sin conexión no se puede cerrar la caja. El arqueo tiene que calcularse contra las órdenes ya subidas.");
                  return;
                }
                const py = centavos(parseFloat(pedidosYa || "0") || 0);
                await cerrarTurno(
                  turno!.id,
                  centavos(parseFloat(contado || "0") || 0),
                  undefined,
                  py,
                );
                // No se borra el turno: el Excel del dia lo sigue necesitando
                // para el bloque de arqueo y para PedidosYa.
                setTurno((t) => t && {
                  ...t,
                  cerrado_at: new Date().toISOString(),
                  ventas_pedidosya: py,
                });
                setContado("");
                setAviso("Turno cerrado.");
                buscar();
              }}>Cerrar turno</button>
            </div>
            <p className="text-xs" style={{ color: "var(--txt-2)" }}>
              La venta de PedidosYa se anota abajo, junto a las formas de pago:
              se guarda con el cierre.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {turno && (
              <p className="text-sm" style={{ color: "var(--txt-2)" }}>
                Turno <b>{turno.numero ?? "—"}</b> cerrado. El Excel de este
                rango sale con su arqueo.
              </p>
            )}
          <div className="flex flex-wrap gap-2">
            <input className="input !w-auto flex-1" placeholder="Quién abre"
                   value={quien} onChange={(e) => setQuien(e.target.value)} />
            <input className="input !w-auto flex-1" inputMode="decimal"
                   placeholder="Fondo inicial C$" value={fondo}
                   onChange={(e) => setFondo(e.target.value)} />
            <button className="btn btn-ok" disabled={!quien} onClick={async () => {
              const t = await abrirTurno(quien, centavos(parseFloat(fondo || "0") || 0));
              setTurno(t as Turno); setPedidosYa(""); setAviso("Turno abierto.");
            }}>Abrir turno</button>
          </div>
          </div>
        )}
      </div>

      {/* rango */}
      <div className="panel flex flex-wrap items-end gap-2 p-4">
        <label className="flex-1">
          <span className="mb-1 block text-xs" style={{ color: "var(--txt-2)" }}>Desde</span>
          <input type="date" className="input" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-xs" style={{ color: "var(--txt-2)" }}>Hasta</span>
          <input type="date" className="input" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <button className="btn btn-ghost" onClick={buscar} disabled={cargando}>
          {cargando ? "Buscando..." : "Buscar"}
        </button>
        <button className="btn btn-acc" onClick={exportar} disabled={ordenes.length === 0}>
          Descargar Excel
        </button>
      </div>

      {aviso && <div className="panel p-3 text-sm">{aviso}</div>}

      {/* resumen */}
      <div className="panel grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <Kpi k="Órdenes" v={String(pagadas.length)} />
        <Kpi k="IVA 15%" v={fmtC(sumar((o) => o.iva))} />
        <Kpi k="Descuentos" v={fmtC(sumar((o) => o.desc_total))} />
        <Kpi k="Propinas" v={fmtC(sumar((o) => o.propina))} />
      </div>

      {/* Por forma de pago. PedidosYa va aparte: esa plata no entra a la
          caja el mismo día. */}
      <div className="panel grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        {METODOS_PAGO.map((m) => {
          const del = pagadas.filter((o) => o.metodo_pago === m.valor);
          return (
            <Kpi key={m.valor} k={`${m.etiqueta} (${del.length})`}
                 v={fmtC(del.reduce((a, o) => a + o.total, 0))}
                 acc={m.valor === "efectivo"} />
          );
        })}
        {/*
          Editable aquí y no solo al cerrar el turno: esta cifra la reporta la
          plataforma, llega cuando llega, y hay que poder anotarla mientras se
          revisa el día o al re-descargar un Excel de una fecha pasada. Antes
          solo se podía escribir dentro del bloque de cerrar caja, así que un
          cierre ya hecho se quedaba sin ella para siempre.
        */}
        <div>
          <label className="text-xs" htmlFor="pedidosya"
                 style={{ color: "var(--txt-2)" }}>
            PedidosYa (aparte) C$
          </label>
          <input id="pedidosya" className="input mono !min-h-10 !px-2 !text-lg font-bold"
                 inputMode="decimal" placeholder="0.00"
                 value={pedidosYa} onChange={(e) => setPedidosYa(e.target.value)} />
          {turno && !turnoAbiertoAhora && (
            <p className="mt-1 text-[11px]" style={{ color: "var(--txt-2)" }}>
              Turno cerrado: el cambio sale en el Excel que descargues ahora,
              pero ya no se guarda en la base.
            </p>
          )}
        </div>
      </div>

      <div className="panel grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        {TIPOS_ORDEN.map((t) => {
          const del = pagadas.filter((o) => o.tipo === t.valor);
          return (
            <Kpi key={t.valor} k={`${t.etiqueta} (${del.length})`}
                 v={fmtC(del.reduce((a, o) => a + o.total, 0))} />
          );
        })}
      </div>

      {/* bitácora */}
      <div className="panel p-4">
        <button className="flex w-full items-center justify-between text-sm font-bold uppercase tracking-wide"
                style={{ color: "var(--txt-2)" }}
                onClick={async () => {
                  const v = !verBitacora;
                  setVerBitacora(v);
                  if (v) {
                    const { d, h } = rango();
                    try { setBitacora(await listarAuditoria(d.toISOString(), h.toISOString())); }
                    catch { /* noop */ }
                  }
                }}>
          <span>Bitácora del período</span>
          <span>{verBitacora ? "−" : "+"}</span>
        </button>
        {verBitacora && (
          bitacora.length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: "var(--txt-2)" }}>
              Sin movimientos registrados.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {bitacora.map((b) => (
                <li key={b.id} className="flex flex-wrap gap-2 rounded px-2 py-1"
                    style={{ background: "var(--panel-2)" }}>
                  <span className="mono text-xs" style={{ color: "var(--txt-2)" }}>
                    {new Date(b.created_at).toLocaleString("es-NI", { hour12: false })}
                  </span>
                  <b>{b.accion}</b>
                  <span>{b.usuario}</span>
                  {b.motivo && <span style={{ color: "var(--txt-2)" }}>· {b.motivo}</span>}
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      {/* listado */}
      <div className="panel overflow-x-auto p-1">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--txt-2)" }}>
              {["#", "Hora", "Tipo", "Cliente/Mesa", "Desc.", "Total", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenes.map((o) => (
              <tr key={o.numero} style={{ borderTop: "1px solid var(--borde)" }}>
                <td className="mono px-3 py-2">{o.numero}</td>
                <td className="mono px-3 py-2 whitespace-nowrap">
                  {new Date(o.created_at).toLocaleTimeString("es-NI", { hour12: false })}
                </td>
                <td className="px-3 py-2">
                  {TIPOS_ORDEN.find((t) => t.valor === o.tipo)?.etiqueta}
                </td>
                <td className="px-3 py-2">{o.cliente ?? o.mesa ?? "—"}</td>
                <td className="mono px-3 py-2" style={{ color: "var(--acc-2)" }}>
                  {o.desc_total > 0 ? `-${fmtC(o.desc_total)}` : ""}
                </td>
                <td className="mono px-3 py-2 font-bold">{fmtC(o.total)}</td>
                <td className="flex gap-1 px-3 py-2">
                  <button className="chip"
                          onClick={() => reimprimir((o as unknown as { id: string }).id)}>
                    Reimprimir
                  </button>
                  {o.estado === "pagada" && (
                    <button className="chip" style={{ color: "var(--mal)" }}
                            onClick={async () => {
                              // Motivo obligatorio: una anulación sin motivo es
                              // el agujero por donde se va la plata.
                              const motivo = prompt(`Motivo de la anulación de la orden #${o.numero}:`);
                              if (!motivo?.trim()) return;
                              try {
                                await anularOrden((o as unknown as { id: string }).id, motivo);
                                setAviso(`Orden #${o.numero} anulada.`);
                                buscar();
                              } catch (e) {
                                setAviso(`Error: ${(e as Error).message}`);
                              }
                            }}>
                      Anular
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {ordenes.length === 0 && !cargando && (
          <p className="p-6 text-center text-sm" style={{ color: "var(--txt-2)" }}>
            No hay órdenes en este rango.
          </p>
        )}
      </div>
    </div>
  );
}

function Kpi({ k, v, acc }: { k: string; v: string; acc?: boolean }) {
  return (
    <div>
      <div className="text-xs" style={{ color: "var(--txt-2)" }}>{k}</div>
      <div className="mono text-lg font-bold" style={acc ? { color: "var(--acc)" } : undefined}>
        {v}
      </div>
    </div>
  );
}
