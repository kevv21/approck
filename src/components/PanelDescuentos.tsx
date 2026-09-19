"use client";

import { centavos, fmtC } from "@/lib/money";
import { bpsAPct, pctABps } from "@/lib/pricing";
import type { AlcanceDescuento, Descuento, TipoDescuento } from "@/lib/types";

const ATAJOS_PCT = [5, 10, 15, 20, 50];

const ETIQUETAS: Record<AlcanceDescuento, { titulo: string; nota: string }> = {
  general: { titulo: "General", nota: "Sobre todo el pedido" },
  pizza:   { titulo: "Pizzas",  nota: "Solo líneas de pizza" },
  bebida:  { titulo: "Bebidas", nota: "Bebidas, cervezas, RTD y bar" },
};

function FilaDescuento({
  alcance, valor, onChange, aplicado,
}: {
  alcance: AlcanceDescuento;
  valor: Descuento | undefined;
  onChange: (d: Descuento | undefined) => void;
  aplicado: number;
}) {
  const tipo: TipoDescuento = valor?.tipo ?? "porcentaje";
  const activo = !!valor && valor.valor > 0;
  const { titulo, nota } = ETIQUETAS[alcance];

  const setTipo = (t: TipoDescuento) => onChange({ alcance, tipo: t, valor: 0 });

  const setValor = (n: number) => {
    if (!n || n <= 0) return onChange(undefined);
    onChange({
      alcance,
      tipo,
      valor: tipo === "porcentaje" ? pctABps(n) : centavos(n),
    });
  };

  const mostrado = !valor || valor.valor === 0
    ? ""
    : tipo === "porcentaje" ? String(bpsAPct(valor.valor)) : String(valor.valor / 100);

  return (
    <div className="rounded-lg p-3" style={{ background: "var(--panel-2)" }}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div>
          <div className="font-semibold">{titulo}</div>
          <div className="text-xs" style={{ color: "var(--txt-2)" }}>{nota}</div>
        </div>
        {aplicado > 0 && (
          <div className="mono text-sm font-bold" style={{ color: "var(--acc-2)" }}>
            -{fmtC(aplicado)}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <div className="flex overflow-hidden rounded-lg" style={{ border: "1px solid var(--borde)" }}>
          {(["porcentaje", "monto"] as TipoDescuento[]).map((t) => (
            <button key={t} type="button" onClick={() => setTipo(t)}
              className="px-3 text-sm font-semibold"
              style={{
                background: tipo === t ? "var(--acc)" : "transparent",
                color: tipo === t ? "#1a0d04" : "var(--txt-2)",
              }}>
              {t === "porcentaje" ? "%" : "C$"}
            </button>
          ))}
        </div>

        <input
          className="input flex-1" inputMode="decimal" placeholder="0"
          value={mostrado}
          onChange={(e) => setValor(parseFloat(e.target.value.replace(",", ".")) || 0)}
        />

        {activo && (
          <button type="button" className="btn btn-ghost px-3"
                  onClick={() => onChange(undefined)}>✕</button>
        )}
      </div>

      {tipo === "porcentaje" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ATAJOS_PCT.map((p) => (
            <button key={p} type="button" onClick={() => setValor(p)}
              className={`chip ${valor?.valor === pctABps(p) ? "chip-on" : ""}`}>
              {p}%
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PanelDescuentos({
  descuentos, setDescuentos, aplicados,
}: {
  descuentos: Descuento[];
  setDescuentos: (d: Descuento[]) => void;
  aplicados: { general: number; pizza: number; bebida: number };
}) {
  const set = (alcance: AlcanceDescuento) => (d: Descuento | undefined) => {
    const otros = descuentos.filter((x) => x.alcance !== alcance);
    setDescuentos(d ? [...otros, d] : otros);
  };
  const get = (a: AlcanceDescuento) => descuentos.find((x) => x.alcance === a);

  const hayApilado =
    (aplicados.pizza > 0 || aplicados.bebida > 0) && aplicados.general > 0;

  return (
    <div className="space-y-2">
      <FilaDescuento alcance="pizza"   valor={get("pizza")}   onChange={set("pizza")}   aplicado={aplicados.pizza} />
      <FilaDescuento alcance="bebida"  valor={get("bebida")}  onChange={set("bebida")}  aplicado={aplicados.bebida} />
      <FilaDescuento alcance="general" valor={get("general")} onChange={set("general")} aplicado={aplicados.general} />

      {hayApilado && (
        <p className="rounded-lg p-2 text-xs leading-snug"
           style={{ background: "#3a2a0a", color: "var(--acc-2)" }}>
          Ojo: el descuento general se aplica sobre lo que ya quedó descontado.
          10% a pizzas + 10% general es 19% efectivo, no 20%.
        </p>
      )}
    </div>
  );
}
