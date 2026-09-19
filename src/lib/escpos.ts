/**
 * Encoder ESC/POS para GOOJPRT PT-210 (58mm / 48mm imprimibles / 384 puntos).
 *
 * Datos de la impresora que importan:
 *  - 32 caracteres por linea en Fuente A (16 en doble ancho)
 *  - NO tiene cortador automatico -> no enviar GS V, solo feed y cortan a mano
 *  - El set de caracteres por defecto imprime basura con acentos y enie;
 *    hay que seleccionar codepage con ESC t n antes de escribir texto
 */

export const COLUMNAS = 32;

const ESC = 0x1b;
const GS = 0x1d;

/**
 * Codepages que suelen traer estos clones. Si los acentos salen mal,
 * probalos en orden desde la pagina /estacion con el boton de prueba.
 */
export const CODEPAGES = [
  { n: 16, nombre: "CP1252 (Latin-1) - probar primero" },
  { n: 2, nombre: "CP850 (Multilingual)" },
  { n: 0, nombre: "CP437 (USA/Standard)" },
] as const;

const SIN_ACENTO: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n",
  Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ü: "U", Ñ: "N",
  "¿": "?", "¡": "!", "°": "o", "–": "-", "—": "-",
  "“": '"', "”": '"', "‘": "'", "’": "'",
};

/**
 * Quita acentos. Fallback garantizado si ningun codepage funciona.
 * Preserva saltos de linea y tabulaciones: son control de formato, no texto,
 * y convertirlos en "?" destruye el maquetado del ticket.
 */
export function transliterar(s: string): string {
  return s.replace(/[^\x20-\x7E\n\r\t]/g, (c) => SIN_ACENTO[c] ?? "?");
}

/**
 * CP1252 coincide con Latin-1 en el rango 0xA0-0xFF, que cubre todo el
 * espanol (a=0xE1, e=0xE9, i=0xED, o=0xF3, u=0xFA, n=0xF1, N=0xD1).
 */
function aBytesCp1252(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c <= 0xff) out.push(c);
    else {
      const alt = SIN_ACENTO[ch] ?? "?";
      for (const a of alt) out.push(a.charCodeAt(0));
    }
  }
  return out;
}

export interface OpcionesEncoder {
  codepage?: number;
  /** true = quitar acentos antes de imprimir (a prueba de balas) */
  transliterar?: boolean;
}

export class EscPos {
  private buf: number[] = [];
  private opts: Required<OpcionesEncoder>;

  constructor(opts: OpcionesEncoder = {}) {
    this.opts = {
      codepage: opts.codepage ?? 16,
      transliterar: opts.transliterar ?? false,
    };
  }

  /** ESC @ - reset, y seleccion de codepage */
  init(): this {
    this.buf.push(ESC, 0x40);
    this.buf.push(ESC, 0x74, this.opts.codepage);
    return this;
  }

  /** ESC a n : 0 izquierda, 1 centro, 2 derecha */
  alinear(a: 0 | 1 | 2): this {
    this.buf.push(ESC, 0x61, a);
    return this;
  }

  /** ESC E n */
  negrita(on: boolean): this {
    this.buf.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  /** GS ! n - ancho/alto en multiplos (0..7). Cuidado: doble ancho = 16 cols */
  tamano(ancho: 0 | 1, alto: 0 | 1): this {
    this.buf.push(GS, 0x21, (ancho << 4) | alto);
    return this;
  }

  texto(s: string): this {
    const limpio = this.opts.transliterar ? transliterar(s) : s;
    this.buf.push(...aBytesCp1252(limpio));
    return this;
  }

  linea(s = ""): this {
    return this.texto(s).nl();
  }

  nl(n = 1): this {
    for (let i = 0; i < n; i++) this.buf.push(0x0a);
    return this;
  }

  /** ESC d n - avanzar n lineas */
  avanzar(n: number): this {
    this.buf.push(ESC, 0x64, n);
    return this;
  }

  separador(ch = "-"): this {
    return this.linea(ch.repeat(COLUMNAS));
  }

  bytes(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

// ---------------------------------------------------------------------------
// Helpers de maquetado a 32 columnas
// ---------------------------------------------------------------------------

/** Parte un texto en lineas de `ancho` respetando palabras. */
export function envolver(texto: string, ancho: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let actual = "";

  for (const p of palabras) {
    if (p.length > ancho) {
      // Palabra mas larga que la columna: cortar a la fuerza.
      if (actual) { out.push(actual); actual = ""; }
      let resto = p;
      while (resto.length > ancho) {
        out.push(resto.slice(0, ancho));
        resto = resto.slice(ancho);
      }
      actual = resto;
      continue;
    }
    if (!actual) actual = p;
    else if (actual.length + 1 + p.length <= ancho) actual += " " + p;
    else { out.push(actual); actual = p; }
  }
  if (actual) out.push(actual);
  return out.length ? out : [""];
}

/** "Subtotal             1,160.00" - etiqueta izquierda, valor derecha. */
export function parLineado(etiqueta: string, valor: string, ancho = COLUMNAS): string {
  const espacio = ancho - etiqueta.length - valor.length;
  if (espacio < 1) {
    return (etiqueta.slice(0, Math.max(0, ancho - valor.length - 1)) + " " + valor).slice(0, ancho);
  }
  return etiqueta + " ".repeat(espacio) + valor;
}

export function centrar(s: string, ancho = COLUMNAS): string {
  if (s.length >= ancho) return s.slice(0, ancho);
  const izq = Math.floor((ancho - s.length) / 2);
  return " ".repeat(izq) + s;
}
