import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  "pdfjs-dist/build/pdf.worker.min.mjs",
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
];

const source = candidates
  .map((candidate) => resolve(root, "node_modules", candidate))
  .find((path) => existsSync(path));

if (!source) {
  console.warn("PDF.js worker not found; PDF preview will fall back to the browser viewer.");
  process.exit(0);
}

mkdirSync(resolve(root, "public"), { recursive: true });
copyFileSync(source, resolve(root, "public", "pdf.worker.min.mjs"));
console.log("Copied PDF.js worker to public/pdf.worker.min.mjs");
