import type { CapacitorConfig } from "@capacitor/cli";

/**
 * ROCKZZA — la app de Android.
 *
 * El APK no trae la app adentro: abre la que está publicada en Vercel. Así,
 * cada cambio que se publica llega a todos los teléfonos sin reinstalar
 * nada, igual que la página. Lo que sí trae el APK es lo que una página no
 * puede hacer: imprimir por Bluetooth clásico (la PT-210, PIN 0000), vibrar
 * y manejar el botón de atrás de Android. Ver android/app/src/main/java.
 *
 * `appId` NO se puede cambiar nunca: para Android, otro appId es otra app,
 * y los teléfonos no la aceptarían como actualización de esta.
 */
const config: CapacitorConfig = {
  appId: "com.rockzza.app",
  appName: "Rockzza",
  // Solo la página «sin conexión» y un índice de respaldo. La app real
  // viene de `server.url`.
  webDir: "apk/www",
  server: {
    url: "https://approck.vercel.app",
    // Si la primera vez no hay internet (todavía no hay nada guardado en
    // el teléfono), en vez de la pantalla de error de Android sale esta,
    // con un botón para reintentar. Después de la primera carga la app
    // abre sin señal: la guarda el service worker.
    errorPath: "sin-conexion.html",
  },
  android: {
    // Que nadie pueda inspeccionar la app de un teléfono del local
    // conectándolo a una computadora.
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SystemBars: {
      // Fondo oscuro: íconos claros en la barra de estado y la de abajo.
      style: "DARK",
      // La página ya se dibuja debajo de las barras (viewport-fit=cover) y
      // usa --safe-area-inset-* para no quedar tapada.
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
    },
  },
};

export default config;
