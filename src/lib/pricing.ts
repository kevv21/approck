import {
  aCentavosDesdeEscala,
  aEscala,
  aplicarBpsEscalado,
  desglosarIva,
  repartirProporcional,
} from "./money";
import type {
  ConfigCobro,
  Descuento,
  LineaCalculada,
  LineaOrden,
  TipoDescuento,
  Totales,
} from "./types";

/**
 * MOTOR DE PRECIOS — funcion pura, unica fuente de verdad de los montos.
 *
 * Orden de operaciones (docs/SPEC.md, "Calculo del recibo"):
 *
 *   1. bruto de linea   = (precio unitario + modificadores) * cantidad
 *   2. descuento de linea (manual, sobre esa linea)
 *   3. descuento de categoria (pizzas / bebidas) sobre el remanente del grupo
 *   4. descuento general sobre el remanente de todas las lineas
 *   5. desglose por linea: base imponible e IVA, saltando productos exentos
 *   6. envio: sin descuento, sin propina, y con IVA solo si `envioGravado`
 *   7. propina sobre el subtotal sin IVA (configurable), nunca gravada
 *   8. total = base + IVA + envio + propina
 *
 * Dos consecuencias que conviene tener presentes:
 *
 * - Apilar descuentos no suma: el general cae sobre lo que ya quedo
 *   descontado, asi que 10% a pizzas + 10% general da 19% efectivo, no 20%.
 * - Todo el calculo interno corre en milesimas de centavo (enteros) y solo se
 *   redondea al construir los totales visibles, para que el IVA salga de una
 *   base sin redondear y los errores no se acumulen linea a linea.
 */
export function calcularTotales(
  lineasEntrada: LineaOrden[],
  descuentos: Descuento[],
  config: ConfigCobro
): Totales {
  const { ivaBps, preciosIncluyenIva } = config;

  // --- Paso 1: bruto por linea, en escala interna ---------------------------
  const brutos = lineasEntrada.map((l) => {
    const recargos = (l.modificadores ?? []).reduce((a, m) => a + m.precio, 0);
    return aEscala((l.precioUnit + recargos) * l.cantidad);
  });

  const descLinea = new Array(lineasEntrada.length).fill(0);
  const descCat = new Array(lineasEntrada.length).fill(0);
  const descGen = new Array(lineasEntrada.length).fill(0);

  const montoDescuento = (
    tipo: TipoDescuento,
    valor: number,
    baseEscalada: number
  ): number =>
    tipo === "porcentaje"
      ? aplicarBpsEscalado(baseEscalada, Math.min(valor, 10000))
      : Math.min(aEscala(valor), baseEscalada);

  // --- Paso 2: descuento manual por linea -----------------------------------
  lineasEntrada.forEach((l, i) => {
    if (!l.descuentoLinea || l.descuentoLinea.valor <= 0) return;
    descLinea[i] = montoDescuento(
      l.descuentoLinea.tipo,
      l.descuentoLinea.valor,
      brutos[i]
    );
  });

  // --- Paso 3: descuentos de categoria --------------------------------------
  let descPizzasEsc = 0;
  let descBebidasEsc = 0;

  for (const grupo of ["pizza", "bebida"] as const) {
    const d = descuentos.find((x) => x.alcance === grupo);
    if (!d || d.valor <= 0) continue;

    const idx = lineasEntrada
      .map((l, i) => (l.grupo === grupo ? i : -1))
      .filter((i) => i >= 0);
    if (idx.length === 0) continue;

    const remanentes = idx.map((i) => brutos[i] - descLinea[i]);
    const totalGrupo = remanentes.reduce((a, b) => a + b, 0);
    const monto = montoDescuento(d.tipo, d.valor, totalGrupo);

    const reparto = repartirProporcional(monto, remanentes);
    idx.forEach((i, k) => { descCat[i] = reparto[k]; });

    const aplicado = reparto.reduce((a, b) => a + b, 0);
    if (grupo === "pizza") descPizzasEsc = aplicado;
    else descBebidasEsc = aplicado;
  }

  // --- Paso 4: descuento general sobre el remanente -------------------------
  let descGeneralEsc = 0;
  const dGen = descuentos.find((x) => x.alcance === "general");
  if (dGen && dGen.valor > 0) {
    const remanentes = brutos.map((b, i) => b - descLinea[i] - descCat[i]);
    const totalRemanente = remanentes.reduce((a, b) => a + b, 0);
    const monto = montoDescuento(dGen.tipo, dGen.valor, totalRemanente);

    const reparto = repartirProporcional(monto, remanentes);
    reparto.forEach((v, i) => { descGen[i] = v; });
    descGeneralEsc = reparto.reduce((a, b) => a + b, 0);
  }

  // --- Paso 5: desglose por linea -------------------------------------------
  let baseGravadaEsc = 0;
  let baseExentaEsc = 0;
  let ivaProductosEsc = 0;

  const lineas: LineaCalculada[] = lineasEntrada.map((l, i) => {
    const descTotalEsc = Math.min(
      descLinea[i] + descCat[i] + descGen[i],
      brutos[i]
    );
    const netoEsc = brutos[i] - descTotalEsc;
    const gravada = l.aplicaIva !== false;

    let baseEsc: number;
    let ivaEsc: number;
    if (!gravada) {
      baseEsc = netoEsc;
      ivaEsc = 0;
    } else if (preciosIncluyenIva) {
      // El precio ya trae el IVA dentro: se desglosa hacia atras.
      const d = desglosarIva(netoEsc, ivaBps);
      baseEsc = d.base;
      ivaEsc = d.iva;
    } else {
      baseEsc = netoEsc;
      ivaEsc = aplicarBpsEscalado(netoEsc, ivaBps);
    }

    if (gravada) baseGravadaEsc += baseEsc;
    else baseExentaEsc += baseEsc;
    ivaProductosEsc += ivaEsc;

    return {
      ...l,
      bruto: aCentavosDesdeEscala(brutos[i]),
      descLinea: aCentavosDesdeEscala(descLinea[i]),
      descCategoria: aCentavosDesdeEscala(descCat[i]),
      descGeneral: aCentavosDesdeEscala(descGen[i]),
      descTotal: aCentavosDesdeEscala(descTotalEsc),
      neto: aCentavosDesdeEscala(netoEsc),
      base: aCentavosDesdeEscala(baseEsc),
      iva: aCentavosDesdeEscala(ivaEsc),
    };
  });

  // --- Paso 6: envio ---------------------------------------------------------
  const envioEsc = aEscala(Math.max(0, config.costoEnvio));
  const ivaEnvioEsc = config.envioGravado
    ? aplicarBpsEscalado(envioEsc, ivaBps)
    : 0;

  // --- Paso 7: propina -------------------------------------------------------
  const baseProductosEsc = baseGravadaEsc + baseExentaEsc;
  let propinaEsc = 0;
  if (config.cobrarPropina && config.propinaBps > 0) {
    const basePropina =
      config.propinaSobre === "base_con_iva"
        ? baseProductosEsc + ivaProductosEsc
        : baseProductosEsc;
    propinaEsc = aplicarBpsEscalado(basePropina, config.propinaBps);
  }

  // --- Paso 8: total ---------------------------------------------------------
  // Sirve para los dos modos: con precios que incluyen IVA,
  // base + iva de cada linea vuelve a dar exactamente su neto.
  const totalEsc =
    baseProductosEsc + ivaProductosEsc + envioEsc + ivaEnvioEsc + propinaEsc;

  const total = aCentavosDesdeEscala(totalEsc);
  const subtotalBruto = aCentavosDesdeEscala(brutos.reduce((a, b) => a + b, 0));
  const descLineasEsc = descLinea.reduce((a, b) => a + b, 0);

  return {
    lineas,
    subtotalBruto,
    descLineas: aCentavosDesdeEscala(descLineasEsc),
    descPizzas: aCentavosDesdeEscala(descPizzasEsc),
    descBebidas: aCentavosDesdeEscala(descBebidasEsc),
    descGeneral: aCentavosDesdeEscala(descGeneralEsc),
    descTotal: aCentavosDesdeEscala(
      descLineasEsc + descPizzasEsc + descBebidasEsc + descGeneralEsc
    ),
    baseProductos: aCentavosDesdeEscala(baseProductosEsc),
    costoEnvio: aCentavosDesdeEscala(envioEsc),
    baseGravable: aCentavosDesdeEscala(
      baseGravadaEsc + (config.envioGravado ? envioEsc : 0)
    ),
    baseExenta: aCentavosDesdeEscala(baseExentaEsc),
    iva: aCentavosDesdeEscala(ivaProductosEsc + ivaEnvioEsc),
    propina: aCentavosDesdeEscala(propinaEsc),
    total,
    totalUsd:
      config.tipoCambio > 0
        ? Math.round((total * 100) / config.tipoCambio)
        : null,
  };
}

/** Helpers para la UI: 12.5% <-> 1250 bps */
export const pctABps = (pct: number): number => Math.round(pct * 100);
export const bpsAPct = (bps: number): number => bps / 100;
