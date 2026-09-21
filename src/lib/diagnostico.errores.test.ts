import { describe, expect, it } from "vitest";
import { diagnosticar } from "./diagnostico";

/**
 * Reconocer "esa tabla no existe" es lo que separa "te falta instalar" de
 * "esta todo bien", y llegaba de dos formas distintas. Mirando solo el codigo
 * de Postgres (42P01), una base COMPLETAMENTE VACIA pasaba la prueba y el
 * diagnostico decia "las 12 tablas existen". Lo que devuelve un proyecto real
 * sin instalar es lo de abajo, copiado tal cual de la respuesta.
 */
describe("diagnosticar sobrevive sin configuración", () => {
  it("no lanza y dice que faltan las variables", async () => {
    const r = await diagnosticar();
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].clave).toBe("env");
    expect(r[0].estado).toBe("mal");
  });
});

describe("respuestas reales de PostgREST", () => {
  // Copiado de https://<proyecto>.supabase.co/rest/v1/settings sobre una base
  // recien creada, sin instalar nada.
  const tablaAusente = {
    code: "PGRST205",
    details: null,
    hint: null,
    message: "Could not find the table 'public.settings' in the schema cache",
  };

  it("PGRST205 NO es un código de Postgres, y por eso se escapaba", () => {
    expect(tablaAusente.code).not.toBe("42P01");
  });

  it("el mensaje tampoco dice «does not exist»", () => {
    // Por eso no basta con mirar el texto del error de Postgres.
    expect(tablaAusente.message).toContain("Could not find the table");
  });
});
