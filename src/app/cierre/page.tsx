"use client";

import { useCallback, useEffect, useState } from "react";
import { descargarBlob, generarCierreExcel, type FilaOrden } from "@/lib/excel";
import { fmtC, centavos } from "@/lib/money";
import { abrirTurno, cerrarTurno, reimprimir, turnoAbierto } from "@/lib/repo";
import { hayConfig, supabase } from "@/lib/supabase";
import { hayInternet } from "@/lib/offline/conexion";
import { TIPOS_ORDEN } from "@/lib/types";

const hoyISO = () => new Date().toISOString().slice(0, 10);

interface Turno {
  id: string; abierto_por: string; abierto_at: string;
  fondo_inicial: number; efectivo_contado: number | null;
}

export default function Cierre() {
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [ordenes, setOrdenes] = useState<FilaOrden[]>([]);
  const [turno, setTurno] = useState<Turno | null>(null);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const [quien, setQuien] = useState("");
  const [fondo, setFondo] = useState("");
  const [contado, setContado] = useState("");

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

  useEffect(() => {
    buscar();
    turnoAbierto().then((t) => setTurno(t as Turno | null)).catch(() => {});
  }, [buscar]);

  const pagadas = ordenes.filter((o) => o.estado === "pagada");
  const sumar = (f: (o: FilaOrden) => number) => pagadas.reduce((a, o) => a + f(o), 0);

  const exportar = async () => {
    const { d, h } = rango();
    const blob = await generarCierreExcel({ desde: d, hasta: h, turno, ordenes });
    descargarBlob(blob, `cierre-rockmunchies-${desde}${desde !== hasta ? `_a_${hasta}` : ""}.xlsx`);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-3">
      {/* turno */}
      <div className="panel p-4">
        <h2 className="mb-2 font-bold">Turno de caja</h2>
        {turno ? (
          <div className="space-y-2">
            <p className="text-sm" style={{ color: "var(--txt-2)" }}>
              Abierto por <b>{turno.abierto_por}</b> el{" "}
              {new Date(turno.abierto_at).toLocaleString("es-NI", { hour12: false })} ·
              fondo {fmtC(turno.fondo_inicial)}
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
                await cerrarTurno(turno.id, centavos(parseFloat(contado || "0") || 0));
                setTurno(null); setContado(""); setAviso("Turno cerrado.");
                buscar();
              }}>Cerrar turno</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <input className="input !w-auto flex-1" placeholder="Quién abre"
                   value={quien} onChange={(e) => setQuien(e.target.value)} />
            <input className="input !w-auto flex-1" inputMode="decimal"
                   placeholder="Fondo inicial C$" value={fondo}
                   onChange={(e) => setFondo(e.target.value)} />
            <button className="btn btn-ok" disabled={!quien} onClick={async () => {
              const t = await abrirTurno(quien, centavos(parseFloat(fondo || "0") || 0));
              setTurno(t as Turno); setAviso("Turno abierto.");
            }}>Abrir turno</button>
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
        <Kpi k="Base gravable" v={fmtC(sumar((o) => o.base_gravable))} />
        <Kpi k="IVA 15%" v={fmtC(sumar((o) => o.iva))} />
        <Kpi k="Total cobrado" v={fmtC(sumar((o) => o.total))} acc />
        <Kpi k="Desc. pizzas" v={fmtC(sumar((o) => o.desc_pizzas))} />
        <Kpi k="Desc. bebidas" v={fmtC(sumar((o) => o.desc_bebidas))} />
        <Kpi k="Desc. general" v={fmtC(sumar((o) => o.desc_general))} />
        <Kpi k="Propinas" v={fmtC(sumar((o) => o.propina))} />
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
                <td className="px-3 py-2">
                  <button className="chip"
                          onClick={() => reimprimir((o as unknown as { id: string }).id)}>
                    Reimprimir
                  </button>
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
