import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
/** Keep runtime PDF dependencies local, including CJK maps and JPX decoders. */
export function pdfAssets(): Plugin {
  return {
    name: "local-pdf-assets",
    buildStart() {
      const destination = path.resolve("public/pdfjs");
      mkdirSync(destination, { recursive: true });
      for (const folder of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
        cpSync(path.resolve("node_modules/pdfjs-dist", folder), path.join(destination, folder), { recursive: true });
      }
    },
  };
}
