import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * El instalador tiene que saber de TODA columna que el codigo escribe.
 *
 * Esta prueba existe por un bug real: `mitades`, `precio_mitades` y
 * `ventas_pedidosya` se agregaron en `09_mitades_pedidosya.sql` y nunca se
 * doblaron dentro de `00_INSTALAR.sql`, que es el unico archivo que dice el
 * README que hay que pegar. Resultado: una base recien instalada rechazaba
 * CUALQUIER orden, porque la app escribe `orden.precio_mitades` siempre.
 *
 * Nada de eso se ve compilando ni corriendo las otras pruebas: el error
 * aparece recien en produccion, la primera vez que alguien cobra.
 */

const RAIZ = join(__dirname, "..", "..");
const SQL = readFileSync(join(RAIZ, "supabase", "00_INSTALAR.sql"), "utf8");

/** Claves que son opciones de supabase-js, no columnas. */
const NO_SON_COLUMNAS = new Set([
  "count", "head", "ascending", "onConflict", "returning", "defaultToNull",
]);

/** Archivos que le escriben a la base. */
function fuentesQueEscriben(): string[] {
  const salida: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name);
      if (e.isDirectory()) recorrer(ruta);
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) salida.push(ruta);
    }
  };
  recorrer(join(RAIZ, "src", "lib"));
  return salida;
}

/** Columnas que cada archivo escribe, por tabla. */
function columnasEscritas(): Map<string, Set<string>> {
  const porTabla = new Map<string, Set<string>>();
  for (const archivo of fuentesQueEscriben()) {
    const src = readFileSync(archivo, "utf8");
    const re = /\.from\("(\w+)"\)\s*\.\s*(?:insert|update|upsert)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      // Region entre el parentesis de apertura y el que lo cierra.
      const ini = re.lastIndex - 1;
      let prof = 0, fin = ini;
      for (let j = ini; j < src.length; j++) {
        if (src[j] === "(") prof++;
        else if (src[j] === ")" && --prof === 0) { fin = j; break; }
      }
      const cuerpo = src.slice(ini, fin);
      const set = porTabla.get(m[1]) ?? new Set<string>();
      for (const k of cuerpo.matchAll(/(?:^|[{,])\s*([a-z][a-z0-9_]*)\s*:/gm)) {
        if (!NO_SON_COLUMNAS.has(k[1])) set.add(k[1]);
      }
      porTabla.set(m[1], set);
    }
  }
  return porTabla;
}

/** El instalador declara esa columna, sea en el create o en un alter. */
const instaladorTiene = (columna: string) =>
  new RegExp(`(^|[\\s(,])${columna}([\\s,)]|$)`, "m").test(SQL);

describe("00_INSTALAR.sql cubre todo lo que el codigo escribe", () => {
  const porTabla = columnasEscritas();

  it("encuentra escrituras que revisar", () => {
    expect(porTabla.size).toBeGreaterThanOrEqual(4);
    expect(porTabla.get("orden_item")?.size ?? 0).toBeGreaterThan(10);
  });

  for (const [tabla, columnas] of porTabla) {
    it(`${tabla}: el instalador declara sus ${columnas.size} columnas`, () => {
      const faltan = [...columnas].filter((c) => !instaladorTiene(c));
      expect(faltan, `faltan en 00_INSTALAR.sql: ${faltan.join(", ")}`).toEqual([]);
    });
  }

  it("crea las tablas que el codigo lee o escribe", () => {
    for (const tabla of porTabla.keys()) {
      expect(SQL, `falta create table ${tabla}`)
        .toContain(`create table if not exists ${tabla}`);
    }
  });

  it("el enum de metodo_pago ya no ofrece pedidosya", () => {
    // Esa plata no pasa por la caja: se anota al cerrar el turno.
    const enumPago = SQL.match(/create type metodo_pago\s+as enum \(([^)]*)\)/);
    expect(enumPago?.[1]).toBeDefined();
    expect(enumPago![1]).not.toContain("pedidosya");
  });

  it("se puede volver a correr: nada crea sin proteccion", () => {
    const sinGuarda = [...SQL.matchAll(/^create (table|index|sequence)\s+(?!if not exists)/gim)];
    expect(sinGuarda.map((m) => m[0])).toEqual([]);
  });
});
