import { aplicarBps, repartirProporcional } from "./money";
import type {
  ConfigCobro,
  Descuento,
  LineaCalculada,
  LineaOrden,
  Totales,
} from "./types";

/**
 * MOTOR DE PRECIOS
 *
 * Los precios del menu de Rock Munchies NO incluyen IVA.
 * Por lo tanto el IVA del 15% se SUMA sobre la base ya descontada.
 *
 * Orden de operaciones (importante, define lo que se cobra):
 *
 *   1. bruto de linea      = precioUnit * cantidad
 *   2. descuento categoria = se aplica solo a las lineas de ese grupo
 *                            (pizza / bebida)
 *   3. descuento general   = se aplica sobre el REMANENTE de todas las lineas
 *   4. base productos      = suma de (bruto - descuentos), nunca negativa
 *   5. envio               = no admite descuento, no genera propina, si paga IVA
 *   6. IVA 15%             = sobre (base productos + envio)
 *   7. propina 10%         = sobre base productos (configurable), opcional
 *   8. total               = base + envio + IVA + propina
 *
 * Consecuencia a tener presente: 10% a pizzas + 10% general NO es 20%.
 * El general cae sobre lo que ya quedo descontado, asi que el efectivo es 19%.
 */
export function calcularTotales(
  lineasEntrada: LineaOrden[],
  descuentos: Descuento[],
  config: ConfigCobro
): Totales {
  const lineas: LineaCalculada[] = lineasEntrada.map((l) => ({
    ...l,
    bruto: l.precioUnit * l.cantidad,
    descCategoria: 0,
    descGeneral: 0,
    descTotal: 0,
    neto: 0,
  }));

  const subtotalBruto = lineas.reduce((a, l) => a + l.bruto, 0);

  // --- Paso 2: descuentos de categoria -------------------------------------
  let descPizzas = 0;
  let descBebidas = 0;

  for (const grupo of ["pizza", "bebida"] as const) {
    const d = descuentos.find((x) => x.alcance === grupo);
    if (!d || d.valor <= 0) continue;

    const idx = lineas
      .map((l, i) => (l.grupo === grupo ? i : -1))
      .filter((i) => i >= 0);
    if (idx.length === 0) continue;

    const brutos = idx.map((i) => lineas[i].bruto);
    const totalGrupo = brutos.reduce((a, b) => a + b, 0);

    let montoDesc: number;
    if (d.tipo === "porcentaje") {
      montoDesc = aplicarBps(totalGrupo, Math.min(d.valor, 10000));
    } else {
      montoDesc = Math.min(d.valor, totalGrupo);
    }

    const reparto = repartirProporcional(montoDesc, brutos);
    idx.forEach((i, k) => {
      lineas[i].descCategoria = reparto[k];
    });

    const aplicado = reparto.reduce((a, b) => a + b, 0);
    if (grupo === "pizza") descPizzas = aplicado;
    else descBebidas = aplicado;
  }

  // --- Paso 3: descuento general sobre el remanente -------------------------
  let descGeneral = 0;
  const dGen = descuentos.find((x) => x.alcance === "general");
  if (dGen && dGen.valor > 0) {
    const remanentes = lineas.map((l) => l.bruto - l.descCategoria);
    const totalRemanente = remanentes.reduce((a, b) => a + b, 0);

    let montoDesc: number;
    if (dGen.tipo === "porcentaje") {
      montoDesc = aplicarBps(totalRemanente, Math.min(dGen.valor, 10000));
    } else {
      montoDesc = Math.min(dGen.valor, totalRemanente);
    }

    const reparto = repartirProporcional(montoDesc, remanentes);
    lineas.forEach((l, i) => {
      l.descGeneral = reparto[i];
    });
    descGeneral = reparto.reduce((a, b) => a + b, 0);
  }

  // --- Paso 4: netos --------------------------------------------------------
  for (const l of lineas) {
    l.descTotal = l.descCategoria + l.descGeneral;
    if (l.descTotal > l.bruto) l.descTotal = l.bruto; // nunca negativo
    l.neto = l.bruto - l.descTotal;
  }

  const baseProductos = lineas.reduce((a, l) => a + l.neto, 0);
  const descTotal = descPizzas + descBebidas + descGeneral;

  // --- Pasos 5 a 8 ----------------------------------------------------------
  const costoEnvio = Math.max(0, config.costoEnvio);
  const baseGravable = baseProductos + costoEnvio;
  const iva = aplicarBps(baseGravable, config.ivaBps);

  let propina = 0;
  if (config.cobrarPropina && config.propinaBps > 0) {
    const basePropina =
      config.propinaSobre === "base_con_iva"
        ? baseProductos + aplicarBps(baseProductos, config.ivaBps)
        : baseProductos;
    propina = aplicarBps(basePropina, config.propinaBps);
  }

  const total = baseGravable + iva + propina;

  return {
    lineas,
    subtotalBruto,
    descPizzas,
    descBebidas,
    descGeneral,
    descTotal,
    baseProductos,
    costoEnvio,
    baseGravable,
    iva,
    propina,
    total,
  };
}

/** Helper para la UI: 12.5% -> 1250 bps */
export const pctABps = (pct: number): number => Math.round(pct * 100);
export const bpsAPct = (bps: number): number => bps / 100;
