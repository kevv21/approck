import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // La estacion de impresion usa Web Bluetooth, que exige contexto seguro.
  // En produccion: HTTPS. En desarrollo local: http://localhost (permitido).
  // Para probar desde un Android en la LAN necesitas HTTPS -> usa `next dev --experimental-https`.
};

export default nextConfig;
