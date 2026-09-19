"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImpresoraBT, esIOS, soportaWebBluetooth } from "@/lib/bluetooth";
import { desdeB64, encolarBytes, jobsPendientes, marcarJob } from "@/lib/repo";
import { CODEPAGES } from "@/lib/escpos";
import { ticketPrueba } from "@/lib/ticket";
import { supabase, hayConfig } from "@/lib/supabase";

interface Job {
  id: string; tipo: string; estado: string; intentos: number;
  payload_b64: string; preview: string | null; created_at: string; error: string | null;
}

const INTERVALO_POLL = 4000;

export default function Estacion() {
  const impresora = useRef<ImpresoraBT | null>(null);
  const procesando = useRef(false);

  const [conectada, setConectada] = useState(false);
  const [nombre, setNombre] = useState<string>();
  const [auto, setAuto] = useState(true);
  const [cola, setCola] = useState<Job[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [codepage, setCodepage] = useState(16);
  const [error, setError] = useState<string | null>(null);

  const anotar = (s: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString("es-NI", { hour12: false })}  ${s}`, ...l].slice(0, 60));

  if (!impresora.current && typeof window !== "undefined") {
    impresora.current = new ImpresoraBT();
    impresora.current.onEstado = (c, n) => { setConectada(c); setNombre(n); };
  }

  const refrescar = useCallback(async () => {
    if (!hayConfig) return;
    try { setCola(await jobsPendientes() as Job[]); } catch { /* red caida, reintenta */ }
  }, []);

  /** Procesa la cola de a uno. Nunca en paralelo: la PT-210 no lo tolera. */
  const procesar = useCallback(async () => {
    const imp = impresora.current;
    if (!imp || !imp.conectada || procesando.current) return;
    procesando.current = true;
    try {
      const jobs = await jobsPendientes() as Job[];
      for (const j of jobs) {
        try {
          await marcarJob(j.id, "imprimiendo");
          await imp.imprimir(desdeB64(j.payload_b64));
          await marcarJob(j.id, "impreso", undefined, j.intentos + 1);
          anotar(`Impreso ${j.tipo} (${j.id.slice(0, 8)})`);
        } catch (e) {
          const msg = (e as Error).message;
          await marcarJob(j.id, "error", msg, j.intentos + 1);
          anotar(`ERROR ${j.tipo}: ${msg}`);
          break; // si la impresora fallo, no seguir reventando la cola
        }
      }
    } finally {
      procesando.current = false;
      refrescar();
    }
  }, [refrescar]);

  // Polling + realtime. El polling es el que de verdad sostiene esto:
  // el realtime de Supabase se cae con el wifi del local y no siempre reconecta.
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

  // Mantener la pantalla encendida: si el Android se duerme, la cola se para.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const pedir = async () => {
      try { lock = await navigator.wakeLock?.request("screen"); } catch { /* opcional */ }
    };
    pedir();
    const onVis = () => { if (document.visibilityState === "visible") pedir(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); lock?.release(); };
  }, []);

  const conectar = async () => {
    setError(null);
    try { await impresora.current!.conectar(); anotar("Impresora conectada"); }
    catch (e) { setError((e as Error).message); }
  };

  const probar = async () => {
    setError(null);
    try {
      if (impresora.current?.conectada) {
        await impresora.current.imprimir(ticketPrueba(codepage));
        anotar(`Prueba impresa con codepage ${codepage}`);
      } else {
        await encolarBytes(null, "prueba", ticketPrueba(codepage), `prueba cp${codepage}`);
        anotar("Prueba encolada (conectá la impresora para que salga)");
        refrescar();
      }
    } catch (e) { setError((e as Error).message); }
  };

  const soportado = soportaWebBluetooth();

  return (
    <div className="mx-auto max-w-2xl space-y-3 p-3">
      <div className="panel p-4">
        <h1 className="text-lg font-bold">Estación de impresión</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--txt-2)" }}>
          Dejá esta pantalla abierta en el Android de caja, enchufado y con la
          PT-210 encendida. Es el único dispositivo que habla con la impresora;
          el resto solo manda trabajos a la cola.
        </p>
      </div>

      {!soportado && (
        <div className="panel p-4" style={{ borderColor: "var(--mal)" }}>
          <h2 className="font-bold" style={{ color: "var(--mal)" }}>
            Este dispositivo no puede imprimir
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--txt-2)" }}>
            {esIOS()
              ? "Safari en iPhone y iPad no implementa Web Bluetooth y Apple no tiene planes de hacerlo. Este iPhone sirve perfecto para tomar órdenes: los tickets van a la cola y salen en el Android de caja."
              : "Usá Chrome o Edge. Firefox y Safari no soportan Web Bluetooth."}
          </p>
          <p className="mt-2 text-sm" style={{ color: "var(--txt-2)" }}>
            Trabajos en cola ahora mismo: <b>{cola.length}</b>
          </p>
        </div>
      )}

      {soportado && (
        <div className="panel space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-sm">
              <span className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: conectada ? "var(--ok)" : "var(--mal)" }} />
              {conectada ? `Conectada${nombre ? `: ${nombre}` : ""}` : "Desconectada"}
            </span>
            <button className="btn btn-acc ml-auto" onClick={conectar}>
              {conectada ? "Reconectar" : "Conectar PT-210"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setAuto((v) => !v)}
                    className={`chip ${auto ? "chip-on" : ""}`}>
              {auto ? "Automático ON" : "Automático OFF"}
            </button>
            <button className="btn btn-ghost !min-h-0 !py-2 text-sm"
                    onClick={procesar} disabled={!conectada}>Imprimir cola ahora</button>
          </div>

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
