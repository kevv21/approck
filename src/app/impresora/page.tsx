"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Interruptor, Segmentado } from "@/components/Controles";
import { useAvisos } from "@/components/Avisos";
import { AdaptadorPuente } from "@/lib/printer";
import {
  CODEPAGES, anchoGuardado, codepageGuardado, guardarAncho, guardarCodepage,
  guardarTransliterar, transliterarGuardado, type AnchoPapel,
} from "@/lib/escpos";
import { construirTicket, hojaCodepages, type DatosTicket } from "@/lib/ticket";
import { imprimirBytes } from "@/lib/repo";
import { impresoraBluetooth } from "@/lib/printer/salida";
import { useSesion } from "@/lib/auth/sesion";
import { puede } from "@/lib/auth/permisos";
import { calcularTotales } from "@/lib/pricing";
import { centavos } from "@/lib/money";
import { hayConfig } from "@/lib/supabase";
import { CONFIG_DEFAULT, type LineaOrden } from "@/lib/types";

/**
 * IMPRESORA
 *
 * Reemplaza a la «estación de impresión» y a «Probar impresora». El camino
 * normal es internet: el ticket va a la cola al cobrar y lo imprime la PC de
 * caja. Aquí se ve si esa PC está respondiendo, se ajusta el papel y se manda
 * un ticket de prueba.
 *
 * Cuando no hay PC, la cuenta maestra conecta la impresora por Bluetooth
 * (BLE) desde aquí, y mientras siga conectada todo lo que imprime ese
 * teléfono sale directo.
 */

// Pedido de ejemplo con productos reales de la carta.
const EJEMPLO: LineaOrden[] = [
  { id: "1", productoId: "1", nombre: "Hawaiana Super Saiyajin", precioUnit: centavos(440), cantidad: 1, grupo: "pizza" },
  { id: "2", productoId: "2", nombre: "Diabla", precioUnit: centavos(300), cantidad: 2, grupo: "pizza" },
  { id: "3", productoId: "3", nombre: "Toña", precioUnit: centavos(60), cantidad: 2, grupo: "bebida" },
];

export default function Impresora() {
  const { avisar } = useAvisos();
  const puente = useRef<AdaptadorPuente | null>(null);
  const [ancho, setAncho] = useState<AnchoPapel>(58);
  const [codepage, setCodepage] = useState(0);
  const [transliterar, setTransliterar] = useState(false);
  const [pc, setPc] = useState<{ viva: boolean; detalle?: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const maestra = puede(useSesion()?.rol, "imprimir");

  useEffect(() => {
    setAncho(anchoGuardado());
    setCodepage(codepageGuardado());
    setTransliterar(transliterarGuardado());
  }, []);

  const revisarPc = useCallback(async () => {
    if (!hayConfig) return;
    puente.current ??= new AdaptadorPuente();
    try {
      await puente.current.refrescarLatido();
      const e = puente.current.estado();
      setPc({ viva: e.conectada, detalle: e.detalle });
    } catch {
      setPc({ viva: false, detalle: "no se pudo consultar" });
    }
  }, []);

  useEffect(() => {
    revisarPc();
    const id = setInterval(revisarPc, 15000);
    return () => clearInterval(id);
  }, [revisarPc]);

  const enviar = async (bytes: Uint8Array, que: string) => {
    setEnviando(true);
    try {
      const salida = await imprimirBytes(null, "prueba", bytes, que);
      avisar({
        texto: `${que} enviada`,
        detalle: salida === "bluetooth" ? "Salió por Bluetooth, desde este teléfono" : "La imprime la PC de caja",
        tono: "agregado",
      });
    } catch (e) {
      avisar({ texto: "No se pudo enviar", detalle: (e as Error).message, tono: "error" });
    } finally {
      setEnviando(false);
    }
  };

  const ejemplo = (): DatosTicket => ({
    numero: 142, tipo: "delivery", cliente: "Prueba", direccion: "Del parque 2c al sur",
    mesero: "Prueba", metodoPago: "efectivo", recibido: centavos(2000),
    fecha: new Date(), ancho,
    totales: calcularTotales(EJEMPLO, [], { ...CONFIG_DEFAULT, costoEnvio: centavos(50) }),
  });

  return (
    <div className="mx-auto max-w-lg space-y-3 p-3">
      <div className="panel p-4">
        <h1 className="display text-3xl">Impresora</h1>
        <p className="mt-1 text-sm leading-snug" style={{ color: "var(--txt-2)" }}>
          Los tickets se imprimen <b>por internet</b>: al cobrar, reimprimir o pedir la
          pre-cuenta, el ticket sale en la <b>PC de caja</b>, que tiene la impresora
          conectada. Funciona igual desde cualquier teléfono, iPhone incluido.
        </p>
      </div>

      <div className="panel space-y-2 p-4">
        <span className="rotulo">PC de caja</span>
        <div className="flex items-center gap-2 rounded-xl px-3 py-2"
             style={{ background: "var(--panel-2)" }} role="status">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: pc == null ? "var(--txt-3)" : pc.viva ? "var(--ok)" : "var(--mal)" }} />
          <span className="flex-1 text-sm">
            {pc == null ? "Revisando…" : pc.viva ? "Lista para imprimir" : "No responde"}
            {pc?.detalle && (
              <span className="block text-xs" style={{ color: "var(--txt-3)" }}>{pc.detalle}</span>
            )}
          </span>
          <button className="btn btn-ghost btn-chico" onClick={revisarPc}>Revisar</button>
        </div>
        {pc && !pc.viva && (
          <p className="text-xs leading-snug" style={{ color: "var(--txt-2)" }}>
            Revisa que la PC esté encendida, con internet, con la impresora conectada y
            con el servicio del puente corriendo. Mientras tanto, la cuenta maestra puede
            conectar la impresora por Bluetooth aquí abajo, o imprimir el recibo desde
            el navegador («Más opciones» → «Imprimir aquí»).
          </p>
        )}
      </div>

      <Bluetooth maestra={maestra} pcCaida={pc != null && !pc.viva}
                 prueba={() => construirTicket(ejemplo(), { codepage, transliterar })} />

      <div className="panel space-y-3 p-4">
        <span className="rotulo">Papel</span>
        <Segmentado<AnchoPapel> etiqueta="Ancho del papel" valor={ancho}
          onCambio={(a) => { setAncho(a); guardarAncho(a); }}
          opciones={[{ valor: 58, etiqueta: "58 mm" }, { valor: 80, etiqueta: "80 mm" }]} />

        <span className="rotulo block pt-1">Acentos y ñ</span>
        <p className="text-sm leading-snug" style={{ color: "var(--txt-2)" }}>
          Imprime la hoja de acentos, busca el bloque donde <b>Toña</b> y <b>Jamón</b> se
          lean bien y elige ese número.
        </p>
        <button className="btn btn-ghost w-full" disabled={enviando}
                onClick={() => enviar(hojaCodepages(ancho), "Hoja de acentos")}>
          Imprimir hoja de acentos
        </button>
        <Segmentado etiqueta="Juego de caracteres" valor={codepage} className="!grid-flow-row"
          onCambio={(n) => { setCodepage(n); guardarCodepage(n); }}
          opciones={CODEPAGES.map((c) => ({ valor: c.n, etiqueta: `Opción ${c.n} — ${c.nombre}` }))} />
        <Interruptor activo={transliterar}
                     onCambio={(v) => { setTransliterar(v); guardarTransliterar(v); }}
                     detalle="Si ninguna opción sacó bien la ñ: Toña → Tona">
          Quitar acentos
        </Interruptor>
      </div>

      <div className="panel space-y-2 p-4">
        <span className="rotulo">Prueba</span>
        <button className="btn btn-acc w-full" disabled={enviando}
                onClick={() => enviar(construirTicket(ejemplo(), { codepage, transliterar }), "Prueba")}>
          Imprimir un recibo de ejemplo
        </button>
        <p className="text-xs" style={{ color: "var(--txt-3)" }}>
          Si el texto llega justo al borde del papel, el ancho está bien. Si se corta
          o sobra margen, cambia entre 58 y 80 mm.
        </p>
      </div>
    </div>
  );
}

/**
 * Bluetooth directo, sin PC. Solo la cuenta maestra.
 *
 * Buscar la impresora tiene que salir de un toque: el navegador solo abre la
 * lista de aparatos si se lo pide un gesto de la persona.
 */
function Bluetooth({
  maestra, pcCaida, prueba,
}: { maestra: boolean; pcCaida: boolean; prueba: () => Uint8Array }) {
  const { avisar } = useAvisos();
  const [estado, setEstado] = useState(() => impresoraBluetooth.estado());
  const [ocupado, setOcupado] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);

  useEffect(() => {
    // Fuera del primer render: `navigator` no existe al prerenderizar.
    setMotivo(impresoraBluetooth.motivoNoDisponible());
    setEstado(impresoraBluetooth.estado());
    impresoraBluetooth.onEstado = setEstado;
    return () => { impresoraBluetooth.onEstado = undefined; };
  }, []);

  const buscar = async () => {
    setOcupado(true);
    setProblema(null);
    try {
      await impresoraBluetooth.conectar();
      setEstado(impresoraBluetooth.estado());
      avisar({ texto: "Impresora conectada", detalle: "Lo que imprimas desde este teléfono sale por aquí", tono: "agregado" });
    } catch (e) {
      const err = e as DOMException;
      // Cerrar la lista sin elegir también llega como NotFoundError.
      setProblema(err.name === "NotFoundError"
        ? "No se eligió ninguna impresora. Si la tuya no aparecía en la lista, lo más probable es que solo hable Bluetooth clásico (la que pide PIN 0000 al emparejarla): esas no se pueden usar desde una página web."
        : `No se pudo conectar: ${err.message}`);
    } finally {
      setOcupado(false);
    }
  };

  const probar = async () => {
    setOcupado(true);
    try {
      await impresoraBluetooth.imprimir(prueba());
      avisar({ texto: "Prueba enviada por Bluetooth", tono: "agregado" });
    } catch (e) {
      avisar({ texto: "No salió por Bluetooth", detalle: (e as Error).message, tono: "error" });
    } finally {
      setOcupado(false);
      setEstado(impresoraBluetooth.estado());
    }
  };

  return (
    <div className="panel space-y-2 p-4" style={pcCaida && !estado.conectada ? { borderColor: "var(--acc)" } : undefined}>
      <span className="rotulo">Sin PC: Bluetooth en este teléfono</span>
      {!maestra ? (
        <p className="text-sm leading-snug" style={{ color: "var(--txt-2)" }}>
          Para imprimir directo desde este teléfono, entra con la cuenta maestra.
        </p>
      ) : motivo ? (
        <p className="text-sm leading-snug" style={{ color: "var(--txt-2)" }}>{motivo}</p>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-xl px-3 py-2"
               style={{ background: "var(--panel-2)" }} role="status">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: estado.conectada ? "var(--ok)" : "var(--txt-3)" }} />
            <span className="min-w-0 flex-1 truncate text-sm">
              {estado.conectada ? `Conectada: ${estado.nombre ?? "impresora"}` : "No conectada"}
            </span>
            {estado.conectada && (
              <button className="btn btn-ghost btn-chico" disabled={ocupado}
                      onClick={() => { impresoraBluetooth.desconectar(); setEstado(impresoraBluetooth.estado()); }}>
                Desconectar
              </button>
            )}
          </div>
          <p className="text-xs leading-snug" style={{ color: "var(--txt-2)" }}>
            {estado.conectada
              ? "Mientras siga conectada, todo lo que imprimas desde este teléfono (cobros, reimpresiones, pre-cuentas) sale por aquí y no por la PC."
              : "Para cuando no hay PC de caja. Mientras esté conectada, este teléfono imprime directo. Hay que volver a conectarla cada vez que se abre la app."}
          </p>
          {estado.conectada ? (
            <button className="btn btn-acc w-full" disabled={ocupado} onClick={probar}>
              Imprimir prueba por Bluetooth
            </button>
          ) : (
            <button className="btn btn-acc w-full" disabled={ocupado} onClick={buscar}>
              {ocupado ? "Buscando…" : "Buscar impresora Bluetooth"}
            </button>
          )}
          {problema && (
            <p role="alert" className="text-xs leading-snug" style={{ color: "var(--mal)" }}>{problema}</p>
          )}
        </>
      )}
    </div>
  );
}
