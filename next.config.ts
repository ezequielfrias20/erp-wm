import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Next 16 admite un solo `next dev` por carpeta de compilación. `scripts/dev-cliente.sh`
  // levanta otro negocio con NEXT_DIST_DIR=.next-cliente para que conviva con el de `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
