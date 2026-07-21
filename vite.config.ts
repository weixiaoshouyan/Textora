import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  publicDir: "resources",
  build: {
    outDir: "dist",
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
  },
});
