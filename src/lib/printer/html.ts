"use client";

import { previsualizarTicket, type DatosTicket } from "../ticket";
import { columnasPara } from "../escpos";

/**
 * Fallback exigido por el spec: recibo en HTML con window.print() y descarga.
 *
 * Funciona en CUALQUIER navegador, iPhone incluido, sin impresora termica.
 * Sirve para dos casos reales: que el puente este caido y haya que entregar
 * algo, y que el cliente pida el recibo por WhatsApp o correo.
 */
export function ticketHtml(d: DatosTicket): string {
  const cols = columnasPara(d.ancho ?? 58);
  const texto = previsualizarTicket(d);
  const anchoMm = (d.ancho ?? 58) - 4; // margenes del rollo

  const escapar = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Recibo ${d.numero || ""} - Rock Munchies</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { color-scheme: light; }
  body { margin:0; background:#f3f4f6; font-family:ui-monospace,Menlo,Consolas,monospace; }
  .hoja {
    width:${anchoMm}mm; margin:12px auto; padding:6mm 3mm; background:#fff;
    box-shadow:0 1px 6px rgba(0,0,0,.15);
  }
  pre {
    margin:0; white-space:pre; font-size:${cols > 40 ? 10 : 11}px;
    line-height:1.35; letter-spacing:0;
  }
  .acciones { text-align:center; margin:16px; }
  button {
    font:inherit; padding:10px 18px; margin:0 4px; border:0; border-radius:8px;
    background:#ff6b1a; color:#1a0d04; font-weight:700; cursor:pointer;
  }
  @media print {
    body { background:#fff; }
    .acciones { display:none; }
    .hoja { box-shadow:none; margin:0; width:auto; padding:0; }
    @page { margin:0; size:${d.ancho ?? 58}mm auto; }
  }
</style></head>
<body>
  <div class="hoja"><pre>${escapar(texto)}</pre></div>
  <div class="acciones">
    <button onclick="window.print()">Imprimir</button>
  </div>
</body></html>`;
}

/** Abre el recibo en una pestaña y dispara el diálogo de impresión. */
export function imprimirHtml(d: DatosTicket): void {
  const w = window.open("", "_blank");
  if (!w) throw new Error("El navegador bloqueó la ventana. Permití las ventanas emergentes.");
  w.document.write(ticketHtml(d));
  w.document.close();
  // Safari en iPhone necesita el respiro antes de print().
  setTimeout(() => w.print(), 400);
}

/** Descarga el recibo como archivo, para mandarlo por WhatsApp o correo. */
export function descargarHtml(d: DatosTicket): void {
  const blob = new Blob([ticketHtml(d)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `recibo-${String(d.numero).padStart(4, "0")}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
