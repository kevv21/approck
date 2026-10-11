"use client";

import { useEffect, useRef } from "react";

/**
 * EL BOTÓN DE ATRÁS DE ANDROID
 *
 * En una app de Android, «atrás» cierra primero lo último que se abrió: el
 * diálogo, la hoja del pedido, el menú. Sin esto, la página entera iba hacia
 * atrás —o la app se cerraba— con un pedido a medio cargar en pantalla.
 *
 * Cada cosa que se abre encima se anota en una pila mientras está abierta.
 * «Atrás» cierra la de arriba; si no hay ninguna, `AppNativa` decide.
 */

const pila: { id: number; cerrar: () => void }[] = [];
let siguiente = 0;

/** Cierra lo último que se abrió. false si no había nada abierto. */
export function cerrarUltimo(): boolean {
  const arriba = pila.pop();
  if (!arriba) return false;
  arriba.cerrar();
  return true;
}

/** Mientras `abierto`, «atrás» llama a `cerrar` en vez de salir de la pantalla. */
export function useAtras(abierto: boolean, cerrar: () => void) {
  const ultimo = useRef(cerrar);
  ultimo.current = cerrar;

  useEffect(() => {
    if (!abierto) return;
    const id = ++siguiente;
    pila.push({ id, cerrar: () => ultimo.current() });
    return () => {
      const i = pila.findIndex((p) => p.id === id);
      if (i >= 0) pila.splice(i, 1);
    };
  }, [abierto]);
}

/** Solo para pruebas. */
export const _pila = pila;
