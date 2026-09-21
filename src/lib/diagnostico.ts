import { hayConfig, supabase } from "./supabase";

/**
 * Diagnostico de la instalacion.
 *
 * Existe porque "tiene las variables de entorno" NO quiere decir "funciona".
 * Se puede tener el proyecto de Supabase creado, las variables puestas en
 * Vercel, y aun asi no haber pegado el SQL; o haberlo pegado hace un mes y
 * que le falten las columnas que agrego un cambio posterior. En los dos casos
 * la app arrancaba bien y reventaba recien al cobrar, con un mensaje de
 * PostgREST que no le dice nada a nadie.
 *
 * Aca se revisa cada cosa por separado y se dice cual falta.
 */

export type EstadoPrueba = "ok" | "mal" | "aviso";

export interface Prueba {
  clave: string;
  titulo: string;
  estado: EstadoPrueba;
  detalle: string;
  /** Que hacer para arreglarlo. Vacio si esta bien. */
  arreglo?: string;
}

/** Tablas que la app necesita para funcionar completa. */
const TABLAS = [
  "producto", "orden", "orden_item", "pago", "turno", "settings",
  "print_job", "puente_latido", "insumo", "conteo", "conteo_item", "audit_log",
] as const;

/**
 * Columnas agregadas despues de la primera version del esquema. Una base
 * instalada con un archivo viejo pasa la prueba de tablas y falla aca, que es
 * exactamente lo que pasaba con `mitades` y `precio_mitades`.
 */
const COLUMNAS: { tabla: string; columna: string; para: string }[] = [
  { tabla: "orden",      columna: "precio_mitades",   para: "guardar cualquier orden" },
  { tabla: "orden_item", columna: "mitades",          para: "las pizzas mitad y mitad" },
  { tabla: "orden_item", columna: "aplica_iva_snapshot", para: "los productos exentos de IVA" },
  { tabla: "turno",      columna: "ventas_pedidosya", para: "cerrar la caja" },
  { tabla: "orden",      columna: "id_local",         para: "no duplicar órdenes al sincronizar" },
];

const RELACION_NO_EXISTE = "42P01";
const COLUMNA_NO_EXISTE = "42703";

const PEGA_EL_SQL =
  "Abre tu proyecto en supabase.com → SQL Editor → New query, pega TODO " +
  "supabase/00_INSTALAR.sql y dale Run. Se puede volver a correr sin romper " +
  "nada. OJO: son 34 KB; si el pegado se corta a la mitad, Postgres responde " +
  "un error de sintaxis en medio de una lista de valores. Comprueba que la " +
  "última línea del editor sea la última del archivo.";

/**
 * Cuando las tablas ESTAN pero les faltan columnas, no hace falta repetir el
 * instalador entero: basta el archivo del cambio, que son cuatro lineas. Es
 * ademas el consejo mas seguro, porque pegar 34 KB en un textarea del
 * navegador es justo lo que se corta.
 */
const CORRE_EL_DELTA =
  "No repitas el instalador entero: pega solo supabase/09_mitades_pedidosya.sql, " +
  "que son cuatro `alter table`. Se puede correr sobre la base que ya tienes y " +
  "repetir sin romper nada.";

/** Una consulta que no trae filas: solo sirve para ver si el nombre existe. */
async function sonda(tabla: string, columna = "*") {
  return supabase.from(tabla).select(columna).limit(1);
}

export async function diagnosticar(): Promise<Prueba[]> {
  const pruebas: Prueba[] = [];

  // --- 1. variables de entorno --------------------------------------------
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!hayConfig) {
    const falta = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !key && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ].filter(Boolean);
    pruebas.push({
      clave: "env",
      titulo: "Variables de entorno",
      estado: "mal",
      detalle: falta.length
        ? `Sin valor: ${falta.join(" y ")}.`
        : url.includes("xxxxxxxx")
          ? "La URL todavía trae el texto de ejemplo de .env.example."
          : "La URL no parece una dirección web (debe empezar con https://).",
      arreglo:
        "En Supabase: Project Settings → API. Copia Project URL y la clave " +
        "«anon public» — NUNCA la service_role: estas variables viajan al " +
        "navegador y esa clave da acceso total a la base. En local van en " +
        ".env.local; en Vercel, en Settings → Environment Variables, marcando " +
        "Production, Preview y Development. Después hay que REDESPLEGAR: " +
        "las NEXT_PUBLIC_ se incrustan al compilar, no se leen al arrancar. " +
        "Y mira el resultado en la URL de producción, no en una de " +
        "despliegue con código aleatorio (approck-a1b2c3-…): esas quedan " +
        "congeladas con el build viejo para siempre. " +
        "Una variable creada pero EN BLANCO es peor que no crearla.",
    });
    return pruebas; // sin credenciales, el resto no se puede probar
  }
  pruebas.push({
    clave: "env",
    titulo: "Variables de entorno",
    estado: "ok",
    detalle: `Apuntando a ${url.replace(/^https?:\/\//, "")}`,
  });

  // --- 2. el proyecto responde --------------------------------------------
  const { error: eConexion } = await sonda("settings", "id");
  if (eConexion && eConexion.code !== RELACION_NO_EXISTE) {
    pruebas.push({
      clave: "conexion",
      titulo: "Conexión con Supabase",
      estado: "mal",
      detalle: eConexion.message,
      arreglo:
        "Si dice «Invalid API key», la clave está mal copiada. Si no responde, " +
        "revisa que el proyecto no esté pausado: Supabase duerme los proyectos " +
        "gratuitos sin uso y hay que despertarlos desde el panel.",
    });
    return pruebas;
  }
  pruebas.push({
    clave: "conexion",
    titulo: "Conexión con Supabase",
    estado: "ok",
    detalle: "El proyecto responde.",
  });

  // --- 3. tablas -----------------------------------------------------------
  const faltantes: string[] = [];
  for (const tabla of TABLAS) {
    const { error } = await sonda(tabla, "*");
    if (error?.code === RELACION_NO_EXISTE) faltantes.push(tabla);
  }
  pruebas.push(
    faltantes.length
      ? {
          clave: "tablas",
          titulo: "Tablas instaladas",
          estado: "mal",
          detalle: `Faltan ${faltantes.length} de ${TABLAS.length}: ${faltantes.join(", ")}.`,
          arreglo: PEGA_EL_SQL,
        }
      : {
          clave: "tablas",
          titulo: "Tablas instaladas",
          estado: "ok",
          detalle: `Las ${TABLAS.length} tablas existen.`,
        }
  );

  // --- 4. columnas de los cambios posteriores -----------------------------
  if (!faltantes.length) {
    const viejas: string[] = [];
    for (const c of COLUMNAS) {
      const { error } = await sonda(c.tabla, c.columna);
      if (error?.code === COLUMNA_NO_EXISTE) viejas.push(`${c.tabla}.${c.columna} (${c.para})`);
    }
    pruebas.push(
      viejas.length
        ? {
            clave: "columnas",
            titulo: "Esquema al día",
            estado: "mal",
            detalle: `La base quedó en una versión anterior. Falta: ${viejas.join("; ")}.`,
            arreglo: CORRE_EL_DELTA,
          }
        : {
            clave: "columnas",
            titulo: "Esquema al día",
            estado: "ok",
            detalle: "Están todas las columnas que la app escribe.",
          }
    );

    // --- 5. menu ----------------------------------------------------------
    const { count } = await supabase
      .from("producto").select("id", { count: "exact", head: true });
    pruebas.push(
      (count ?? 0) > 0
        ? {
            clave: "menu",
            titulo: "Menú cargado",
            estado: "ok",
            detalle: `${count} productos.`,
          }
        : {
            clave: "menu",
            titulo: "Menú cargado",
            estado: "mal",
            detalle: "La tabla producto está vacía: no hay nada que vender.",
            arreglo: PEGA_EL_SQL + " Esa misma corrida carga los 57 productos.",
          }
    );

    // --- 6. turno abierto -------------------------------------------------
    // Abierto = sin fecha de cierre. No hay columna `estado` en turno.
    const { count: turnos } = await supabase
      .from("turno").select("id", { count: "exact", head: true })
      .is("cerrado_at", null);
    pruebas.push(
      (turnos ?? 0) > 0
        ? {
            clave: "turno",
            titulo: "Turno de caja",
            estado: "ok",
            detalle: "Hay una caja abierta: los cobros se asocian a ella.",
          }
        : {
            clave: "turno",
            titulo: "Turno de caja",
            estado: "aviso",
            detalle: "No hay caja abierta.",
            arreglo:
              "Se puede cobrar igual, pero esos cobros no entran en ningún " +
              "arqueo. Abre la caja desde Cierres antes del primer pedido.",
          }
    );
  }

  return pruebas;
}

/** true si todo lo indispensable está listo (los avisos no bloquean). */
export const estaListo = (pruebas: Prueba[]) =>
  pruebas.length > 0 && pruebas.every((p) => p.estado !== "mal");
