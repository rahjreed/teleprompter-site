// The approved artwork is immutable. Builds validate it and copy only the Apple alias.
// Regenerate the padded derivative explicitly with: node scripts/render-brand-icons.mjs
import { readFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../public/brand/prompterson/approved-v1/", import.meta.url);
const approved = JSON.parse(await readFile(new URL("approved-brand-assets.json", import.meta.url), "utf8"));
for (const [file, expected] of Object.entries(approved)) {
  const bytes = await readFile(new URL(file, root));
  if (createHash("sha256").update(bytes).digest("hex") !== expected) {
    throw new Error(`Approved brand asset differs: ${file}. Do not redraw or replace it during a build.`);
  }
  const size = /^icon-(\d+)\.png$/.exec(file)?.[1];
  if (size && (bytes.readUInt32BE(16) !== Number(size) || bytes.readUInt32BE(20) !== Number(size))) {
    throw new Error(`Incorrect approved PNG dimensions: ${file}`);
  }
}
const mask = await readFile(new URL("icon-maskable.png", root));
if (mask.readUInt32BE(16) !== 512 || mask.readUInt32BE(20) !== 512) throw new Error("Maskable icon must be 512x512.");
await copyFile(new URL("icon-180.png", root), new URL("apple-touch-icon.png", root));
console.log("Validated approved Mr. Prompterson artwork; no icons redrawn.");

await import("./generate-launcher-icon.mjs");
