import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { pdfAssets } from "./scripts/pdfAssets";

export default defineConfig(({ mode }) => ({
  base: "./",
  // Android System WebView updates independently of the OS. PDF.js's supported
  // legacy build supplies its own compatibility shims in both renderer and worker.
  resolve: { alias: mode === "android" ? [
    { find: /^pdfjs-dist$/, replacement: "pdfjs-dist/legacy/build/pdf.mjs" },
    { find: /^pdfjs-dist\/build\//, replacement: "pdfjs-dist/legacy/build/" },
  ] : [] },
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
}));
