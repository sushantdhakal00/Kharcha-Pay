import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    environment: "node",
    include: ["src/**/*.integration.test.ts", "src/**/*.integration.spec.ts", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/*.unit.test.ts", "**/*.unit.spec.ts"],
    globals: false,
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
