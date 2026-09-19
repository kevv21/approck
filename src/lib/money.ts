/**
 * Todo el dinero en el sistema se maneja como ENTEROS de centavos.
 * C$260.00 => 26000
 *
 * Nunca uses float para dinero: 0.1 + 0.2 !== 0.3 y en un cierre de caja
 * eso aparece como una diferencia de centavos que nadie puede explicar.
 */

/** Porcentajes en basis points: 1500 = 15.00%, 1000 = 10.00% */
export type Bps = number;

export const centavos = (cordobas: number): number => Math.round(cordobas * 100);
export const aCordobas = (c: number): number => c / 100;

/** Aplica un porcentaje en bps sobre un monto en centavos, redondeando al centavo. */
export function aplicarBps(montoCentavos: number, bps: Bps): number {
  return Math.round((montoCentavos * bps) / 10000);
}

/** "1,285.50" */
export function fmt(centavosMonto: number): string {
  const neg = centavosMonto < 0;
  const abs = Math.abs(centavosMonto);
  const entero = Math.floor(abs / 100).toLocaleString("en-US");
  const dec = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}${entero}.${dec}`;
}

/** "C$ 1,285.50" */
export const fmtC = (centavosMonto: number): string => `C$ ${fmt(centavosMonto)}`;

/**
 * Reparte `monto` entre varias lineas en proporcion a `pesos`, garantizando
 * que la suma del resultado sea EXACTAMENTE `monto` (metodo del mayor resto).
 *
 * Sin esto, un descuento fijo de C$100 repartido entre 3 lineas da 33.33 x 3
 * = 99.99 y el ticket no cuadra con el cierre.
 */
export function repartirProporcional(monto: number, pesos: number[]): number[] {
  const totalPesos = pesos.reduce((a, b) => a + b, 0);
  if (totalPesos <= 0 || monto <= 0) return pesos.map(() => 0);

  // Nunca repartir mas de lo que existe.
  const m = Math.min(monto, totalPesos);

  const crudo = pesos.map((p) => (m * p) / totalPesos);
  const out = crudo.map(Math.floor);
  const repartido = out.reduce((a, b) => a + b, 0);
  let resto = m - repartido;

  // Los centavos sobrantes van a las lineas con mayor parte fraccionaria.
  const orden = crudo
    .map((c, i) => ({ i, frac: c - Math.floor(c) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  let k = 0;
  while (resto > 0 && orden.length > 0) {
    const idx = orden[k % orden.length].i;
    if (out[idx] < pesos[idx]) {
      out[idx] += 1;
      resto -= 1;
    }
    k += 1;
    if (k > orden.length * 2 + monto) break; // guarda anti-loop
  }
  return out;
}
