import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    // Testes de lógica pura (.test.ts) rodam em "node" (mais rápido). Testes de
    // componente React (.test.tsx) precisam de DOM — cada um declara isso com
    // `// @vitest-environment jsdom` no topo do próprio arquivo.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      enabled: false,
    },
  },
});
