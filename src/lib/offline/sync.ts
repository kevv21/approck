import type { OrdenLocal } from "./tipos";

/**
 * Motor de sincronizacion.
 *
 * Las dependencias se inyectan para que la logica sea testeable sin
 * IndexedDB ni red: es la parte donde un error duplica ordenes cobradas.
 */
export interface PuertoSync {
  pendientes(): Promise<OrdenLocal[]>;
  /** Sube una orden. Debe ser IDEMPOTENTE respecto de `idLocal`. */
  subir(o: OrdenLocal): Promise<{ idRemoto: string; numero: number }>;
  marcar(idLocal: string, parche: Partial<OrdenLocal>): Promise<void>;
}

export interface ResultadoSync {
  subidas: number;
  fallidas: number;
  descartadas: number;
  detenido: boolean;
}

export const MAX_INTENTOS = 5;

/**
 * Sube las ordenes pendientes, en el orden en que se crearon.
 *
 * Reglas que importan:
 *
 * - Se para al primer fallo. Si el servidor esta caido, seguir intentando con
 *   las demas solo quema reintentos y deja todo en estado "error".
 * - Antes de subir marca "subiendo". Si el proceso muere a mitad, la orden no
 *   queda como pendiente de una subida que quiza ya ocurrio.
 * - La idempotencia NO se resuelve aca sino en `subir`, con `idLocal` como
 *   clave unica en la base. Si la subida funciona pero se corta la conexion
 *   antes de marcarla, el siguiente intento reconoce la orden existente en
 *   vez de crear una duplicada. Sin eso, una caida en el momento justo cobra
 *   dos veces la misma orden.
 */
export async function sincronizar(puerto: PuertoSync): Promise<ResultadoSync> {
  const res: ResultadoSync = {
    subidas: 0, fallidas: 0, descartadas: 0, detenido: false,
  };

  const pendientes = await puerto.pendientes();

  for (const o of pendientes) {
    if (o.intentos >= MAX_INTENTOS) {
      // No se borra: queda visible para que alguien la revise a mano.
      res.descartadas += 1;
      continue;
    }

    const intentos = o.intentos + 1;
    try {
      await puerto.marcar(o.idLocal, { estado: "subiendo" });
      const { idRemoto, numero } = await puerto.subir(o);
      await puerto.marcar(o.idLocal, {
        estado: "sincronizada",
        idRemoto,
        numeroReal: numero,
        intentos,
        error: undefined,
        sincronizadaAt: new Date().toISOString(),
      });
      res.subidas += 1;
    } catch (e) {
      await puerto.marcar(o.idLocal, {
        estado: "error",
        intentos,
        error: (e as Error).message,
      });
      res.fallidas += 1;
      res.detenido = true;
      break;
    }
  }

  return res;
}
