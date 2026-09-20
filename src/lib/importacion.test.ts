import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GUARDA CONTRA EL BUG QUE TUMBÓ EL DESPLIEGUE
 *
 * Next prerenderiza las páginas en Node, sin `window` ni `document` y sin las
 * variables de entorno del navegador. Cualquier módulo que haga trabajo real
 * al importarse —crear un cliente, leer localStorage, tocar navigator— rompe
 * la compilación entera, y el error sale como un stack trace de un chunk
 * minificado, sin decir qué archivo lo causó.
 *
 * Eso fue exactamente lo que pasó: `createClient("")` al cargar el módulo,
 * con una variable de entorno declarada pero vacía.
 *
 * En vez de arreglar ese caso y seguir, esta prueba recorre TODOS los módulos
 * y falla si alguno no sobrevive a ser importado en un entorno de servidor.
 */

const RAIZ = new URL("..", import.meta.url).pathname; // src/

function modulos(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const ruta = join(dir, e);
    if (statSync(ruta).isDirectory()) { out.push(...modulos(ruta)); continue; }
    if (!/\.tsx?$/.test(e)) continue;
    if (/\.test\.tsx?$/.test(e)) continue;
    // Las páginas y componentes de React necesitan el runtime de Next para
    // importarse; el build ya las cubre. Acá van las librerías.
    if (ruta.includes("/app/") || ruta.includes("/components/")) continue;
    out.push(ruta);
  }
  return out;
}

const encontrados = modulos(join(RAIZ, "lib"));

describe("todo módulo sobrevive a importarse en el servidor", () => {
  it("encuentra módulos que revisar", () => {
    expect(encontrados.length).toBeGreaterThan(10);
  });

  for (const ruta of encontrados) {
    const nombre = relative(RAIZ, ruta);
    it(`sin variables de entorno ni navegador: ${nombre}`, async () => {
      const previas = {
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      };
      // El caso que falló en Vercel: declaradas pero vacías.
      process.env.NEXT_PUBLIC_SUPABASE_URL = "";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
      try {
        await expect(import(/* @vite-ignore */ ruta)).resolves.toBeDefined();
      } finally {
        process.env.NEXT_PUBLIC_SUPABASE_URL = previas.url ?? "";
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previas.key ?? "";
      }
    });
  }
});
