import { describe, expect, it } from "vitest";
import { claseDeClave } from "./diagnostico";

/**
 * Reconocer la clave importa mas que el resto del diagnostico, porque es el
 * unico error que NO da sintomas: con la clave secreta la app funciona mejor
 * —salta las politicas—, asi que nadie se entera hasta que alguien mira el
 * codigo de la pagina y se lleva la base entera.
 */

/** Arma un JWT de mentira con el rol pedido. Solo se lee, no se verifica. */
const jwt = (rol: string) => {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iss: "supabase", role: rol })}.firma`;
};

describe("qué clase de clave se puso", () => {
  it("la publishable nueva es pública", () => {
    expect(claseDeClave("sb_publishable_jGaZ6HOAYPSHIBwpZ76ZXw_VNUD9")).toBe("publica");
  });

  it("la secret nueva es SECRETA", () => {
    expect(claseDeClave("sb_secret_vf0PlAbCdEfGhIjKlMnOp")).toBe("SECRETA");
  });

  it("el JWT heredado con rol anon es público", () => {
    expect(claseDeClave(jwt("anon"))).toBe("publica");
  });

  it("el JWT heredado con rol service_role es SECRETA", () => {
    // Las dos empiezan con eyJ y se parecen: esto es justo lo que se confunde.
    expect(claseDeClave(jwt("service_role"))).toBe("SECRETA");
  });

  it("un JWT de rol authenticated también es público", () => {
    expect(claseDeClave(jwt("authenticated"))).toBe("publica");
  });

  it("no afirma nada de lo que no reconoce", () => {
    expect(claseDeClave("")).toBe("desconocida");
    expect(claseDeClave("cualquier-cosa")).toBe("desconocida");
    expect(claseDeClave("a.b.c")).toBe("desconocida");
  });

  it("una carga base64 rota no lanza, solo se declara desconocida", () => {
    expect(claseDeClave("eyJhbGciOiJIUzI1NiJ9.%%%no-es-base64%%%.firma"))
      .toBe("desconocida");
  });

  it("aguanta base64url con guiones, que es como los emite Supabase", () => {
    // base64url usa - y _ donde base64 usa + y /. Sin normalizar eso, atob
    // lanza y una clave service_role legitima pasaria por "desconocida".
    const conGuiones = jwt("service_role");
    expect(conGuiones).not.toContain("+");
    expect(claseDeClave(conGuiones)).toBe("SECRETA");
  });
});
