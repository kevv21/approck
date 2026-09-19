"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { descargarBlob } from "@/lib/excel";
import { generarInventarioExcel, nombreArchivoInventario } from "@/lib/inventario/excel";
import {
  abrirConteo, actualizarUnidad, cargarInsumos, cargarItems, cerrarConteo,
  conteoAbierto, filasParaExcel, guardarCantidades, listarConteos,
} from "@/lib/inventario/repo";
import { UNIDADES, type Conteo, type Insumo } from "@/lib/inventario/tipos";
import { hayConfig } from "@/lib/supabase";

const CLAVE_BORRADOR = "approck:inventario:borrador";

export default function Inventario() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [cantidades, setCantidades] = useState<Record<string, number | null>>({});
  const [conteo, setConteo] = useState<Conteo | null>(null);
  const [historial, setHistorial] = useState<Conteo[]>([]);
  const [quien, setQuien] = useState("");
  const [notas, setNotas] = useState("");
  const [filtro, setFiltro] = useState("");
  const [soloSinContar, setSoloSinContar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ txt: string; mal?: boolean } | null>(null);

  // Borrador local: un conteo son 59 insumos caminando por la bodega. Si se
  // recarga la página a mitad, perder todo es inaceptable.
  useEffect(() => {
    try {
      const b = localStorage.getItem(CLAVE_BORRADOR);
      if (b) setCantidades(JSON.parse(b));
    } catch { /* sin localStorage, se sigue igual */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(cantidades)); }
    catch { /* cuota llena o modo privado */ }
  }, [cantidades]);

  const recargar = useCallback(async () => {
    if (!hayConfig) return;
    try {
      const [ins, c, hist] = await Promise.all([
        cargarInsumos(), conteoAbierto(), listarConteos(),
      ]);
      setInsumos(ins); setConteo(c); setHistorial(hist);
      if (c) {
        const items = await cargarItems(c.id);
        setCantidades((prev) => {
          const base = { ...prev };
          for (const it of items) if (it.insumo_id) base[it.insumo_id] = it.cantidad;
          return base;
        });
      }
    } catch (e) {
      setAviso({ txt: `No se pudo cargar: ${(e as Error).message}`, mal: true });
    }
  }, []);

  useEffect(() => { recargar(); }, [recargar]);

  const sinUnidad = useMemo(() => insumos.filter((i) => !i.unidad), [insumos]);
  const contados = useMemo(
    () => insumos.filter((i) => cantidades[i.id] != null).length,
    [insumos, cantidades]
  );
  const visibles = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return insumos.filter((i) => {
      if (soloSinContar && cantidades[i.id] != null) return false;
      return !f || i.nombre.toLowerCase().includes(f);
    });
  }, [insumos, filtro, soloSinContar, cantidades]);

  const setCantidad = (id: string, v: string) => {
    const n = v.trim() === "" ? null : parseFloat(v.replace(",", "."));
    setCantidades((p) => ({ ...p, [id]: n == null || isNaN(n) ? null : n }));
  };

  const guardar = async () => {
    if (!conteo) return;
    setGuardando(true);
    try {
      const n = await guardarCantidades(conteo.id, insumos, cantidades);
      setAviso({ txt: `${n} insumos guardados.` });
    } catch (e) {
      setAviso({ txt: `Error al guardar: ${(e as Error).message}`, mal: true });
    } finally { setGuardando(false); }
  };

  const exportar = async () => {
    const fecha = conteo?.fecha ?? new Date().toISOString().slice(0, 10);
    const blob = await generarInventarioExcel({
      fecha,
      realizadoPor: conteo?.realizado_por ?? quien,
      notas,
      items: filasParaExcel(insumos, cantidades),
      incluirHojaDatos: true,
    });
    descargarBlob(blob, nombreArchivoInventario(fecha));
  };

  if (!hayConfig) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="panel p-5 text-sm" style={{ color: "var(--txt-2)" }}>
          Falta configurar Supabase. Los pasos están en el README.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3">
      <div className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-bold">Inventario</h1>
          <span className="mono text-sm" style={{ color: "var(--txt-2)" }}>
            {contados} / {insumos.length} contados
          </span>
        </div>

        {conteo ? (
          <p className="mt-1 text-sm" style={{ color: "var(--txt-2)" }}>
            Conteo del {conteo.fecha}
            {conteo.realizado_por ? ` · ${conteo.realizado_por}` : ""}
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <input className="input !w-auto flex-1" placeholder="Quién cuenta"
                   value={quien} onChange={(e) => setQuien(e.target.value)} />
            <button className="btn btn-ok" disabled={!quien} onClick={async () => {
              const c = await abrirConteo(quien);
              setConteo(c); setAviso({ txt: "Conteo abierto." });
            }}>Iniciar conteo</button>
          </div>
        )}

        <div className="mt-3 h-2 overflow-hidden rounded-full"
             style={{ background: "var(--panel-2)" }}>
          <div className="h-full transition-all"
               style={{
                 width: `${insumos.length ? (contados / insumos.length) * 100 : 0}%`,
                 background: "var(--acc)",
               }} />
        </div>
      </div>

      {sinUnidad.length > 0 && (
        <div className="panel p-3 text-sm" style={{ borderColor: "var(--acc)" }}>
          <b style={{ color: "var(--acc)" }}>
            {sinUnidad.length} insumos sin unidad de medida.
          </b>{" "}
          <span style={{ color: "var(--txt-2)" }}>
            Vienen así de la plantilla. Sin unidad, dos conteos del mismo insumo
            no se pueden comparar: uno puede estar en libras y otro en unidades.
            Definilas una vez acá abajo.
          </span>
        </div>
      )}

      <div className="panel flex flex-wrap items-center gap-2 p-3">
        <input className="input !w-auto flex-1" placeholder="Buscar insumo…"
               value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        <button onClick={() => setSoloSinContar((v) => !v)}
                className={`chip ${soloSinContar ? "chip-on" : ""}`}>
          Solo sin contar
        </button>
      </div>

      <div className="panel divide-y" style={{ borderColor: "var(--borde)" }}>
        {visibles.map((i) => (
          <div key={i.id} className="flex items-center gap-2 p-2">
            <span className="flex-1 text-sm">{i.nombre}</span>
            <input className="input !w-24 text-right" inputMode="decimal" placeholder="—"
                   value={cantidades[i.id] ?? ""}
                   onChange={(e) => setCantidad(i.id, e.target.value)} />
            <select className="input !w-24 !text-xs" value={i.unidad ?? ""}
                    onChange={async (e) => {
                      const u = e.target.value || null;
                      setInsumos((p) => p.map((x) => (x.id === i.id ? { ...x, unidad: u } : x)));
                      try { await actualizarUnidad(i.id, u); } catch { /* al recargar */ }
                    }}
                    style={!i.unidad ? { borderColor: "var(--acc)" } : undefined}>
              <option value="">sin unidad</option>
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        ))}
        {visibles.length === 0 && (
          <p className="p-6 text-center text-sm" style={{ color: "var(--txt-2)" }}>
            Nada que mostrar con este filtro.
          </p>
        )}
      </div>

      <div className="panel space-y-2 p-3">
        <input className="input" placeholder="Notas del conteo (opcional)"
               value={notas} onChange={(e) => setNotas(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-ghost" disabled={!conteo || guardando}
                  onClick={guardar}>
            {guardando ? "Guardando…" : "Guardar avance"}
          </button>
          <button className="btn btn-acc" onClick={exportar}>Descargar Excel</button>
          {conteo && (
            <button className="btn btn-mal col-span-2 !min-h-0 !py-2 text-sm"
                    onClick={async () => {
                      await guardarCantidades(conteo.id, insumos, cantidades);
                      await cerrarConteo(conteo.id, notas);
                      try { localStorage.removeItem(CLAVE_BORRADOR); } catch { /* noop */ }
                      setCantidades({}); setNotas("");
                      setAviso({ txt: "Conteo cerrado." });
                      recargar();
                    }}>Cerrar conteo</button>
          )}
        </div>
      </div>

      {aviso && (
        <div className="panel p-3 text-sm"
             style={{ color: aviso.mal ? "var(--mal)" : "var(--ok)" }}>{aviso.txt}</div>
      )}

      {historial.length > 0 && (
        <div className="panel p-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide"
              style={{ color: "var(--txt-2)" }}>Conteos anteriores</h2>
          <ul className="space-y-1">
            {historial.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="mono">{c.fecha}</span>
                <span style={{ color: "var(--txt-2)" }}>{c.realizado_por ?? "—"}</span>
                <button className="chip" onClick={async () => {
                  const items = await cargarItems(c.id);
                  const blob = await generarInventarioExcel({
                    fecha: c.fecha, realizadoPor: c.realizado_por, notas: c.notas,
                    items, incluirHojaDatos: true,
                  });
                  descargarBlob(blob, nombreArchivoInventario(c.fecha));
                }}>Excel</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
