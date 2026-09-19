import type { Metadata, Viewport } from "next";
import Link from "next/link";
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
  { href: "/cierre", label: "Cierres" },
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
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium"
                  style={{ color: "var(--txt-2)" }}>
              {n.label}
            </Link>
          ))}
        </header>
        <main className="pb-24">{children}</main>
      </body>
    </html>
  );
}
