/**
 * Service worker de APPROCK.
 *
 * Sin esto, el soporte offline no sirve de nada: abrir la app sin internet
 * muestra la pagina de error del navegador y el almacen local nunca se llega
 * a usar.
 *
 * Estrategia:
 *   - Estaticos de Next (/_next/static/): cache primero. Llevan hash en el
 *     nombre, asi que nunca quedan viejos.
 *   - Navegaciones: red primero con respaldo en cache. Se prefiere la version
 *     fresca cuando hay senal, pero la app abre igual sin ella.
 *   - Peticiones a Supabase: NUNCA se cachean. Servir datos viejos de ordenes
 *     o de la cola de impresion desde cache seria peor que fallar.
 */

const VERSION = "v1";
const CACHE_SHELL = `approck-shell-${VERSION}`;
const CACHE_ESTATICOS = `approck-static-${VERSION}`;

const SHELL = ["/", "/estacion", "/cierre", "/manifest.json", "/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_SHELL)
      // addAll falla entera si un recurso falla; se agregan de a uno.
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(
        ks.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Nunca cachear la API: datos viejos de órdenes o de la cola son peor que
  // un error honesto.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Estáticos con hash: cache primero.
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(req).then((hit) =>
        hit ?? fetch(req).then((res) => {
          const copia = res.clone();
          caches.open(CACHE_ESTATICOS).then((c) => c.put(req, copia));
          return res;
        })
      )
    );
    return;
  }

  // Navegaciones: red primero, cache de respaldo.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE_SHELL).then((c) => c.put(req, copia));
          return res;
        })
        .catch(async () =>
          (await caches.match(req)) ??
          (await caches.match("/")) ??
          new Response(
            "<!doctype html><meta charset=utf-8><body style='font-family:system-ui;padding:2rem'>" +
            "<h1>Sin conexión</h1><p>Abrí la app una vez con internet para poder usarla sin señal.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          )
        )
    );
  }
});
