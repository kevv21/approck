#!/usr/bin/env node
/**
 * APPROCK — configurar Vercel de una sentada.
 *
 *   node scripts/configurar-vercel.mjs
 *
 * Existe porque el formulario del panel de Vercel es donde se rompe esto una
 * y otra vez: se guarda la variable con el campo Value vacio, o el valor cae
 * en Note, o queda marcada Sensitive y ya no se puede releer para comprobar.
 * Aqui los valores se validan ANTES de mandarlos, se escriben en los tres
 * entornos, y al final se comprueba que hayan llegado de verdad al codigo
 * desplegado — que es lo unico que cuenta.
 *
 * Funciona igual en Windows, macOS y Linux: es Node, no bash.
 */

import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const VARIABLES = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const ENTORNOS = ["production", "preview", "development"];

const c = {
  bien: (t) => `\x1b[32m${t}\x1b[0m`,
  mal: (t) => `\x1b[31m${t}\x1b[0m`,
  ojo: (t) => `\x1b[33m${t}\x1b[0m`,
  tit: (t) => `\x1b[1m${t}\x1b[0m`,
};

/** Corre un comando dejando que se vea, y devuelve si salio bien. */
function correr(args, { entrada, silencioso = false } = {}) {
  const r = spawnSync("npx", ["--yes", "vercel", ...args], {
    input: entrada,
    stdio: entrada !== undefined
      ? ["pipe", silencioso ? "pipe" : "inherit", "pipe"]
      : (silencioso ? "pipe" : "inherit"),
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return { ok: r.status === 0, salida: (r.stdout ?? "") + (r.stderr ?? "") };
}

// --- validaciones: los errores se atrapan aqui, no en el despliegue -------

function revisarUrl(v) {
  if (!v) return "está vacía.";
  if (/\s/.test(v)) return "tiene un espacio. Cópiala otra vez, sin espacios ni saltos de línea.";
  if (/^["'].*["']$/.test(v)) return "lleva comillas. Va sin comillas.";
  if (!v.startsWith("https://")) return "no empieza por https://";
  if (v.includes("xxxxxxxx")) return "todavía es el texto de ejemplo.";
  if (!v.endsWith(".supabase.co")) {
    return "no termina en .supabase.co — ¿copiaste la URL del panel en vez de la Project URL?";
  }
  return null;
}

/** La equivocacion cara: la clave secreta funciona, y por eso no se nota. */
function revisarClave(v) {
  if (!v) return "está vacía.";
  if (/\s/.test(v)) return "tiene un espacio. Cópiala otra vez.";
  if (v.startsWith("sb_secret_")) {
    return "es la SECRET key. Esa salta todas las políticas y acabaría dentro " +
           "del código que descarga el navegador. Usa la Publishable.";
  }
  if (v.startsWith("sb_publishable_")) return null;
  const partes = v.split(".");
  if (partes.length === 3) {
    try {
      const n = partes[1].replace(/-/g, "+").replace(/_/g, "/");
      const rol = JSON.parse(
        Buffer.from(n + "=".repeat((4 - (n.length % 4)) % 4), "base64").toString()
      )?.role;
      if (rol === "service_role") {
        return "es la SERVICE_ROLE. Esa salta todas las políticas y acabaría " +
               "dentro del código que descarga el navegador. Usa la Publishable.";
      }
      if (rol === "anon") return null;
    } catch { /* ilegible */ }
  }
  return "no parece una clave de Supabase. Debería empezar por sb_publishable_";
}

// --- guion ----------------------------------------------------------------

const rl = createInterface({ input: stdin, output: stdout });
const preguntar = (t) => rl.question(t);

console.log(c.tit("\n  APPROCK — configurar Vercel\n"));

console.log(c.tit("1/5  Entrar en Vercel"));
console.log("     Se abre el navegador. Si ya entraste, pasa solo.\n");
if (!correr(["whoami"], { silencioso: true }).ok) {
  if (!correr(["login"]).ok) {
    console.log(c.mal("\n  No se pudo entrar en Vercel. Inténtalo otra vez.\n"));
    process.exit(1);
  }
}

console.log(c.tit("\n2/5  Enlazar esta carpeta con el proyecto"));
if (!correr(["link", "--yes"]).ok) {
  console.log(c.ojo("\n  Elige el proyecto a mano:"));
  if (!correr(["link"]).ok) process.exit(1);
}

console.log(c.tit("\n3/5  Qué tiene Vercel guardado ahora mismo"));
const previo = correr(["env", "ls"], { silencioso: true });
console.log(previo.salida.trim() || "  (nada)");

console.log(c.tit("\n4/5  Los valores nuevos"));
console.log("     Supabase → Project Settings → API\n");

const valores = {};
for (const [nombre, revisar, pista] of [
  [VARIABLES[0], revisarUrl, "Project URL  (https://….supabase.co)"],
  [VARIABLES[1], revisarClave, "Publishable key  (sb_publishable_…)"],
]) {
  for (;;) {
    const v = (await preguntar(`  ${pista}\n  > `)).trim();
    const problema = revisar(v);
    if (!problema) { valores[nombre] = v; console.log(c.bien("  ✓ tiene buena pinta\n")); break; }
    console.log(c.mal(`  ✗ ${problema}\n`));
  }
}

console.log(c.tit("5/5  Escribirlas en los tres entornos y redesplegar\n"));
for (const nombre of VARIABLES) {
  for (const entorno of ENTORNOS) {
    // Se borra primero: `env add` sobre una que ya existe falla en vez de
    // pisarla, y ese fallo es justo el que deja el valor viejo puesto.
    correr(["env", "rm", nombre, entorno, "--yes"], { silencioso: true });
    const r = correr(["env", "add", nombre, entorno], {
      entrada: valores[nombre] + "\n", silencioso: true,
    });
    console.log(r.ok ? c.bien(`  ✓ ${nombre} → ${entorno}`)
                     : c.mal(`  ✗ ${nombre} → ${entorno}: ${r.salida.trim()}`));
  }
}

console.log(c.tit("\n  Redesplegando (sin caché, o se reusa el build viejo)…\n"));
const desp = correr(["--prod", "--force"], { silencioso: true });
console.log(desp.salida.trim().split("\n").slice(-6).join("\n"));

// --- la unica comprobacion que vale: ¿llego al codigo desplegado? ---------
const url = desp.salida.match(/https:\/\/[^\s]+\.vercel\.app/g)?.pop();
if (!url) {
  console.log(c.ojo("\n  No se pudo leer la URL del despliegue. Compruébalo a mano en /configuracion.\n"));
  await rl.close();
  process.exit(0);
}

console.log(c.tit(`\n  Comprobando ${url} …`));
const host = valores[VARIABLES[0]].replace("https://", "");
let encontrado = false;
try {
  const html = await (await fetch(url)).text();
  const chunks = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) =>
    m[1].startsWith("http") ? m[1] : url + m[1]);
  for (const ch of chunks) {
    if ((await (await fetch(ch)).text()).includes(host)) { encontrado = true; break; }
  }
} catch (e) {
  console.log(c.ojo(`  No se pudo descargar: ${e.message}`));
}

console.log(encontrado
  ? c.bien(`\n  ✓ LISTO. La URL de Supabase está dentro del código desplegado.\n` +
           `    Abre ${url}/configuracion para seguir.\n`)
  : c.mal(`\n  ✗ Las variables se guardaron, pero NO aparecen en el código.\n` +
          `    Revisa en Vercel que el proyecto enlazado sea el correcto.\n`));

await rl.close();
