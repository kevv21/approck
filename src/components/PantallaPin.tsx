"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { entrar, nombresRecordados } from "@/lib/auth/sesion";
import { registrar } from "@/lib/auth/auditoria";
import { vibrar } from "@/lib/nativo/rockzza";
import { MARCA } from "@/lib/marca";
import Firma from "@/components/Firma";
import { Borrar, Check } from "@/components/Iconos";

/** Los PIN van de 4 a 8 números (`cambiar_pin` en la base no acepta otros). */
const MIN_PIN = 4;
const MAX_PIN = 8;

/**
 * ACCESO: quién trabaja y con qué cuenta.
 *
 * - El nombre se elige de los que ya entraron en este aparato, con un toque.
 *   No se marca ninguno de entrada: el nombre va a la bitácora y al recibo, y
 *   uno preelegido que nadie cambió deja anulaciones a nombre de otra persona.
 * - El PIN, con un teclado propio de botones grandes. El del sistema tapa
 *   media pantalla, cambia de un teléfono a otro y en algunos abre con letras.
 * - No entra solo al cuarto número: hay PIN de hasta 8, y uno de 6 entraría
 *   a medias y fallaría siempre. Se confirma con ✓.
 * - Un PIN que no es hace temblar los puntos y vibra 40 ms: se nota sin leer.
 */
export default function PantallaPin() {
  const [previos, setPrevios] = useState<string[]>([]);
  const [nombre, setNombre] = useState("");
  const [otro, setOtro] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<{ texto: string; revisar?: boolean } | null>(null);
  const [entrando, setEntrando] = useState(false);
  const [temblor, setTemblor] = useState(0);

  useEffect(() => {
    const p = nombresRecordados().slice(0, 6);
    setPrevios(p);
    if (p.length === 0) setOtro(true);
  }, []);

  const listo = Boolean(nombre.trim()) && pin.length >= MIN_PIN && !entrando;

  const acceder = useCallback(async () => {
    if (!nombre.trim() || pin.length < MIN_PIN || entrando) return;
    setEntrando(true);
    setError(null);
    try {
      const s = await entrar(nombre, pin);
      setPin("");
      if (!s) {
        setError({ texto: "Ese PIN no es de ninguna cuenta." });
        setTemblor((n) => n + 1);
        vibrar(40);
        await registrar({ accion: "login_fallido", detalle: { nombre } });
      }
    } catch (e) {
      // No es el PIN: la base no respondió o le falta algo. Estado dice qué.
      setError({ texto: `No se pudo verificar: ${(e as Error).message}`, revisar: true });
      vibrar(40);
    } finally {
      setEntrando(false);
    }
  }, [nombre, pin, entrando]);

  const tecla = useCallback((d: string) => {
    setError(null);
    setPin((p) => (p.length < MAX_PIN ? p + d : p));
  }, []);
  const borrar = useCallback(() => setPin((p) => p.slice(0, -1)), []);

  // En la PC de caja se escribe con el teclado de verdad.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (/^[0-9]$/.test(e.key)) tecla(e.key);
      else if (e.key === "Backspace") borrar();
      else if (e.key === "Enter") acceder();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [tecla, borrar, acceder]);

  const puntos = Math.max(MIN_PIN, pin.length);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center px-6 pb-3"
         style={{ minHeight: "calc(100dvh - var(--header-alto) - var(--sa-top))",
                  paddingTop: "clamp(12px, 3dvh, 32px)" }}>
      {/* <img> y no next/image: es un SVG fijo, no hay nada que optimizar. */}
      <img src={MARCA.logo} alt={MARCA.nombre} width={MARCA.ancho} height={MARCA.alto}
           className="h-auto w-[min(256px,64vw)] object-contain"
           style={{ maxHeight: "21dvh", transform: "rotate(-3deg)",
                    filter: "drop-shadow(0 6px 14px rgb(0 0 0 / .5))" }} />

      <h1 className="display mt-[clamp(12px,3dvh,28px)] text-[22px] leading-6">¿Quién trabaja hoy?</h1>

      <div className="mt-3 flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Tu nombre">
        {previos.map((n) => (
          <button key={n} type="button" role="radio" aria-checked={!otro && nombre === n}
                  className={`chip ${!otro && nombre === n ? "chip-on" : ""}`}
                  onClick={() => { setNombre(n); setOtro(false); setError(null); }}>
            {n}
          </button>
        ))}
        {previos.length > 0 && (
          <button type="button" role="radio" aria-checked={otro}
                  className={`chip ${otro ? "chip-on" : ""}`}
                  onClick={() => { setOtro(true); setNombre(""); }}>
            + Otro
          </button>
        )}
      </div>
      {otro && (
        <input className="input mt-2.5 text-center" placeholder="Tu nombre" value={nombre}
               autoComplete="off" aria-label="Tu nombre" autoFocus={previos.length > 0}
               maxLength={40} enterKeyHint="next"
               onChange={(e) => { setNombre(e.target.value); setError(null); }} />
      )}

      <span className="rotulo mt-5">PIN de tu cuenta</span>
      <div key={temblor} className={`pin-puntos mt-3 ${temblor ? "temblar" : ""}`}
           role="img" aria-label={`${pin.length} números escritos`}>
        {Array.from({ length: puntos }, (_, i) => (
          <span key={i} data-lleno={i < pin.length ? "" : undefined} />
        ))}
      </div>

      <p role="alert" className="mt-2 min-h-5 text-center text-sm leading-snug" style={{ color: "var(--mal)" }}>
        {error?.texto}
        {error?.revisar && (
          <> <Link href="/configuracion" className="font-semibold underline" style={{ color: "var(--txt)" }}>
            Revisar en Estado
          </Link></>
        )}
      </p>

      <div className="mt-2 grid w-full max-w-[312px] grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className="tecla" disabled={entrando} onClick={() => tecla(d)}>
            {d}
          </button>
        ))}
        <button type="button" className="tecla tecla-borrar" aria-label="Borrar"
                disabled={entrando || pin.length === 0} onClick={borrar}>
          <Borrar size={28} />
        </button>
        <button type="button" className="tecla" disabled={entrando} onClick={() => tecla("0")}>0</button>
        <button type="button" className="tecla tecla-entrar" aria-label="Entrar"
                disabled={!listo} onClick={acceder}>
          {entrando ? <span className="text-base font-bold">…</span> : <Check size={30} />}
        </button>
      </div>
      {!nombre.trim() && pin.length >= MIN_PIN && (
        <p className="mt-2 text-sm" style={{ color: "var(--txt-2)" }}>Falta elegir tu nombre.</p>
      )}

      <Firma className="mt-auto pt-4" />
    </div>
  );
}
