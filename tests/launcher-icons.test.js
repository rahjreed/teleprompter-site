import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const root = new URL("../public/brand/prompterson/", import.meta.url);
const hash = b => createHash("sha256").update(b).digest("hex");
async function snapshot() {
 const values = {};
 for (const file of await readdir(root,{recursive:true})) if (/\.(png|svg|ico)$/.test(file)) values[file]=hash(await readFile(new URL(file.replaceAll("\\","/"),root)));
 return values;
}
test("build icon validation never replaces the approved source, generated icons, mascot or backup", async () => {
 const before = await snapshot();
 execFileSync(process.execPath,["scripts/generate-brand-icons.mjs"],{stdio:"pipe"});
 assert.deepEqual(await snapshot(), before);
 const manifest = JSON.parse(await readFile(new URL("../scripts/launcher-v4-assets.json",import.meta.url),"utf8"));
 const master = await readFile(new URL("launcher-v4/approved-master.png",root));
 assert.equal(hash(master),manifest.sourceSha256);
 for (const size of [16,32,48,180,192,512,1024]) {
  const png = await readFile(new URL(`launcher-v4/icon-${size}.png`,root));
  assert.equal(png.readUInt32BE(16),size); assert.equal(png.readUInt32BE(20),size);
 }
 assert.equal(manifest.maskable.artworkSize,358);
 assert.ok(manifest.maskable.artworkSize > 280, "avoid the prior overly conservative tile padding");
});
