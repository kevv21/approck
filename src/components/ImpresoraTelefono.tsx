"use client";

import { useCallback, useEffect, useState } from "react";
import { useAvisos } from "./Avisos";
import { Rockzza, codigoDe, type ImpresoraEmparejada } from "@/lib/nativo/rockzza";
import { useAtras } from "@/lib/nativo/atras";
import {
  guardarImpresora, impresoraElegida, imprimirPorTelefono, type ImpresoraElegida,
} from "@/lib/printer/telefono";

/**
 * LA IMPRESORA DE ESTE TELÉFONO (solo en el APK)
 *
 * Tres momentos, cada uno con una sola acción principal:
 *   1. Sin elegir:  «Elegir impresora».
 *   2. Eligiendo:   la lista de emparejadas; tocar una la conecta y la guarda.
 *                   Si no hay ninguna, los tres pasos para emparejarla.
 *   3. Elegida:     «Imprimir prueba». Cambiar y dejar de usar, al lado.
 *
 * Emparejar (el PIN 0000) se hace en los ajustes de Android: ninguna app
 * puede abrir ese diálogo por su cuenta. Lo que sí se puede es llevar ahí con
 * un botón y, al volver, refrescar la lista sola.
 */
export default function ImpresoraTelefono({
  maestra, pcCaida, prueba,
}: { maestra: boolean; pcCaida: boolean; prueba: () => Uint8Array }) {
  const { avisar } = useAvisos();
  const [elegida, setElegida] = useState<ImpresoraElegida | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [lista, setLista] = useState<ImpresoraEmparejada[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [conectando, setConectando] = useState<string | null>(null);
  const [problema, setProblema] = useState<{ texto: string; ajustes?: boolean } | null>(null);
  const [probando, setProbando] = useState(false);

  useEffect(() => { setElegida(impresoraElegida()); }, []);
  useAtras(eligiendo, () => setEligiendo(false));

  const cargar = useCallback(async () => {
    setCargando(true);
    setProblema(null);
    try {
      const { impresoras } = await Rockzza.emparejadas();
      // Las que Android reconoce como impresora, primero.
      setLista([...impresoras].sort((a, b) => Number(b.esImpresora) - Number(a.esImpresora)));
    } catch (e) {
      const c = codigoDe(e);
      setLista(null);
      setProblema({ texto: (e as Error).message, ajustes: c === "APAGADO" });
    } finally {
      setCargando(false);
    }
  }, []);

  // Al volver de los ajustes de Android (donde se empareja), la lista se
  // refresca sola: sin esto, la impresora recién emparejada no aparecía.
  useEffect(() => {
    if (!eligiendo) return;
    const alVolver = () => { if (document.visibilityState === "visible") cargar(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [eligiendo, cargar]);

  const empezar = () => { setEligiendo(true); cargar(); };

  const elegir = async (i: ImpresoraEmparejada) => {
    setConectando(i.direccion);
    setProblema(null);
    try {
      const r = await Rockzza.conectar({ direccion: i.direccion });
      const nueva = { direccion: r.direccion, nombre: r.nombre || i.nombre };
      guardarImpresora(nueva);
      setElegida(nueva);
      setEligiendo(false);
      avisar({ texto: `${nueva.nombre} lista`, detalle: "Lo que imprimas desde este teléfono sale por ahí", tono: "agregado" });
    } catch (e) {
      setProblema({ texto: (e as Error).message, ajustes: codigoDe(e) === "APAGADO" });
    } finally {
      setConectando(null);
    }
  };

  const probar = async () => {
    setProbando(true);
    try {
      await imprimirPorTelefono(prueba());
      avisar({ texto: "Prueba enviada", detalle: elegida?.nombre, tono: "agregado" });
    } catch (e) {
      avisar({ texto: "No salió la prueba", detalle: (e as Error).message, tono: "error" });
    } finally {
      setProbando(false);
    }
  };

  const dejar = () => {
    Rockzza.desconectar().catch(() => {});
    guardarImpresora(null);
    setElegida(null);
    avisar({ texto: "Impresora del teléfono quitada", detalle: "Vuelve a imprimir la PC de caja", tono: "quitado" });
  };

  const ajustes = () => { Rockzza.abrirAjustesBluetooth().catch(() => {}); };

  return (
    <div className="panel space-y-3 p-4"
         style={pcCaida && !elegida ? { borderColor: "var(--acc)" } : undefined}>
      <span className="rotulo">Impresora de este teléfono</span>

      {!maestra ? (
        <p className="text-sm leading-snug" style={{ color: "var(--txt-2)" }}>
          Para imprimir directo desde este teléfono, entra con la cuenta maestra.
        </p>
      ) : elegida && !eligiendo ? (
        <>
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--panel-2)" }}>
            <IconoImpresora activo />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate font-semibold">{elegida.nombre}</div>
              <div className="text-xs" style={{ color: "var(--txt-3)" }}>Se conecta sola al imprimir</div>
            </div>
          </div>
          <p className="text-xs leading-snug" style={{ color: "var(--txt-2)" }}>
            Todo lo que imprimas desde este teléfono (cobros, reimpresiones, pre-cuentas)
            sale por esta impresora y no por la PC.
          </p>
          <button className="btn btn-acc w-full" disabled={probando} onClick={probar}>
            {probando ? "Imprimiendo…" : "Imprimir prueba"}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-ghost" onClick={empezar}>Cambiar</button>
            <button className="btn btn-mal-suave" onClick={dejar}>Dejar de usar</button>
          </div>
        </>
      ) : !eligiendo ? (
        <>
          <p className="text-sm leading-snug" style={{ color: "var(--txt-2)" }}>
            {pcCaida
              ? "La PC de caja no responde. Usa la impresora con este teléfono y los tickets salen al instante."
              : "Para cuando no hay PC de caja: este teléfono imprime directo, por Bluetooth, sin otras apps."}
          </p>
          <button className="btn btn-acc w-full" onClick={empezar}>Elegir impresora</button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Impresoras emparejadas</span>
            <button className="btn-texto" onClick={() => setEligiendo(false)}>Cancelar</button>
          </div>

          {cargando && !lista && (
            <p className="text-sm" style={{ color: "var(--txt-2)" }} role="status">Buscando…</p>
          )}

          {lista && lista.length > 0 && (
            <ul className="space-y-1.5" aria-label="Impresoras emparejadas">
              {lista.map((i) => (
                <li key={i.direccion}>
                  <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition active:scale-[.98]"
                          style={{ background: "var(--panel-2)", minHeight: "56px" }}
                          disabled={conectando !== null} onClick={() => elegir(i)}>
                    <IconoImpresora activo={i.esImpresora} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate font-semibold">{i.nombre}</span>
                      <span className="mono block text-[11px]" style={{ color: "var(--txt-3)" }}>{i.direccion}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold" style={{ color: "var(--acc)" }}>
                      {conectando === i.direccion ? "Conectando…" : i.esImpresora ? "Impresora" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {lista && lista.length === 0 && (
            <div className="space-y-2 rounded-xl p-3 text-sm leading-snug" style={{ background: "var(--panel-2)" }}>
              <b className="block">Todavía no hay ninguna emparejada</b>
              <ol className="list-decimal space-y-1 pl-5" style={{ color: "var(--txt-2)" }}>
                <li>Enciende la impresora.</li>
                <li>En Bluetooth, toca <b>Vincular dispositivo nuevo</b> y elige la impresora (por ejemplo <b>PT-210</b>).</li>
                <li>Si pide PIN, es <b>0000</b>. Vuelve aquí: la lista se actualiza sola.</li>
              </ol>
            </div>
          )}

          {problema && (
            <p role="alert" className="text-sm leading-snug" style={{ color: "var(--mal)" }}>{problema.texto}</p>
          )}

          {(lista?.length === 0 || problema?.ajustes || (lista && lista.length > 0)) && (
            <button className={`btn w-full ${lista?.length === 0 || problema?.ajustes ? "btn-acc" : "btn-ghost"}`}
                    onClick={ajustes}>
              {lista && lista.length > 0 ? "No está en la lista: abrir Bluetooth" : "Abrir ajustes de Bluetooth"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function IconoImpresora({ activo }: { activo?: boolean }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
          style={{ background: "var(--panel)", color: activo ? "var(--acc)" : "var(--txt-3)" }}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 17v4h10v-4" />
      </svg>
    </span>
  );
}
