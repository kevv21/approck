import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next, Big_Shoulders } from "next/font/google";
import { NavAbajo, PestanasArriba } from "@/components/Navegacion";
import IndicadorConexion from "@/components/IndicadorConexion";
import RegistrarSW from "@/components/RegistrarSW";
import Acceso from "@/components/Acceso";
import ProveedorAvisos from "@/components/Avisos";
import "./globals.css";

/*
  Tipografía. Las tres se descargan al compilar y se sirven desde la app, así
  que funcionan sin internet como el resto de la PWA.

  - Atkinson Hyperlegible: la diseñó el Braille Institute para que cada letra
    sea inconfundible (la I, la l y el 1; el 0 y la O). En una caja con poca
    luz, leída de reojo, es exactamente el problema.
  - Su versión monoespaciada para los montos: misma familia, cifras de ancho
    fijo.
  - Big Shoulders para títulos y el TOTAL: condensada, de cartel. Es la única
    con personalidad, y por eso se usa poco.
*/
const texto = Atkinson_Hyperlegible_Next({
  subsets: ["latin"], variable: "--f-texto", display: "swap",
});
const mono = Atkinson_Hyperlegible_Mono({
  subsets: ["latin"], variable: "--f-mono", display: "swap",
});
const display = Big_Shoulders({
  subsets: ["latin"], variable: "--f-display", display: "swap",
});

export const metadata: Metadata = {
  title: "APPROCK - Rock Munchies",
  description: "POS con tickets ESC/POS, descuentos por categoría y cierres a Excel",
  manifest: "/manifest.json",
  // Sin esto el navegador pide /favicon.ico, que no existe: un 404 en cada carga.
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "APPROCK" },
};

export const viewport: Viewport = {
  // El mismo color que la barra de arriba: si no, la barra de estado de
  // Android queda de otro tono y la app parece una página web.
  themeColor: "#1b1820",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${texto.variable} ${mono.variable} ${display.variable}`}>
      <body>
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b px-3 lg:px-4"
                style={{ background: "var(--panel)", borderColor: "var(--borde)",
                         height: "var(--header-alto)",
                         paddingTop: "env(safe-area-inset-top, 0px)",
                         boxSizing: "content-box" }}>
          <span className="display text-2xl" style={{ color: "var(--acc)" }}>
            Approck
          </span>
          <PestanasArriba />
          <span className="flex-1 lg:hidden" />
          <IndicadorConexion />
        </header>
        <RegistrarSW />
        <ProveedorAvisos>
          <Acceso>
            <main className="con-nav">{children}</main>
          </Acceso>
        </ProveedorAvisos>
        <NavAbajo />
      </body>
    </html>
  );
}
