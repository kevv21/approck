"use client";

import { useState } from "react";
import { vincular } from "@/lib/auth/dispositivo";

/**
 * Se escribe una vez por teléfono o por PC, y no se vuelve a ver.
 *
 * Esta contraseña NO está en el código de la app a propósito: ahí está la
 * clave pública, que cualquiera puede leer. Esta es la que de verdad abre la
 * puerta, y por eso la escribe una persona en cada aparato.
 */
export default function VincularDispositivo({ alVincular }: { alVincular: () => void }) {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [yendo, setYendo] = useState(false);

  const enviar = async () => {
    if (!correo.trim() || !clave) return;
    setYendo(true);
    setError(null);
    const r = await vincular(correo, clave);
    setYendo(false);
    if (r.ok) alVincular(); else setError(r.motivo ?? "No se pudo vincular.");
  };

  return (
    <div className="mx-auto max-w-sm p-6">
      <div className="panel space-y-3 p-5">
        <div className="text-center">
          <h1 className="text-xl font-black" style={{ color: "var(--acc)" }}>
            ROCK MUNCHIES
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--txt-2)" }}>
            Vincula este aparato con la cuenta del local. Se hace una sola vez.
          </p>
        </div>

        <input className="input" placeholder="Correo de la cuenta del local"
               type="email" inputMode="email" autoComplete="username"
               value={correo} onChange={(e) => setCorreo(e.target.value)} />

        <input className="input" placeholder="Contraseña" type="password"
               autoComplete="current-password" value={clave}
               onChange={(e) => setClave(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") enviar(); }} />

        <button className="btn btn-acc w-full"
                disabled={!correo.trim() || !clave || yendo} onClick={enviar}>
          {yendo ? "Vinculando…" : "Vincular este aparato"}
        </button>

        {error && (
          <p className="text-center text-sm" style={{ color: "var(--mal)" }}>{error}</p>
        )}

        <p className="text-center text-xs leading-snug" style={{ color: "var(--txt-2)" }}>
          Después de esto, el aparato queda vinculado y solo se pide el PIN.
          La contraseña no se guarda en la app ni viaja en su código: por eso
          hay que escribirla en cada teléfono.
        </p>
      </div>
    </div>
  );
}
