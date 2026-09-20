"use client";

import { useEffect } from "react";

/** Registra el service worker. Solo en producción y sobre HTTPS/localhost. */
export default function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // No es fatal: la app funciona igual, solo pierde el arranque offline.
    });
  }, []);
  return null;
}
