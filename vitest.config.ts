import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // Mismo alias que tsconfig, para poder probar módulos por su ruta real.
      "@": path.resolve(__dirname),
      // `server-only` sólo resuelve bajo la condición `react-server` de Next;
      // en los tests se sustituye por un módulo vacío.
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
