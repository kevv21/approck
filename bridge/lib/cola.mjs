import { createClient } from "@supabase/supabase-js";

/** Acceso a la cola de impresion en Supabase. */
export class Cola {
  constructor({ url, key, log }) {
    if (!url || !key) {
      throw new Error(
        "Faltan SUPABASE_URL o SUPABASE_ANON_KEY. Copiá .env.example a .env y llenalos."
      );
    }
    this.db = createClient(url, key, { auth: { persistSession: false } });
    this.log = log ?? (() => {});
  }

  /**
   * Trabajos por imprimir, mas viejos primero.
   * Se descartan los que ya fallaron 5 veces: reintentarlos para siempre
   * llena el rollo de papel con el mismo ticket roto.
   */
  async pendientes(limite = 10) {
    const { data, error } = await this.db
      .from("print_job")
      .select("id, tipo, payload_b64, intentos, orden_id")
      .in("estado", ["pendiente", "error"])
      .lt("intentos", 5)
      .order("created_at", { ascending: true })
      .limit(limite);
    if (error) throw error;
    return data ?? [];
  }

  async marcar(id, estado, { error = null, intentos = null } = {}) {
    const parche = { estado, error };
    if (intentos != null) parche.intentos = intentos;
    if (estado === "impreso") parche.impreso_at = new Date().toISOString();
    const { error: e } = await this.db.from("print_job").update(parche).eq("id", id);
    if (e) this.log(`No se pudo marcar el trabajo ${id}: ${e.message}`);
  }

  /**
   * Latido para que la app sepa que el puente esta vivo.
   * Sin esto, la caja no tiene forma de distinguir "no hay tickets" de
   * "el puente lleva dos horas caido y nadie se dio cuenta".
   */
  async latir(detalle) {
    const { error } = await this.db.from("puente_latido").upsert({
      id: "default",
      visto_at: new Date().toISOString(),
      detalle,
    });
    if (error) this.log(`No se pudo registrar el latido: ${error.message}`);
  }
}
