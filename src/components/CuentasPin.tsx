"use client";

import { useCallback, useEffect, useState } from "react";
import { useAvisos } from "./Avisos";
import { Segmentado } from "./Controles";
import { cambiarPin, estadoAccesos, type EstadoAccesos } from "@/lib/auth/sesion";
import { ROLES, type Rol } from "@/lib/auth/permisos";

/**
 * CUENTAS Y PIN
 *
 * Aquí se pone o se cambia el PIN de cada cuenta. Siempre pide el PIN de la
 * maestra, también para la cuenta de revisión: así quien tiene el de revisión
 * no puede darse permisos ni cambiarle el PIN a la maestra. Lo comprueba la
 * base, no esta pantalla (ver supabase/17_accesos.sql).
 *
 * Vive en Estado, que no pide PIN para abrirse: si la maestra se queda fuera,
 * esta pantalla tiene que seguir a mano.
 */
export default function CuentasPin() {
  const { avisar } = useAvisos();
  const [estado, setEstado] = useState<EstadoAccesos | null | undefined>(undefined);
  const [cuenta, setCuenta] = useState<Rol>("maestra");
  const [maestra, setMaestra] = useState("");
  const [nuevo, setNuevo] = useState("");
  const [repite, setRepite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    estadoAccesos().then(setEstado).catch(() => setEstado(null));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // Sin la función en la base no hay nada que administrar: Estado ya dice
  // arriba qué correr.
  if (estado === undefined || estado === null) return null;

  const guardar = async (apagar = false) => {
    setError(null);
    if (!maestra) return setError("Escribe el PIN de la cuenta maestra.");
    if (!apagar) {
      if (!/^\d{4,8}$/.test(nuevo)) return setError("El PIN nuevo tiene que ser de 4 a 8 números.");
      if (nuevo !== repite) return setError("Los dos PIN nuevos no coinciden.");
    }
    setGuardando(true);
    try {
      await cambiarPin(maestra, cuenta, apagar ? "" : nuevo);
      avisar({
        texto: apagar ? "Cuenta de revisión apagada" : `PIN de ${ROLES[cuenta].etiqueta.toLowerCase()} guardado`,
        detalle: apagar ? "Su PIN ya no abre la app" : "Vale desde la próxima entrada",
        tono: "agregado",
      });
      setMaestra(""); setNuevo(""); setRepite("");
      cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="panel space-y-3 p-4">
      <div>
        <span className="rotulo">Cuentas y PIN</span>
        <p className="mt-1 text-sm leading-snug" style={{ color: "var(--txt-2)" }}>
          La <b>maestra</b> cobra, imprime, edita y anula. La de <b>revisión</b> ve
          las órdenes y hace inventario. Cada una entra con su PIN.
        </p>
      </div>

      <ul className="space-y-1.5 text-sm">
        <Fila nombre="Maestra"
              estado={estado.de_fabrica ? "PIN de fábrica (1234): cámbialo" : "Con PIN propio"}
              alerta={estado.de_fabrica} />
        <Fila nombre="Revisión"
              estado={estado.revision ? "Con PIN" : "Apagada: todavía no tiene PIN"} />
      </ul>

      <Segmentado<Rol> etiqueta="Cuenta" valor={cuenta}
        onCambio={(r) => { setCuenta(r); setError(null); }}
        opciones={[{ valor: "maestra", etiqueta: "Maestra" }, { valor: "revision", etiqueta: "Revisión" }]} />

      <div className="grid gap-2">
        <input className="input" type="password" inputMode="numeric" autoComplete="off"
               placeholder="PIN actual de la maestra" aria-label="PIN actual de la maestra"
               value={maestra} onChange={(e) => setMaestra(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <input className="input" type="password" inputMode="numeric" autoComplete="new-password"
                 placeholder="PIN nuevo" aria-label="PIN nuevo"
                 value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
          <input className="input" type="password" inputMode="numeric" autoComplete="new-password"
                 placeholder="Repítelo" aria-label="Repite el PIN nuevo"
                 value={repite} onChange={(e) => setRepite(e.target.value)} />
        </div>
      </div>

      {error && <p role="alert" className="text-sm" style={{ color: "var(--mal)" }}>{error}</p>}

      <div className="grid gap-2">
        <button className="btn btn-acc" disabled={guardando} onClick={() => guardar()}>
          {estado[cuenta] || cuenta === "maestra"
            ? `Cambiar el PIN de ${ROLES[cuenta].etiqueta.toLowerCase()}`
            : "Activar la cuenta de revisión"}
        </button>
        {cuenta === "revision" && estado.revision && (
          <button className="btn btn-mal-suave" disabled={guardando} onClick={() => guardar(true)}>
            Apagar la cuenta de revisión
          </button>
        )}
      </div>

      <p className="text-xs leading-snug" style={{ color: "var(--txt-3)" }}>
        Los dos PIN tienen que ser distintos. El PIN reparte lo que cada quien puede
        hacer en la app; no reemplaza la cuenta del local para cerrar la base.
      </p>
    </div>
  );
}

function Fila({ nombre, estado, alerta }: { nombre: string; estado: string; alerta?: boolean }) {
  return (
    <li className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--panel-2)" }}>
      <span className="font-semibold">{nombre}</span>
      <span className="ml-auto text-right text-xs"
            style={{ color: alerta ? "var(--acc)" : "var(--txt-2)" }}>{estado}</span>
    </li>
  );
}
