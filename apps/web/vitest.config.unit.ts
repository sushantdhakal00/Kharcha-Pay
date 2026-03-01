import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    environment: "node",
    include: ["src/**/*.unit.test.ts", "src/**/*.unit.spec.ts"],
    exclude: ["**/node_modules/**", "**/integration/**", "**/receipt-upload.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
