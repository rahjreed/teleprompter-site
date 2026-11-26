// Build-time validation only. Explicit regeneration: node scripts/render-brand-icons.mjs
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root=new URL("../public/brand/prompterson/launcher-v4/",import.meta.url);
const approved=JSON.parse(await readFile(new URL("launcher-v4-assets.json",import.meta.url),"utf8"));
if (!approved.files || approved.files["approved-master.png"] !== approved.sourceSha256) throw Error("Missing approved launcher provenance.");
for(const [file,expected] of Object.entries(approved.files)) {
  const bytes=await readFile(new URL(file,root));
  if(createHash("sha256").update(bytes).digest("hex")!==expected) throw Error(`Launcher asset differs from approved output: ${file}. Do not regenerate from old artwork.`);
  const size=/^icon-(\d+)\.png$/.exec(file)?.[1] || (file==="apple-touch-icon.png" ? 180 : file==="icon-maskable.png" ? 512 : null);
  if(size && (bytes.readUInt32BE(16)!==Number(size) || bytes.readUInt32BE(20)!==Number(size))) throw Error(`Incorrect launcher dimensions: ${file}`);
}
console.log("Validated approved borderless launcher assets; no artwork regenerated.");
