import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Escritura a la impresora termica.
 *
 * En Windows, emparejar la PT-210 crea un puerto COM SALIENTE. Este modulo
 * lo abre y le manda los bytes ESC/POS crudos.
 *
 * `serialport` es un modulo nativo: se carga de forma perezosa para que el
 * modo simulado funcione aunque no este instalado o no compile.
 */

const TAM_CHUNK = 256;
const PAUSA_MS = 20;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export class PuertoImpresora {
  #puerto = null;
  #SerialPort = null;

  constructor({ ruta, baudios, simular, log }) {
    this.ruta = ruta;
    this.baudios = baudios;
    this.simular = simular;
    this.log = log ?? (() => {});
  }

  get conectado() {
    return this.simular || (this.#puerto?.isOpen ?? false);
  }

  async #cargarDriver() {
    if (this.#SerialPort) return this.#SerialPort;
    try {
      ({ SerialPort: this.#SerialPort } = await import("serialport"));
    } catch {
      throw new Error(
        "No se pudo cargar 'serialport'. Ejecutá `npm install` dentro de bridge/, " +
        "o poné SIMULAR=true para probar sin impresora."
      );
    }
    return this.#SerialPort;
  }

  static async listarPuertos() {
    const { SerialPort } = await import("serialport");
    return SerialPort.list();
  }

  async abrir() {
    if (this.simular) {
      await mkdir("salida", { recursive: true });
      this.log("Modo simulado: los tickets se guardan en ./salida/");
      return;
    }
    const SerialPort = await this.#cargarDriver();

    await new Promise((resolve, reject) => {
      this.#puerto = new SerialPort(
        { path: this.ruta, baudRate: this.baudios, autoOpen: false },
        // el callback del constructor no se usa: se abre explicito abajo
      );
      this.#puerto.open((err) => (err ? reject(err) : resolve()));
    });

    // El SPP de Bluetooth se cae cuando la impresora se duerme. No es fatal:
    // el bucle principal reabre antes del siguiente trabajo.
    this.#puerto.on("close", () => this.log("El puerto se cerró."));
    this.#puerto.on("error", (e) => this.log(`Error del puerto: ${e.message}`));

    this.log(`Puerto ${this.ruta} abierto a ${this.baudios} baudios.`);
  }

  async asegurarAbierto() {
    if (this.conectado) return;
    await this.abrir();
  }

  /** Manda los bytes troceados: el buffer de estas impresoras es chico. */
  async escribir(bytes, nombre = "ticket") {
    if (this.simular) {
      const archivo = join("salida", `${Date.now()}-${nombre}.bin`);
      await writeFile(archivo, bytes);
      this.log(`Simulado -> ${archivo} (${bytes.length} bytes)`);
      return;
    }

    await this.asegurarAbierto();

    for (let i = 0; i < bytes.length; i += TAM_CHUNK) {
      const trozo = bytes.subarray(i, i + TAM_CHUNK);
      await new Promise((resolve, reject) => {
        this.#puerto.write(trozo, (err) => (err ? reject(err) : resolve()));
      });
      // drain espera a que el sistema vacie el buffer antes de seguir.
      await new Promise((resolve, reject) => {
        this.#puerto.drain((err) => (err ? reject(err) : resolve()));
      });
      await dormir(PAUSA_MS);
    }
  }

  cerrar() {
    try {
      this.#puerto?.close();
    } catch {
      /* noop */
    }
  }
}
