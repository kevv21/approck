/**
 * Encoder ESC/POS para GOOJPRT PT-210 (58mm / 48mm imprimibles / 384 puntos).
 *
 * Datos de la impresora que importan:
 *  - 32 caracteres por linea en Fuente A (16 en doble ancho)
 *  - NO tiene cortador automatico -> no enviar GS V, solo feed y cortan a mano
 *  - El set de caracteres por defecto imprime basura con acentos y enie;
 *    hay que seleccionar codepage con ESC t n antes de escribir texto
 */

/** Ancho de papel soportado, en mm. El spec pide ambos configurables. */
export type AnchoPapel = 58 | 80;

/**
 * Caracteres por linea en Fuente A.
 *  58mm -> 48mm imprimibles -> 384 puntos -> 32 columnas
 *  80mm -> 72mm imprimibles -> 576 puntos -> 48 columnas
 * A doble ancho, la mitad.
 */
export function columnasPara(ancho: AnchoPapel): number {
  return ancho === 80 ? 48 : 32;
}

/** Ancho por defecto: la PT-210 del local es de 58mm. */
export const COLUMNAS = 32;

const ESC = 0x1b;
const GS = 0x1d;

/**
 * Codepages que suelen traer estos clones. Si los acentos salen mal,
 * probalos en orden desde la pagina /estacion con el boton de prueba.
 */
/**
 * Codepages ordenados de mas a menos compatible.
 *
 * CP437 va primero porque es la linea base del estandar ESC/POS: toda
 * impresora termica lo implementa, y ya trae todo lo que necesita el espanol
 * en minusculas (a e i o u con tilde, n con virgulilla, ¿ y ¡). CP1252 es
 * comun pero NO universal, asi que como predeterminado dejaba fuera a las
 * impresoras mas viejas o mas baratas.
 *
 * Si ninguno funciona, quedan dos salidas que no dependen del firmware:
 * quitar acentos, o el modo imagen de raster.ts.
 */
export const CODEPAGES = [
  { n: 0, nombre: "CP437 - estandar, funciona en casi todas" },
  { n: 2, nombre: "CP850 - agrega mayusculas con tilde" },
  { n: 16, nombre: "CP1252 - Windows / Latin-1" },
] as const;

/** El mas compatible: es el que toda impresora ESC/POS trae. */
export const CODEPAGE_DEFAULT = 0;

const CLAVE_CP = "approck:codepage";
const CLAVE_TRANS = "approck:transliterar";

/**
 * Codepage elegido tras la prueba, recordado en este dispositivo.
 * Cada impresora puede traer uno distinto segun el lote, asi que la eleccion
 * es por dispositivo y no un ajuste global.
 */
export function codepageGuardado(): number {
  try {
    const v = localStorage.getItem(CLAVE_CP);
    return v !== null ? Number(v) : CODEPAGE_DEFAULT;
  } catch { return CODEPAGE_DEFAULT; }
}

export function guardarCodepage(n: number): void {
  try { localStorage.setItem(CLAVE_CP, String(n)); } catch { /* modo privado */ }
}

export function transliterarGuardado(): boolean {
  try { return localStorage.getItem(CLAVE_TRANS) === "1"; } catch { return false; }
}

export function guardarTransliterar(v: boolean): void {
  try { localStorage.setItem(CLAVE_TRANS, v ? "1" : "0"); } catch { /* noop */ }
}

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
 * TABLAS DE CODIFICACION POR CODEPAGE
 *
 * `ESC t n` le dice a la impresora como INTERPRETAR los bytes, pero no
 * convierte nada: hay que mandarle los bytes correctos para ese codepage.
 * Mandar bytes CP1252 con el codepage puesto en CP850 imprime basura, que
 * es exactamente lo que hacia el selector antes de estas tablas.
 *
 * CP1252 no lleva tabla: en 0xA0-0xFF coincide con Latin-1, asi que el punto
 * de codigo Unicode ya es el byte correcto.
 */
const CP437: Record<string, number> = {
  "ç": 0x87, "ü": 0x81, "é": 0x82, "â": 0x83, "ä": 0x84,
  "à": 0x85, "å": 0x86, "ê": 0x88, "ë": 0x89, "è": 0x8a,
  "ï": 0x8b, "î": 0x8c, "ì": 0x8d, "Ä": 0x8e, "Å": 0x8f,
  "É": 0x90, "ô": 0x93, "ö": 0x94, "ò": 0x95, "û": 0x96,
  "ù": 0x97, "ÿ": 0x98, "Ö": 0x99, "Ü": 0x9a,
  "á": 0xa0, "í": 0xa1, "ó": 0xa2, "ú": 0xa3,
  "ñ": 0xa4, "Ñ": 0xa5, "ª": 0xa6, "º": 0xa7, "¿": 0xa8,
  "½": 0xab, "¼": 0xac, "¡": 0xad, "«": 0xae, "»": 0xaf,
};

/** CP850 comparte casi todo con CP437 y ademas SI trae mayusculas acentuadas. */
const CP850: Record<string, number> = {
  ...CP437,
  "Á": 0xb5, "Â": 0xb6, "À": 0xb7, "Ã": 0xc6, "ã": 0xc7,
  "Ê": 0xd2, "Ë": 0xd3, "È": 0xd4, "Í": 0xd6,
  "Î": 0xd7, "Ï": 0xd8, "Ì": 0xde, "Ó": 0xe0, "Ô": 0xe2,
  "Ò": 0xe3, "õ": 0xe4, "Õ": 0xe5, "Ú": 0xe9, "Û": 0xea,
  "Ù": 0xeb, "°": 0xf8,
};

const TABLAS: Record<number, Record<string, number>> = { 0: CP437, 2: CP850 };

/** Tablas inversas, para poder leer de vuelta lo que se codifico. */
const INVERSAS: Record<number, Record<number, string>> = Object.fromEntries(
  Object.entries(TABLAS).map(([cp, tabla]) => [
    Number(cp),
    Object.fromEntries(Object.entries(tabla).map(([ch, b]) => [b, ch])),
  ])
);

/**
 * Decodifica bytes de un codepage a texto.
 * Lo usa la vista previa: sin esto, la pantalla muestra basura en cuanto el
 * codepage deja de ser CP1252, y la caja aprueba un recibo que no es el que
 * sale.
 */
export function desdeBytes(bytes: number[] | Uint8Array, codepage: number): string {
  const inv = INVERSAS[codepage];
  let out = "";
  for (const b of bytes) {
    if (b < 0x80) { out += String.fromCharCode(b); continue; }
    out += inv ? (inv[b] ?? "?") : String.fromCharCode(b);
  }
  return out;
}

/**
 * Convierte texto a los bytes del codepage indicado.
 * Lo que no existe en ese codepage se transcribe sin acento, que siempre es
 * legible, en vez de imprimir un simbolo al azar.
 */
export function aBytes(s: string, codepage: number): number[] {
  const tabla = TABLAS[codepage];
  const out: number[] = [];

  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) { out.push(c); continue; }

    if (tabla) {
      const b = tabla[ch];
      if (b !== undefined) { out.push(b); continue; }
    } else if (c <= 0xff) {
      out.push(c); // CP1252 / Latin-1: el punto de codigo ya es el byte
      continue;
    }

    for (const a of SIN_ACENTO[ch] ?? "?") out.push(a.charCodeAt(0));
  }
  return out;
}

export interface OpcionesEncoder {
  codepage?: number;
  /** true = quitar acentos antes de imprimir (a prueba de balas) */
  transliterar?: boolean;
  /** 58 (PT-210) u 80 mm */
  ancho?: AnchoPapel;
}

export class EscPos {
  private buf: number[] = [];
  private opts: Required<OpcionesEncoder>;
  /** Columnas utiles del papel configurado. */
  readonly columnas: number;

  constructor(opts: OpcionesEncoder = {}) {
    this.opts = {
      codepage: opts.codepage ?? CODEPAGE_DEFAULT,
      transliterar: opts.transliterar ?? false,
      ancho: opts.ancho ?? 58,
    };
    this.columnas = columnasPara(this.opts.ancho);
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
    this.buf.push(...aBytes(limpio, this.opts.codepage));
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
    return this.linea(ch.repeat(this.columnas));
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

/**
 * "Subtotal             1,160.00" - etiqueta izquierda, valor derecha.
 *
 * Cuando etiqueta y valor llenan la linea EXACTA (espacio 0) se pegan sin
 * separador, en vez de recortar: recortar ahi mutilaba numeros de recibo
 * como "Pre-cuenta #0142", que cabe justo.
 */
export function parLineado(etiqueta: string, valor: string, ancho = COLUMNAS): string {
  const espacio = ancho - etiqueta.length - valor.length;
  if (espacio >= 0) return etiqueta + " ".repeat(espacio) + valor;
  // No cabe de ninguna forma: se recorta la etiqueta, nunca el valor.
  const max = Math.max(0, ancho - valor.length - 1);
  return (etiqueta.slice(0, max) + " " + valor).slice(0, ancho);
}

export function centrar(s: string, ancho = COLUMNAS): string {
  if (s.length >= ancho) return s.slice(0, ancho);
  const izq = Math.floor((ancho - s.length) / 2);
  return " ".repeat(izq) + s;
}
