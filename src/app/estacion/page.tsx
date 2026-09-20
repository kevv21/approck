"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AdaptadorPuente, PLAY_RAWBT, adaptadoresSugeridos, crearAdaptador,
  detectarReboteRawbt, olvidarRawbt,
  type PrinterAdapter, type TipoAdaptador,
} from "@/lib/printer";
import { desdeB64, encolarBytes, jobsPendientes, marcarJob } from "@/lib/repo";
import { CODEPAGES, type AnchoPapel } from "@/lib/escpos";
import { ticketPrueba } from "@/lib/ticket";
import { supabase, hayConfig } from "@/lib/supabase";

interface Job {
  id: string; tipo: string; estado: string; intentos: number;
  payload_b64: string; preview: string | null; created_at: string; error: string | null;
}

const INTERVALO_POLL = 4000;

const ETIQUETA: Record<TipoAdaptador, string> = {
  rawbt: "RawBT (Bluetooth Clásico)",
  puente: "Puente en la PC",
  usb: "Cable USB (OTG)",
  bluetooth: "Web Bluetooth (BLE)",
  serial: "Puerto COM",
  html: "Imprimir desde el navegador",
};

/** Lo que conviene saber de cada método antes de elegirlo. */
const NOTA: Partial<Record<TipoAdaptador, string>> = {
  rawbt: "La PT-210 del local pide PIN al vincularla, y eso significa Bluetooth Clásico. Web Bluetooth solo habla BLE, así que nunca la va a ver. RawBT es una app de Android que sí habla Clásico: instalala, emparejá la impresora ahí dentro con el PIN 0000, y esta pantalla le pasa cada ticket.",
  usb: "El selftest reporta «Interface: USB&BT». Con un cable OTG, Chrome le habla directo sin Bluetooth de por medio. Es lo más estable, a cambio de tener el teléfono atado por cable.",
  bluetooth: "Solo funciona si la impresora expone BLE. Si al vincularla te pide PIN, no lo expone.",
};

export default function Estacion() {
  const adaptador = useRef<PrinterAdapter | null>(null);
  const puente = useRef<AdaptadorPuente | null>(null);
  const procesando = useRef(false);

  const [modo, setModo] = useState<TipoAdaptador>("puente");
  const [conectada, setConectada] = useState(false);
  const [detalle, setDetalle] = useState<string>();
  const [auto, setAuto] = useState(true);
  const [cola, setCola] = useState<Job[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [codepage, setCodepage] = useState(16);
  const [ancho, setAncho] = useState<AnchoPapel>(58);
  const [error, setError] = useState<string | null>(null);
  const [faltaRawbt, setFaltaRawbt] = useState(false);

  // Chrome vuelve con ?sinrawbt=1 cuando el intent no encontró la app.
  useEffect(() => { if (detectarReboteRawbt()) setFaltaRawbt(true); }, []);

  const sugeridos = useRef<TipoAdaptador[]>([]);
  if (sugeridos.current.length === 0 && typeof window !== "undefined") {
    sugeridos.current = adaptadoresSugeridos();
  }
  if (!puente.current && typeof window !== "undefined") {
    puente.current = new AdaptadorPuente();
  }

  const anotar = (s: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString("es-NI", { hour12: false })}  ${s}`, ...l].slice(0, 60));

  const refrescar = useCallback(async () => {
    if (!hayConfig) return;
    try { setCola(await jobsPendientes() as Job[]); } catch { /* red caída */ }
    // El estado del puente se consulta siempre, aunque el modo sea otro:
    // la caja necesita saber si el servicio de la PC sigue vivo.
    try {
      await puente.current?.refrescarLatido();
      const e = puente.current?.estado();
      if (modo === "puente") { setConectada(!!e?.conectada); setDetalle(e?.detalle); }
    } catch { /* noop */ }
  }, [modo]);

  /** Procesa la cola de a uno. Nunca en paralelo: la térmica no lo tolera. */
  const procesar = useCallback(async () => {
    const a = adaptador.current;
    // En modo puente imprime el servicio de la PC, no esta pantalla.
    if (modo === "puente" || !a || !a.estado().conectada || procesando.current) return;
    // RawBT abre la app por cada trabajo: imprimir la cola entera de golpe
    // encadenaria intents y Android los descarta. Va de a uno, a mano.
    if (modo === "rawbt" && procesando.current) return;
    procesando.current = true;
    try {
      const jobs = await jobsPendientes() as Job[];
      for (const j of jobs) {
        try {
          await marcarJob(j.id, "imprimiendo");
          await a.imprimir(desdeB64(j.payload_b64));
          await marcarJob(j.id, "impreso", undefined, j.intentos + 1);
          anotar(`Impreso ${j.tipo} (${j.id.slice(0, 8)})`);
        } catch (e) {
          const msg = (e as Error).message;
          await marcarJob(j.id, "error", msg, j.intentos + 1);
          anotar(`ERROR ${j.tipo}: ${msg}`);
          break; // si falló la impresora, no reventar el resto de la cola
        }
      }
    } finally {
      procesando.current = false;
      refrescar();
    }
  }, [modo, refrescar]);

  // Polling + realtime. El polling es el que sostiene esto: el realtime de
  // Supabase se cae con el wifi del local y no siempre reconecta.
  useEffect(() => {
    if (!hayConfig) return;
    refrescar();
    const id = setInterval(() => { refrescar(); if (auto) procesar(); }, INTERVALO_POLL);
    const canal = supabase
      .channel("print_job_nuevos")
      .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "print_job" },
          () => { refrescar(); if (auto) procesar(); })
      .subscribe();
    return () => { clearInterval(id); supabase.removeChannel(canal); };
  }, [auto, procesar, refrescar]);

  // Si el Android se duerme, la cola se para.
  useEffect(() => {
    if (modo === "puente") return; // el puente no depende de esta pantalla
    let lock: WakeLockSentinel | null = null;
    const pedir = async () => {
      try { lock = await navigator.wakeLock?.request("screen"); } catch { /* opcional */ }
    };
    pedir();
    const onVis = () => { if (document.visibilityState === "visible") pedir(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); lock?.release(); };
  }, [modo]);

  const cambiarModo = (t: TipoAdaptador) => {
    adaptador.current?.desconectar();
    adaptador.current = t === "puente" || t === "html" ? null : crearAdaptador(t);
    if (adaptador.current) {
      adaptador.current.onEstado = (e) => { setConectada(e.conectada); setDetalle(e.detalle); };
    }
    setModo(t);
    setConectada(false);
    setDetalle(undefined);
    setError(null);
  };

  const conectar = async () => {
    setError(null);
    try {
      if (modo === "puente") {
        await puente.current!.conectar();
        const e = puente.current!.estado();
        setConectada(e.conectada); setDetalle(e.detalle);
        anotar("Puente respondiendo");
        return;
      }
      await adaptador.current!.conectar();
      const e = adaptador.current!.estado();
      setConectada(e.conectada); setDetalle(e.detalle);
      anotar(`${ETIQUETA[modo]} conectado`);
    } catch (e) { setError((e as Error).message); }
  };

  const probar = async () => {
    setError(null);
    const bytes = ticketPrueba(codepage, ancho);
    try {
      if (adaptador.current?.estado().conectada) {
        await adaptador.current.imprimir(bytes);
        anotar(`Prueba impresa (codepage ${codepage}, ${ancho}mm)`);
      } else {
        await encolarBytes(null, "prueba", bytes, `prueba cp${codepage} ${ancho}mm`);
        anotar("Prueba encolada: la va a imprimir el puente");
        refrescar();
      }
    } catch (e) { setError((e as Error).message); }
  };

  const noDisponible = adaptador.current?.motivoNoDisponible() ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-3 p-3">
      <div className="panel p-4">
        <h1 className="text-lg font-bold">Estación de impresión</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--txt-2)" }}>
          En modo puente, quien imprime es el servicio de la PC de caja y esta
          pantalla solo muestra el estado. En los otros modos, imprime este
          dispositivo y hay que dejar la pantalla abierta.
        </p>
      </div>

      {/* selector de modo */}
      <div className="panel p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide"
            style={{ color: "var(--txt-2)" }}>Modo de impresión</h2>
        <div className="flex flex-wrap gap-1.5">
          {sugeridos.current.map((t) => (
            <button key={t} onClick={() => cambiarModo(t)}
                    className={`chip ${modo === t ? "chip-on" : ""}`}>
              {ETIQUETA[t]}
            </button>
          ))}
        </div>

        {faltaRawbt && (
          <div className="rounded-lg p-3 text-sm"
               style={{ background: "#3a2a0a", color: "var(--acc-2)" }}>
            <b>RawBT no está instalada.</b> Es lo que permite hablarle a una
            impresora de Bluetooth Clásico, que es la que pide PIN al vincularla.{" "}
            <a href={PLAY_RAWBT} target="_blank" rel="noopener"
               className="underline" style={{ color: "var(--acc)" }}>
              Instalarla desde Play Store
            </a>
            . Después emparejá la impresora dentro de RawBT con el PIN 0000.{" "}
            <button className="underline"
                    onClick={() => {
                      olvidarRawbt();
                      setFaltaRawbt(false);
                      cambiarModo("rawbt"); // vuelve a ofrecerlo sin recargar
                    }}>
              Ya la instalé
            </button>
          </div>
        )}

        {NOTA[modo] && (
          <p className="mt-3 rounded-lg p-2 text-sm"
             style={{ background: "var(--panel-2)", color: "var(--txt-2)" }}>
            {NOTA[modo]}
          </p>
        )}

        {modo === "html" && (
          <p className="mt-3 rounded-lg p-2 text-sm"
             style={{ background: "var(--panel-2)", color: "var(--txt-2)" }}>
            El recibo se abre en una pestaña y se imprime con el diálogo del
            navegador. Funciona en cualquier dispositivo, iPhone incluido, y no
            necesita impresora térmica. Se usa desde la pantalla de caja.
          </p>
        )}

        {noDisponible && (
          <p className="mt-3 rounded-lg p-2 text-sm"
             style={{ background: "#3a1010", color: "#fca5a5" }}>{noDisponible}</p>
        )}
      </div>

      {/* estado y conexion */}
      {modo !== "html" && (
        <div className="panel space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-sm">
              <span className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: conectada ? "var(--ok)" : "var(--mal)" }} />
              {conectada ? "Lista" : "Sin conexión"}
              {detalle && (
                <span style={{ color: "var(--txt-2)" }}>· {detalle}</span>
              )}
            </span>
            <button className="btn btn-acc ml-auto" onClick={conectar}
                    disabled={!!noDisponible}>
              {modo === "puente" ? "Verificar puente" : "Conectar impresora"}
            </button>
          </div>

          {modo !== "puente" && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setAuto((v) => !v)}
                      className={`chip ${auto ? "chip-on" : ""}`}>
                {auto ? "Automático ON" : "Automático OFF"}
              </button>
              <button className="btn btn-ghost !min-h-0 !py-2 text-sm"
                      onClick={procesar} disabled={!conectada}>Imprimir cola ahora</button>
            </div>
          )}

          <div className="rounded-lg p-3" style={{ background: "var(--panel-2)" }}>
            <div className="mb-2 text-sm font-semibold">Prueba de impresión</div>
            <p className="mb-2 text-xs" style={{ color: "var(--txt-2)" }}>
              Si los acentos y la ñ salen como signos raros, probá otro codepage
              hasta que &quot;Toña&quot; y &quot;Jamón&quot; se lean bien.
            </p>
            <div className="flex flex-wrap gap-2">
              <select className="input !w-auto flex-1" value={codepage}
                      onChange={(e) => setCodepage(Number(e.target.value))}>
                {CODEPAGES.map((c) => (
                  <option key={c.n} value={c.n}>{c.nombre}</option>
                ))}
              </select>
              <select className="input !w-auto" value={ancho}
                      onChange={(e) => setAncho(Number(e.target.value) as AnchoPapel)}>
                <option value={58}>58 mm</option>
                <option value={80}>80 mm</option>
              </select>
              <button className="btn btn-ghost" onClick={probar}>Imprimir prueba</button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="panel p-3 text-sm" style={{ color: "var(--mal)" }}>{error}</div>
      )}

      <div className="panel p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide"
            style={{ color: "var(--txt-2)" }}>Cola ({cola.length})</h2>
        {cola.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--txt-2)" }}>Sin trabajos pendientes.</p>
        ) : (
          <ul className="space-y-1.5">
            {cola.map((j) => (
              <li key={j.id} className="rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--panel-2)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{j.tipo}</span>
                  <span className="mono text-xs" style={{ color: "var(--txt-2)" }}>
                    {new Date(j.created_at).toLocaleTimeString("es-NI", { hour12: false })}
                    {j.intentos > 0 && ` · ${j.intentos} intento(s)`}
                  </span>
                </div>
                {j.error && (
                  <div className="mt-1 text-xs" style={{ color: "var(--mal)" }}>{j.error}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {log.length > 0 && (
        <pre className="panel mono overflow-x-auto p-3 text-[11px] leading-relaxed"
             style={{ color: "var(--txt-2)" }}>{log.join("\n")}</pre>
      )}
    </div>
  );
}
