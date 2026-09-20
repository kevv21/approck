import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase.
 *
 * Dos cuidados, los dos aprendidos rompiendo un despliegue:
 *
 * 1. Se usa `||` y no `??` para el respaldo. `??` solo cae cuando el valor es
 *    null o undefined; una variable declarada pero VACIA pasa como "" y
 *    `createClient("")` lanza "supabaseUrl is required". En Vercel es facil
 *    crear la variable y dejarla en blanco, y eso tumbaba el build entero.
 *
 * 2. El cliente se crea PEREZOSAMENTE. Construirlo al cargar el modulo
 *    significa construirlo durante el prerenderizado de Next, donde no sirve
 *    para nada y donde cualquier valor invalido rompe la compilacion en vez
 *    de fallar en el navegador, que es donde se puede explicar.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** Hay configuracion real, no el marcador de .env.example. */
export const hayConfig = Boolean(
  url && key && !url.includes("xxxxxxxx") && url.startsWith("http")
);

// Valores inertes para cuando no hay configuracion: la app corre en modo
// demo y ninguna consulta llega a salir.
const URL_INERTE = "https://sin-configurar.invalid";
const KEY_INERTE = "sin-configurar";

let instancia: SupabaseClient | null = null;

function obtener(): SupabaseClient {
  if (!instancia) {
    instancia = createClient(
      hayConfig ? url : URL_INERTE,
      hayConfig ? key : KEY_INERTE,
      { auth: { persistSession: false } }
    );
  }
  return instancia;
}

/**
 * Proxy para no cambiar los cientos de `supabase.from(...)` del codigo: se
 * ve igual, pero no construye nada hasta el primer uso real.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_destino, prop) {
    const c = obtener() as unknown as Record<string | symbol, unknown>;
    const v = c[prop];
    return typeof v === "function" ? v.bind(c) : v;
  },
}) as SupabaseClient;
