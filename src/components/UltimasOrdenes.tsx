"use client";

import { useCallback, useEffect, useState } from "react";
import { useAvisos } from "./Avisos";
import { fmtC } from "@/lib/money";
import { reimprimir, ultimasOrdenes, type OrdenBreve } from "@/lib/repo";
import { TIPOS_ORDEN } from "@/lib/types";
import { BASE_DESACTUALIZADA, noExisteColumna } from "@/lib/diagnostico";
import { hayInternet } from "@/lib/offline/conexion";

/**
 * REIMPRIMIR SIN REHACER EL PEDIDO
 *
 * El problema que resuelve es de caja, no de comodidad: cuando el ticket no
 * salía —sin papel, puente caído, impresora apagada— la única salida visible
 * era cargar el pedido otra vez y volver a cobrarlo. Esa segunda orden es
 * real para la base, así que al cerrar el turno la venta aparecía DUPLICADA y
 * el efectivo contado no cuadraba contra el sistema.
 *
 * Reimprimir no escribe una orden nueva: vuelve a encolar el mismo ticket,
 * marcado COPIA, y queda anotado en la bitácora.
 *
 * La última orden se ve sin abrir nada. Es la que falla: el cajero se entera
 * de que no salió el papel en los segundos siguientes al cobro, y en ese
 * momento no debería tener que buscar dónde está el botón.
 */
export default function UltimasOrdenes({ refresco }: { refresco: number }) {
  const { avisar } = useAvisos();
  const [ordenes, setOrdenes] = useState<OrdenBreve[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    ultimasOrdenes(10)
      .then((o) => { setOrdenes(o); setError(null); })
      // Antes todo error decía «Sin conexión». Con la app más nueva que la
      // base, el cajero leía que no tenía internet teniéndolo.
      .catch(async (e) => {
        if (noExisteColumna(e)) setError(BASE_DESACTUALIZADA);
        else if (!(await hayInternet()))
          setError("Sin conexión no se pueden listar las órdenes para reimprimir.");
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
    return (
      <div className="panel p-3 text-sm" style={{ color: "var(--txt-2)" }}>
        {error}
      </div>
    );
  }
  if (ordenes.length === 0) return null;

  const [ultima, ...resto] = ordenes;

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-3 px-3.5 pt-3">
        <span className="text-sm font-bold uppercase tracking-wide"
              style={{ color: "var(--txt-2)" }}>
          Últimas órdenes
        </span>
        {resto.length > 0 && (
          <button onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}
                  className="ml-auto rounded-lg px-2 text-sm"
                  style={{ color: "var(--txt-3)", minHeight: "40px" }}>
            {abierto ? "Ver menos" : `Ver ${resto.length} más`}
          </button>
        )}
      </div>

      <div className="space-y-1.5 p-3">
        <FilaOrden o={ultima} enviando={enviando === ultima.id}
                   onReimprimir={() => volverAImprimir(ultima)} destacada />
        {abierto && resto.map((o) => (
          <FilaOrden key={o.id} o={o} enviando={enviando === o.id}
                     onReimprimir={() => volverAImprimir(o)} />
        ))}
      </div>
    </div>
  );
}

const etiquetaTipo = (v: string) =>
  TIPOS_ORDEN.find((t) => t.valor === v)?.etiqueta ?? v;

function FilaOrden({
  o, enviando, onReimprimir, destacada,
}: {
  o: OrdenBreve;
  enviando: boolean;
  onReimprimir: () => void;
  destacada?: boolean;
}) {
  const hora = new Date(o.created_at).toLocaleTimeString("es-NI", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  // Lo que identifica la orden en el mostrador: la mesa o el nombre. El
  // número correlativo solo sirve si el cliente trae el papel en la mano.
  const quien = o.mesa ? `Mesa ${o.mesa}` : o.cliente || etiquetaTipo(o.tipo);

  return (
    <div className="flex items-center gap-2 rounded-lg px-2.5 py-2"
         style={{ background: "var(--panel-2)",
                  border: `1px solid ${destacada ? "var(--borde-2)" : "transparent"}` }}>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="mono truncate text-sm font-bold">
          #{o.numero ?? "—"} · {quien}
        </div>
        <div className="text-[11px]" style={{ color: "var(--txt-3)" }}>
          {hora} · {fmtC(o.total)}
          {o.estado !== "pagada" && ` · ${o.estado}`}
        </div>
      </div>
      <button className="btn btn-ghost shrink-0 !min-h-10 !px-3 !py-0 text-sm"
              disabled={enviando} onClick={onReimprimir}>
        {enviando ? "Enviando…" : "Reimprimir"}
      </button>
    </div>
  );
}
