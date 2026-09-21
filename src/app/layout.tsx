import type { Metadata, Viewport } from "next";
import NavPestanas from "@/components/NavPestanas";
import IndicadorConexion from "@/components/IndicadorConexion";
import RegistrarSW from "@/components/RegistrarSW";
import Acceso from "@/components/Acceso";
import ProveedorAvisos from "@/components/Avisos";
import "./globals.css";

export const metadata: Metadata = {
  title: "APPROCK - Rock Munchies",
  description: "POS con tickets ESC/POS, descuentos por categoría y cierres a Excel",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "APPROCK" },
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

const NAV = [
  { href: "/", label: "Caja" },
  { href: "/estacion", label: "Estación" },
  { href: "/inventario", label: "Inventario" },
  { href: "/cierre", label: "Cierres" },
  { href: "/prueba", label: "Probar" },
  { href: "/configuracion", label: "Estado" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="sticky top-0 z-30 flex items-center gap-1 border-b px-3 py-2"
                style={{ background: "var(--panel)", borderColor: "var(--borde)" }}>
          <span className="mr-2 font-black tracking-tight" style={{ color: "var(--acc)" }}>
            APPROCK
          </span>
          <NavPestanas items={NAV} />
          <IndicadorConexion />
        </header>
        <RegistrarSW />
        <ProveedorAvisos>
          <Acceso>
            <main>{children}</main>
          </Acceso>
        </ProveedorAvisos>
      </body>
    </html>
  );
}
