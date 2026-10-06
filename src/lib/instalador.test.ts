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
    // Las columnas que se arman en una funcion aparte (para que crear y
    // editar escriban lo mismo) llevan `@escribe <tabla>` en su comentario.
    for (const [tabla, cuerpo] of cuerposMarcados(src)) {
      const set = porTabla.get(tabla) ?? new Set<string>();
      for (const k of clavesDe(cuerpo)) set.add(k);
      porTabla.set(tabla, set);
    }
  }
  return porTabla;
}

/** Claves de nivel superior y anidadas de un literal de objeto. */
function clavesDe(cuerpo: string): string[] {
  return [...cuerpo.matchAll(/(?:^|[{,])\s*([a-z][a-z0-9_]*)\s*:/gm)]
    .map((k) => k[1]).filter((k) => !NO_SON_COLUMNAS.has(k));
}

/** [tabla, literal devuelto] de cada funcion marcada con `@escribe tabla`. */
function cuerposMarcados(src: string): [string, string][] {
  const salida: [string, string][] = [];
  for (const m of src.matchAll(/@escribe (\w+)/g)) {
    const desde = m.index! + m[0].length;
    const ret = /return\s+(?:[\w.]+\.map\(\([^)]*\)\s*=>\s*\()?\{/g;
    ret.lastIndex = desde;
    const r = ret.exec(src);
    if (!r) continue;
    const ini = r.index + r[0].length - 1;
    let prof = 0, fin = ini;
    for (let j = ini; j < src.length; j++) {
      if (src[j] === "{") prof++;
      else if (src[j] === "}" && --prof === 0) { fin = j; break; }
    }
    salida.push([m[1], src.slice(ini, fin)]);
  }
  return salida;
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

describe("editar_orden no pierde columnas al editar", () => {
  const REPO = readFileSync(join(RAIZ, "src", "lib", "repo.ts"), "utf8");
  const marcados = new Map(cuerposMarcados(REPO));
  const funcion = SQL.slice(SQL.indexOf("create or replace function editar_orden"));
  const cuerpoFn = funcion.slice(0, funcion.indexOf("end $$;"));

  it("encuentra las dos listas", () => {
    expect(marcados.get("orden")).toBeDefined();
    expect(marcados.get("orden_item")).toBeDefined();
    expect(cuerpoFn.length).toBeGreaterThan(500);
  });

  // Si a `columnasOrden` se le agrega una columna y a la funcion no, crear
  // la guarda y editar la deja como estaba, sin ningun error. Es el mismo
  // tipo de fallo silencioso que `precio_mitades`.
  it("cada columna de orden que la app escribe se actualiza", () => {
    const faltan = clavesDe(marcados.get("orden") ?? "")
      .filter((c) => !new RegExp(`\\b${c}\\s*=`).test(cuerpoFn));
    expect(faltan, `faltan en editar_orden: ${faltan.join(", ")}`).toEqual([]);
  });

  it("cada columna de orden_item se vuelve a insertar", () => {
    const insert = cuerpoFn.slice(cuerpoFn.indexOf("insert into orden_item"));
    const lista = insert.slice(insert.indexOf("("), insert.indexOf(")"));
    const faltan = clavesDe(marcados.get("orden_item") ?? "")
      .filter((c) => !new RegExp(`\\b${c}\\b`).test(lista));
    expect(faltan, `faltan en el insert de editar_orden: ${faltan.join(", ")}`).toEqual([]);
  });
});
