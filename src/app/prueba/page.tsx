"use client";

import { useEffect, useRef, useState } from "react";
import { AdaptadorBluetooth, AdaptadorSerial, esIOS } from "@/lib/printer";
import type { PrinterAdapter } from "@/lib/printer";
import {
  CODEPAGES, codepageGuardado, guardarCodepage,
  guardarTransliterar, transliterarGuardado, type AnchoPapel,
} from "@/lib/escpos";
import { construirTicket, hojaCodepages, previsualizarTicket, type DatosTicket } from "@/lib/ticket";
import { pesoEstimado, soportaRaster, textoARaster } from "@/lib/raster";
import { calcularTotales } from "@/lib/pricing";
import { centavos } from "@/lib/money";
import { CONFIG_DEFAULT, type LineaOrden } from "@/lib/types";

/**
 * DIAGNOSTICO DE IMPRESORA
 *
 * No toca la base de datos a proposito: sirve para probar el telefono contra
 * la impresora antes de tener nada configurado.
 */

// Pedido de ejemplo con productos reales de la carta.
const EJEMPLO: LineaOrden[] = [
  { id: "1", productoId: "1", nombre: "Hawaiana Super Saiyajin", precioUnit: centavos(440), cantidad: 1, grupo: "pizza" },
  { id: "2", productoId: "2", nombre: "Diabla", precioUnit: centavos(300), cantidad: 2, grupo: "pizza" },
  { id: "3", productoId: "3", nombre: "Churros de Queso", precioUnit: centavos(125), cantidad: 1, grupo: "otro" },
  { id: "4", productoId: "4", nombre: "Toña", precioUnit: centavos(60), cantidad: 2, grupo: "bebida" },
];

type Paso = "conectar" | "acentos" | "recibo" | "listo";

export default function Prueba() {
  const adaptador = useRef<PrinterAdapter | null>(null);
  const [conectada, setConectada] = useState(false);
  const [nombre, setNombre] = useState<string>();
  const [paso, setPaso] = useState<Paso>("conectar");
  const [codepage, setCodepage] = useState(0);
  const [transliterar, setTransliterar] = useState(false);
  const [modoImagen, setModoImagen] = useState(false);
  const [ancho, setAncho] = useState<AnchoPapel>(58);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [entorno, setEntorno] = useState<{ https: boolean; bt: boolean; ios: boolean } | null>(null);

  useEffect(() => {
    setCodepage(codepageGuardado());
    setTransliterar(transliterarGuardado());
    setEntorno({
      https: location.protocol === "https:" || location.hostname === "localhost",
      bt: "bluetooth" in navigator,
      ios: esIOS(),
    });
  }, []);

  const anotar = (s: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString("es-NI", { hour12: false })}  ${s}`, ...l].slice(0, 30));

  const ticket = (): DatosTicket => ({
    numero: 142, tipo: "delivery", cliente: "Prueba",
    direccion: "Del parque 2c al sur", mesero: "Prueba",
    metodoPago: "efectivo", recibido: centavos(2000),
    fecha: new Date(), propinaPct: 10, ancho,
    totales: calcularTotales(EJEMPLO, [], {
      ...CONFIG_DEFAULT, costoEnvio: centavos(50), cobrarPropina: true,
    }),
  });

  const enviar = async (bytes: Uint8Array, que: string) => {
    setError(null);
    try {
      if (!adaptador.current?.estado().conectada) throw new Error("Conectá la impresora primero.");
      await adaptador.current.imprimir(bytes);
      anotar(`${que} enviado (${bytes.length} bytes)`);
    } catch (e) {
      const m = (e as Error).message;
      setError(m);
      anotar(`ERROR: ${m}`);
    }
  };

  const conectar = async (tipo: "bluetooth" | "serial") => {
    setError(null);
    adaptador.current = tipo === "bluetooth" ? new AdaptadorBluetooth() : new AdaptadorSerial();
    adaptador.current.onEstado = (e) => setConectada(e.conectada);
    try {
      await adaptador.current.conectar();
      const e = adaptador.current.estado();
      setConectada(e.conectada);
      setNombre(e.nombre);
      anotar(`Conectada${e.nombre ? `: ${e.nombre}` : ""}`);
      setPaso("acentos");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const imprimirRecibo = async () => {
    const t = ticket();
    if (modoImagen) {
      const texto = previsualizarTicket(t, codepage);
      await enviar(textoARaster(texto, { ancho }), "Recibo (imagen)");
    } else {
      await enviar(construirTicket(t, { codepage, transliterar }), "Recibo");
    }
    setPaso("listo");
  };

  const vista = previsualizarTicket(ticket(), codepage);
  const peso = pesoEstimado(vista, ancho);

  const Titulo = ({ n, txt, activo }: { n: number; txt: string; activo: boolean }) => (
    <div className="mb-2 flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
            style={{ background: activo ? "var(--acc)" : "var(--panel-2)",
                     color: activo ? "#1a0d04" : "var(--txt-2)" }}>{n}</span>
      <h2 className="font-bold">{txt}</h2>
    </div>
  );

  return (
    <div className="mx-auto max-w-lg space-y-3 p-3">
      <div className="panel p-4">
        <h1 className="text-lg font-bold">Probar la impresora</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--txt-2)" }}>
          Esta pantalla no usa la base de datos. Sirve para verificar el
          teléfono contra la impresora antes de configurar nada.
        </p>
      </div>

      {/* diagnóstico del entorno */}
      {entorno && (
        <div className="panel space-y-1.5 p-4 text-sm">
          <Fila ok={entorno.https} txt="Conexión segura (HTTPS o localhost)"
                mal="Web Bluetooth exige HTTPS. Abrí la app por su dirección https://" />
          <Fila ok={entorno.bt} txt="Este navegador soporta Bluetooth"
                mal={entorno.ios
                  ? "Safari en iPhone no tiene Web Bluetooth y Apple no piensa agregarlo. Este teléfono puede tomar órdenes, pero imprime el puente de la PC."
                  : "Usá Chrome o Edge."} />
          <Fila ok={soportaRaster()} txt="Puede imprimir en modo imagen"
                mal="Sin canvas no hay modo imagen." />
        </div>
      )}

      {/* 1. conectar */}
      <div className="panel p-4">
        <Titulo n={1} txt="Conectar" activo={paso === "conectar"} />
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-acc flex-1" onClick={() => conectar("bluetooth")}
                  disabled={!entorno?.bt}>
            Bluetooth
          </button>
          {"serial" in (typeof navigator !== "undefined" ? navigator : {}) && (
            <button className="btn btn-ghost flex-1" onClick={() => conectar("serial")}>
              Puerto COM
            </button>
          )}
        </div>
        <p className="mt-2 text-sm">
          <span className="inline-block h-2 w-2 rounded-full align-middle"
                style={{ background: conectada ? "var(--ok)" : "var(--mal)" }} />
          {" "}{conectada ? `Conectada${nombre ? `: ${nombre}` : ""}` : "Sin conectar"}
        </p>
        <p className="mt-2 text-xs" style={{ color: "var(--txt-2)" }}>
          Si no aparece en la lista: encendé la impresora, emparejala en los
          ajustes de Bluetooth del teléfono y volvé a intentar.
        </p>
      </div>

      {/* 2. acentos */}
      <div className="panel p-4">
        <Titulo n={2} txt="Resolver los acentos" activo={paso === "acentos"} />
        <p className="mb-3 text-sm" style={{ color: "var(--txt-2)" }}>
          Imprime los tres juegos de caracteres en una sola hoja. Mira el papel,
          busca el bloque donde <b>Toña</b> y <b>Jamón</b> se lean bien, y
          elegí ese número acá abajo.
        </p>

        <button className="btn btn-acc w-full" disabled={!conectada}
                onClick={() => enviar(hojaCodepages(ancho), "Hoja de acentos")}>
          Imprimir hoja de acentos
        </button>

        <div className="mt-3 space-y-2">
          {CODEPAGES.map((c) => (
            <button key={c.n}
                    onClick={() => { setCodepage(c.n); guardarCodepage(c.n); }}
                    className={`chip w-full text-left ${codepage === c.n ? "chip-on" : ""}`}>
              Opción {c.n} — {c.nombre}
            </button>
          ))}
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={transliterar}
                 onChange={(e) => { setTransliterar(e.target.checked); guardarTransliterar(e.target.checked); }} />
          Ninguno funcionó: quitar acentos (Toña → Tona)
        </label>

        <label className="mt-2 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={modoImagen} className="mt-1"
                 onChange={(e) => setModoImagen(e.target.checked)} />
          <span>
            <b>Modo imagen</b> — dibuja el ticket y lo manda como mapa de bits.
            Funciona en cualquier impresora sin importar el firmware, pero pesa{" "}
            <b>{(peso / 1024).toFixed(0)} kB</b> en vez de ~1 kB, así que por
            Bluetooth tarda cerca de {Math.round(peso / 20 * 0.025)} segundos.
          </span>
        </label>
      </div>

      {/* 3. recibo */}
      <div className="panel p-4">
        <Titulo n={3} txt="Imprimir un recibo real" activo={paso === "recibo"} />
        <div className="mb-3 flex gap-2">
          {([58, 80] as AnchoPapel[]).map((a) => (
            <button key={a} onClick={() => setAncho(a)}
                    className={`chip flex-1 ${ancho === a ? "chip-on" : ""}`}>{a} mm</button>
          ))}
        </div>
        <button className="btn btn-ok w-full" disabled={!conectada} onClick={imprimirRecibo}>
          Imprimir recibo de ejemplo
        </button>
        <p className="mt-2 text-xs" style={{ color: "var(--txt-2)" }}>
          Si el texto llega justo al borde del papel, el ancho está bien.
          Si se corta o sobra margen, cambiá de 58 a 80 mm.
        </p>
      </div>

      <details className="panel p-4">
        <summary className="cursor-pointer text-sm font-bold"
                 style={{ color: "var(--txt-2)" }}>
          Vista previa (lo mismo que sale en papel)
        </summary>
        <pre className="mono mt-2 overflow-x-auto text-[11px] leading-snug">{vista}</pre>
      </details>

      {error && (
        <div className="panel p-3 text-sm" style={{ color: "var(--mal)" }}>{error}</div>
      )}

      {log.length > 0 && (
        <pre className="panel mono overflow-x-auto p-3 text-[11px]"
             style={{ color: "var(--txt-2)" }}>{log.join("\n")}</pre>
      )}
    </div>
  );
}

function Fila({ ok, txt, mal }: { ok: boolean; txt: string; mal: string }) {
  return (
    <div className="flex items-start gap-2">
      <span style={{ color: ok ? "var(--ok)" : "var(--mal)" }}>{ok ? "✓" : "✕"}</span>
      <span>
        {txt}
        {!ok && <span className="block text-xs" style={{ color: "var(--txt-2)" }}>{mal}</span>}
      </span>
    </div>
  );
}
