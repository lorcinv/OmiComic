import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { pdfAssets } from "./scripts/pdfAssets";

export default defineConfig({
  base: "./",
  plugins: [react(), pdfAssets()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
