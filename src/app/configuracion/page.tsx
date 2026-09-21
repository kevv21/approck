"use client";

import { useCallback, useEffect, useState } from "react";
import { diagnosticar, estaListo, type Prueba } from "@/lib/diagnostico";
import { correoVinculado, desvincular } from "@/lib/auth/dispositivo";

const ICONO = { ok: "✓", mal: "✕", aviso: "!" } as const;
const COLOR = { ok: "var(--ok)", mal: "var(--mal)", aviso: "var(--acc-2)" } as const;

/**
 * Estado de la instalación.
 *
 * La pregunta que responde es una sola: ¿esto ya sirve para cobrar de verdad?
 * Antes la app contestaba que sí mientras no se intentara guardar nada.
 */
export default function Configuracion() {
  const [pruebas, setPruebas] = useState<Prueba[] | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const [correo, setCorreo] = useState<string | null>(null);
  const [confirmaDesvincular, setConfirmaDesvincular] = useState(false);

  const correr = useCallback(() => {
    setCorriendo(true);
    diagnosticar()
      .then(setPruebas)
      .catch((e) => setPruebas([{
        clave: "fallo", titulo: "El diagnóstico falló", estado: "mal",
        detalle: (e as Error).message,
      }]))
      .finally(() => setCorriendo(false));
  }, []);

  useEffect(() => { correr(); correoVinculado().then(setCorreo); }, [correr]);

  const listo = pruebas ? estaListo(pruebas) : false;

  return (
    <div className="mx-auto max-w-2xl space-y-3 p-3">
      <div className="panel p-4">
        <h1 className="text-lg font-bold">Estado de la instalación</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--txt-2)" }}>
          Revisa que la base de datos esté conectada y completa. Si algo falla
          acá, falla al cobrar.
        </p>
      </div>

      {pruebas && (
        <div className="panel p-4"
             style={{ borderColor: listo ? "var(--ok)" : "var(--mal)" }}>
          <b style={{ color: listo ? "var(--ok)" : "var(--mal)" }}>
            {listo ? "Listo para operar." : "Todavía no se puede cobrar."}
          </b>
          <span className="ml-1 text-sm" style={{ color: "var(--txt-2)" }}>
            {listo
              ? "La base responde y tiene todo lo que la app necesita."
              : "Abajo está exactamente qué falta y cómo se arregla."}
          </span>
        </div>
      )}

      {pruebas === null && (
        <p className="panel p-4 text-sm" style={{ color: "var(--txt-2)" }}>
          Revisando…
        </p>
      )}

      {pruebas?.map((p) => (
        <div key={p.clave} className="panel p-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center
                             rounded-full text-sm font-black"
                  style={{ background: COLOR[p.estado], color: "#0b0d12" }}
                  aria-hidden="true">
              {ICONO[p.estado]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{p.titulo}</div>
              <div className="mt-0.5 text-sm" style={{ color: "var(--txt-2)" }}>
                {p.detalle}
              </div>
              {p.arreglo && (
                <div className="mt-2 rounded-lg p-2.5 text-sm leading-snug"
                     style={{ background: "var(--panel-2)" }}>
                  <b style={{ color: "var(--acc)" }}>Cómo se arregla: </b>
                  {p.arreglo}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      <button className="btn btn-ghost w-full" disabled={corriendo} onClick={correr}>
        {corriendo ? "Revisando…" : "Volver a revisar"}
      </button>

      {/*
        Desvincular vive acá y no junto a "Salir": en un teléfono, tocar el
        botón de al lado dejaría el aparato fuera de la base en plena
        atención, y volver exige la contraseña del dueño.
      */}
      {correo && (
        <div className="panel p-3">
          <div className="text-sm">
            Aparato vinculado como{" "}
            <b style={{ color: "var(--acc)" }}>{correo}</b>
          </div>
          {confirmaDesvincular ? (
            <div className="mt-2">
              <p className="text-sm" style={{ color: "var(--txt-2)" }}>
                Para volver a usarlo habrá que escribir otra vez el correo y la
                contraseña del local. No lo hagas en medio de la atención.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button className="btn btn-ghost !min-h-0 !py-2 text-sm"
                        onClick={() => setConfirmaDesvincular(false)}>
                  Dejarlo como está
                </button>
                <button className="btn btn-mal !min-h-0 !py-2 text-sm"
                        onClick={async () => { await desvincular(); location.reload(); }}>
                  Sí, desvincular
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-ghost mt-2 !min-h-0 !py-2 text-sm"
                    onClick={() => setConfirmaDesvincular(true)}>
              Desvincular este aparato
            </button>
          )}
        </div>
      )}
    </div>
  );
}
