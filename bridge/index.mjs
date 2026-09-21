#!/usr/bin/env node
/**
 * APPROCK - puente de impresion
 *
 * Corre en la PC de caja. Consulta la cola de impresion y manda los tickets
 * a la impresora termica por el puerto serial del emparejamiento Bluetooth.
 *
 * Por que consulta en vez de recibir: una PWA servida por HTTPS no puede
 * hacerle peticiones a http://192.168.x.x. El navegador lo bloquea por
 * contenido mixto y Private Network Access, y no hay forma de evitarlo desde
 * el sitio. Que el puente consulte resuelve eso y ademas hace que funcione
 * desde iPhone, que no tiene Web Bluetooth.
 *
 *   npm start                  arranca el servicio
 *   npm run puertos            lista los puertos serie disponibles
 *   npm run prueba             imprime un ticket de prueba y sale
 */

import { readFile } from "node:fs/promises";
import { Cola } from "./lib/cola.mjs";
import { PuertoImpresora } from "./lib/puerto.mjs";

// --- configuracion ---------------------------------------------------------
async function cargarEnv() {
  try {
    const txt = await readFile(new URL(".env", import.meta.url), "utf8");
    for (const linea of txt.split("\n")) {
      const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    // Sin .env se usan las variables del sistema.
  }
}

const hora = () => new Date().toLocaleTimeString("es-NI", { hour12: false });
const log = (m) => console.log(`${hora()}  ${m}`);

const INTERVALO_LATIDO_MS = 10_000;

// --- ticket de prueba (ESC/POS minimo, sin depender del build de Next) -----
/**
 * CP437, igual que la app (src/lib/escpos.ts, CODEPAGE_DEFAULT = 0).
 *
 * Antes esto declaraba CP1252 con `ESC t 16` y despues escribia los
 * codepoints Unicode crudos, que son Latin-1. Dos errores que se tapaban
 * entre si a medias: el selftest de la PT-210 reporta CP437, asi que la enie
 * salia como un simbolo cualquiera y el ticket de prueba hacia dudar de la
 * impresora cuando el que estaba mal era el puente.
 *
 * Las mayusculas con tilde NO existen en CP437; se mandan sin tilde, que es
 * lo que hace tambien el lado de la app.
 */
const CP437 = {
  "á": 0xa0, "é": 0x82, "í": 0xa1, "ó": 0xa2, "ú": 0xa3, "ü": 0x81,
  "ñ": 0xa4, "Ñ": 0xa5, "¿": 0xa8, "¡": 0xad,
  "Á": 0x41, "É": 0x45, "Í": 0x49, "Ó": 0x4f, "Ú": 0x55, "Ü": 0x55,
};

function ticketPrueba() {
  const ESC = 0x1b;
  const b = [
    ESC, 0x40,        // init
    ESC, 0x74, 0,     // codepage CP437, el que reporta el selftest
    ESC, 0x61, 1,     // centrado
  ];
  const texto =
    "PUENTE APPROCK\n" +
    "================================\n" +
    "Si lees esto, el puente puede\n" +
    "imprimir.\n" +
    "Acentos: Toña Jamón Española\n" +
    "================================\n";
  for (const ch of texto) {
    const mapeado = CP437[ch];
    if (mapeado !== undefined) { b.push(mapeado); continue; }
    const c = ch.codePointAt(0);
    b.push(c <= 0x7e ? c : 0x3f); // fuera de ASCII imprimible -> '?'
  }
  b.push(ESC, 0x64, 4); // avanzar 4 lineas
  return Buffer.from(b);
}

// --- bucle principal -------------------------------------------------------
async function main() {
  await cargarEnv();

  const simular = String(process.env.SIMULAR ?? "false").toLowerCase() === "true";
  const puerto = new PuertoImpresora({
    ruta: process.env.PUERTO ?? "COM5",
    baudios: Number(process.env.BAUDIOS ?? 9600),
    simular,
    log,
  });

  if (process.argv.includes("--listar-puertos")) {
    const lista = await PuertoImpresora.listarPuertos();
    if (lista.length === 0) {
      console.log("No se encontró ningún puerto serie.");
      console.log("En Windows: empareja la impresora y busca el puerto COM SALIENTE.");
    }
    for (const p of lista) {
      console.log(`${p.path}\t${p.manufacturer ?? ""}\t${p.friendlyName ?? ""}`);
    }
    return;
  }

  if (process.argv.includes("--prueba")) {
    await puerto.abrir();
    await puerto.escribir(ticketPrueba(), "prueba");
    log("Ticket de prueba enviado.");
    puerto.cerrar();
    return;
  }

  const cola = new Cola({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
    correo: process.env.SUPABASE_EMAIL,
    clave: process.env.SUPABASE_PASSWORD,
    log,
  });

  // Sin esto, desde el blindaje, la primera consulta a la cola devuelve
  // "permission denied" y el puente se queda mirando una cola vacia.
  await cola.entrar();

  const intervalo = Number(process.env.INTERVALO ?? 3000);
  log(`Puente iniciado. Consultando la cola cada ${intervalo}ms.`);
  log(simular ? "MODO SIMULADO (no imprime)" : `Impresora: ${puerto.ruta}`);

  try {
    await puerto.abrir();
  } catch (e) {
    // No es fatal: quiza la impresora esta apagada. Se reintenta por trabajo.
    log(`Aviso: no se pudo abrir el puerto todavía (${e.message})`);
  }

  let corriendo = true;
  let procesando = false;

  const apagar = () => {
    if (!corriendo) return;
    corriendo = false;
    log("Cerrando…");
    puerto.cerrar();
    process.exit(0);
  };
  process.on("SIGINT", apagar);
  process.on("SIGTERM", apagar);

  // Latido independiente del trabajo: la app tiene que poder distinguir
  // "no hay tickets" de "el puente esta caido".
  const latir = async () => {
    if (!corriendo) return;
    try {
      await cola.latir(puerto.conectado ? "impresora lista" : "impresora desconectada");
    } catch { /* red caida, se reintenta */ }
  };
  await latir();
  setInterval(latir, INTERVALO_LATIDO_MS);

  // Se procesa de a UNO: mandar dos tickets a la vez a una termica los
  // entrelaza y salen ilegibles.
  const tick = async () => {
    if (!corriendo || procesando) return;
    procesando = true;
    try {
      // El token dura una hora y este proceso corre dias. Sin renovarlo, a la
      // hora la cola empieza a responder "permission denied" y los tickets se
      // quedan pendientes sin que nadie se entere hasta que falta la comanda.
      await cola.renovarSiHaceFalta();
      const jobs = await cola.pendientes();
      for (const j of jobs) {
        if (!corriendo) break;
        const intentos = j.intentos + 1;
        try {
          await cola.marcar(j.id, "imprimiendo");
          const bytes = Buffer.from(j.payload_b64, "base64");
          await puerto.escribir(bytes, j.tipo);
          await cola.marcar(j.id, "impreso", { intentos });
          log(`Impreso ${j.tipo} (${j.id.slice(0, 8)}, ${bytes.length} bytes)`);
        } catch (e) {
          await cola.marcar(j.id, "error", { error: e.message, intentos });
          log(`ERROR en ${j.tipo} (intento ${intentos}): ${e.message}`);
          // Si fallo la impresora, no seguir reventando el resto de la cola.
          break;
        }
      }
    } catch (e) {
      log(`No se pudo consultar la cola: ${e.message}`);
    } finally {
      procesando = false;
    }
  };

  await tick();
  setInterval(tick, intervalo);
}

main().catch((e) => {
  console.error(`\nEl puente no pudo arrancar:\n  ${e.message}\n`);
  process.exit(1);
});
