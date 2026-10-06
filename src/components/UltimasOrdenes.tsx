"use client";

import { useCallback, useEffect, useState } from "react";
import { useAvisos } from "./Avisos";
import { fmtC } from "@/lib/money";
import { ordenesAbiertas, reimprimir, ultimasOrdenes, type OrdenBreve } from "@/lib/repo";
import { TIPOS_ORDEN } from "@/lib/types";
import { BASE_DESACTUALIZADA, noExisteColumna } from "@/lib/diagnostico";
import { hayInternet } from "@/lib/offline/conexion";

/**
 * ÓRDENES GUARDADAS: las que faltan cobrar y las últimas cobradas.
 *
 * Las dos cosas que se hacían rehaciendo el pedido, y que ahora no:
 *
 * - REIMPRIMIR. Cuando el ticket no salía, se cargaba el pedido otra vez y se
 *   cobraba de nuevo. Esa segunda orden es real para la base: el cierre salía
 *   con la venta DUPLICADA y el efectivo no cuadraba. Reimprimir no escribe
 *   una orden: vuelve a encolar el mismo ticket, marcado COPIA.
 *
 * - EDITAR. El cliente agrega una gaseosa, cambia una pizza o se equivocó el
 *   tipo de orden. Se abre la orden en la caja, se cambia lo que haga falta y
 *   se guarda sobre la misma, con el mismo número.
 *
 * Las sin cobrar van primero y siempre a la vista: son trabajo pendiente.
 */
export default function UltimasOrdenes({
  refresco, onEditar, editando,
}: {
  refresco: number;
  onEditar: (o: OrdenBreve) => void;
  /** Id de la orden abierta en la caja ahora mismo, para marcarla. */
  editando?: string | null;
}) {
  const { avisar } = useAvisos();
  const [abiertas, setAbiertas] = useState<OrdenBreve[]>([]);
  const [cobradas, setCobradas] = useState<OrdenBreve[]>([]);
  const [verTodas, setVerTodas] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    Promise.all([ordenesAbiertas(), ultimasOrdenes(10)])
      .then(([a, c]) => { setAbiertas(a); setCobradas(c); setError(null); })
      // Antes todo error decía «Sin conexión». Con la app más nueva que la
      // base, el cajero leía que no tenía internet teniéndolo.
      .catch(async (e) => {
        if (noExisteColumna(e)) setError(BASE_DESACTUALIZADA);
        else if (!(await hayInternet()))
          setError("Sin conexión no se pueden listar las órdenes guardadas.");
        else setError(`No se pudieron cargar las órdenes: ${(e as Error).message}`);
      });
  }, []);

  useEffect(() => { cargar(); }, [cargar, refresco]);

  const volverAImprimir = async (o: OrdenBreve) => {
    setEnviando(o.id);
    try {
      await reimprimir(o.id);
      avisar({
        texto: `Copia de la orden #${o.numero ?? "—"} enviada`,
        detalle: "Sale marcada COPIA. No se cobra de nuevo.",
        tono: "agregado",
      });
    } catch (e) {
      avisar({ texto: "No se pudo reimprimir", detalle: (e as Error).message, tono: "error" });
    } finally {
      setEnviando(null);
    }
  };

  if (error) {
    return <div className="panel p-3.5 text-sm" style={{ color: "var(--txt-2)" }}>{error}</div>;
  }
  if (abiertas.length === 0 && cobradas.length === 0) {
    return (
      <div className="panel p-5 text-center text-sm" style={{ color: "var(--txt-2)" }}>
        Todavía no hay órdenes guardadas en este turno.
      </div>
    );
  }

  const visibles = verTodas ? cobradas : cobradas.slice(0, 3);

  return (
    <div className="space-y-3">
      {abiertas.length > 0 && (
        <section className="panel overflow-hidden" style={{ borderColor: "var(--acc)" }}>
          <Encabezado titulo="Sin cobrar" cuenta={abiertas.length} acento />
          <div className="space-y-1.5 px-2.5 pb-2.5">
            {abiertas.map((o) => (
              <FilaOrden key={o.id} o={o} editando={editando === o.id}>
                <button className="btn btn-acc btn-chico" disabled={editando === o.id}
                        onClick={() => onEditar(o)}>
                  {editando === o.id ? "Abierta" : "Abrir"}
                </button>
              </FilaOrden>
            ))}
          </div>
        </section>
      )}

      {cobradas.length > 0 && (
        <section className="panel overflow-hidden">
          <Encabezado titulo="Últimas cobradas" />
          <div className="space-y-1.5 px-2.5 pb-2.5">
            {visibles.map((o) => (
              <FilaOrden key={o.id} o={o} editando={editando === o.id}>
                <button className="btn btn-ghost btn-chico" disabled={editando === o.id}
                        onClick={() => onEditar(o)}>Editar</button>
                <button className="btn btn-ghost btn-chico"
                        disabled={enviando === o.id} onClick={() => volverAImprimir(o)}>
                  {enviando === o.id ? "…" : "Reimprimir"}
                </button>
              </FilaOrden>
            ))}
            {cobradas.length > 3 && (
              <button className="btn-texto w-full justify-center"
                      onClick={() => setVerTodas((v) => !v)} aria-expanded={verTodas}>
                {verTodas ? "Ver menos" : `Ver ${cobradas.length - 3} más`}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Encabezado({ titulo, cuenta, acento }: { titulo: string; cuenta?: number; acento?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3.5 pb-2 pt-3">
      <span className="rotulo" style={acento ? { color: "var(--acc)" } : undefined}>{titulo}</span>
      {cuenta != null && (
        <span className="mono grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold"
              style={{ background: "var(--acc)", color: "var(--sobre-acc)" }}>{cuenta}</span>
      )}
    </div>
  );
}

const etiquetaTipo = (v: string) => TIPOS_ORDEN.find((t) => t.valor === v)?.etiqueta ?? v;

function FilaOrden({
  o, editando, children,
}: { o: OrdenBreve; editando: boolean; children: React.ReactNode }) {
  const hora = new Date(o.created_at).toLocaleTimeString("es-NI", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  // Lo que identifica la orden en el mostrador: la mesa o el nombre. El
  // número correlativo solo sirve si el cliente trae el papel en la mano.
  const quien = o.mesa ? `Mesa ${o.mesa}` : o.cliente || etiquetaTipo(o.tipo);

  return (
    <div className="flex items-center gap-2 rounded-xl py-2 pl-3 pr-2"
         style={{ background: "var(--panel-2)",
                  outline: editando ? "2px solid var(--acc)" : undefined }}>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold">{quien}</div>
        <div className="mono text-xs" style={{ color: "var(--txt-3)" }}>
          #{o.numero ?? "—"} · {hora} · {fmtC(o.total)}
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5">{children}</div>
    </div>
  );
}
