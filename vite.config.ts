import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { pdfAssets } from "./scripts/pdfAssets";
import { androidCssCompat } from "./scripts/androidCssCompat";
import path from 'node:path';

export default defineConfig(({ mode }) => ({
  base: "./",
  // Android System WebView updates independently of the OS. PDF.js's supported
  // legacy build supplies its own compatibility shims in both renderer and worker.
  resolve: { alias: mode === "android" ? [
    { find: /^pdfjs-dist$/, replacement: "pdfjs-dist/legacy/build/pdf.mjs" },
    { find: /^pdfjs-compat$/, replacement: "pdfjs-compat/legacy/build/pdf.mjs" },
    { find: /^pdfjs-dist\/build\/pdf.worker.min.mjs\?url$/, replacement: path.resolve('src/android/pdf.worker.ts') + '?worker&url' },
    { find: /^pdfjs-dist\/build\//, replacement: "pdfjs-dist/legacy/build/" },
  ] : [] },
  css: mode === 'android' ? { postcss: { plugins: [androidCssCompat()] } } : undefined,
  plugins: [react(), pdfAssets()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // SDKs, fixtures and packaging output must not trigger full-page reloads in a running app.
    watch: { ignored: ["**/.cache/**", "**/.packaged-app/**", "**/android/build/**", "**/dist-android/**", "**/dist-electron/**", "**/release/**", "**/test-results/**"] },
  },
  build: {
    target: mode === 'android' ? 'chrome70' : undefined,
    outDir: "dist",
    emptyOutDir: true,
  },
}));
