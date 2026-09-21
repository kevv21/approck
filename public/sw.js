/**
 * Service worker de APPROCK.
 *
 * Sin esto, el soporte offline no sirve de nada: abrir la app sin internet
 * muestra la pagina de error del navegador y el almacen local nunca se llega
 * a usar.
 *
 * DOS COSAS QUE ROMPIAN ANDROID, arregladas aqui:
 *
 * 1. Se cacheaban las respuestas FALLIDAS. Con estrategia "cache primero",
 *    un 404 o un 500 guardado se servia para siempre: el telefono quedaba
 *    con "Application error" y reinstalar la PWA no lo arreglaba, porque la
 *    cache sobrevive. En el wifi de un local eso pasa solo.
 *
 * 2. Un service worker NUEVO tomando el control de una pagina cargada con el
 *    HTML VIEJO deja a esa pagina pidiendo trozos de JavaScript que ya no
 *    existen -> ChunkLoadError, pantalla en blanco a media atencion.
 *    Se probo quitando skipWaiting(), y salio peor: un aparato con la v1
 *    instalada se quedaba varado en ella, sirviendo su cache envenenada,
 *    hasta cerrar todas las pestañas. Ahora skipWaiting se queda, y el
 *    problema se ataca donde de verdad esta: un chunk que falta devuelve
 *    504 en vez de reventar, y la app se limpia la cache y recarga una vez
 *    si aun asi falla.
 *
 * Estrategia:
 *   - Estaticos de Next (/_next/static/): cache primero. Llevan hash en el
 *     nombre, asi que nunca quedan viejos. Solo se guarda lo que responde
 *     200, y si la red falla se busca en cache antes de rendirse.
 *   - Navegaciones: red primero con respaldo en cache.
 *   - Peticiones a Supabase: NUNCA se cachean. Servir datos viejos de
 *     ordenes o de la cola de impresion seria peor que fallar.
 */

const VERSION = "v3";
const CACHE_SHELL = `approck-shell-${VERSION}`;
const CACHE_ESTATICOS = `approck-static-${VERSION}`;

const SHELL = [
  "/", "/estacion", "/cierre", "/inventario", "/configuracion",
  "/manifest.json", "/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_SHELL)
      // addAll falla entera si un recurso falla; se agregan de a uno.
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
  );
  // skipWaiting SI, y esto es una correccion de la correccion anterior.
  //
  // Se habia quitado para que una version nueva no tomara el control de una
  // pagina con el HTML viejo (ChunkLoadError). Pero eso dejaba varado a
  // cualquier aparato que ya tuviera la v1 instalada: la v1 seguia mandando
  // hasta cerrar TODAS las pestañas, sirviendo su cache envenenada, y el
  // telefono se quedaba con una version de hace dias sin que nadie lo notara.
  // Varado en silencio es peor que un error visible.
  //
  // Lo que hacia peligroso el skipWaiting ya no esta: un chunk que falta
  // devuelve 504 en vez de dejar la promesa rechazada, y la app se limpia la
  // cache y recarga una vez si aun asi revienta. El intercambio ahora sale a
  // favor de que los arreglos lleguen.
  self.skipWaiting();
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

/** Solo se guarda lo que de verdad sirve. Un error cacheado es permanente. */
function guardable(res) {
  return res && res.ok && res.status === 200 && res.type !== "opaque";
}

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
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (guardable(res)) {
          const copia = res.clone();
          caches.open(CACHE_ESTATICOS).then((c) => c.put(req, copia));
        }
        return res;
      } catch {
        // La red falló. Antes esto dejaba la promesa rechazada y el navegador
        // lo convertia en ChunkLoadError. Se reintenta en cache —puede estar
        // bajo otra URL— y si no, se devuelve un error honesto.
        const respaldo = await caches.match(req, { ignoreSearch: true });
        if (respaldo) return respaldo;
        return new Response("", { status: 504, statusText: "Sin conexión" });
      }
    })());
    return;
  }

  // Navegaciones: red primero, cache de respaldo.
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (guardable(res)) {
          const copia = res.clone();
          caches.open(CACHE_SHELL).then((c) => c.put(req, copia));
        }
        return res;
      } catch {
        return (await caches.match(req)) ??
          (await caches.match("/")) ??
          new Response(
            "<!doctype html><meta charset=utf-8><body style='font-family:system-ui;padding:2rem'>" +
            "<h1>Sin conexión</h1><p>Abre la app una vez con internet para poder usarla sin señal.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
      }
    })());
  }
});

/** La app puede pedir que la version nueva entre ya, cuando sea buen momento. */
self.addEventListener("message", (e) => {
  if (e.data === "activar-ya") self.skipWaiting();
});
