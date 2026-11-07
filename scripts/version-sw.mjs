import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const path = join(dist, "sw.js");
const worker = (await readFile(path, "utf8")).replace(
  /callista-shell-(?:v1|[a-f0-9]{12})/,
  "callista-shell-v1",
);
const files = (await readdir(dist, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name))
  .sort();
const digest = createHash("sha256");
for (const file of files) {
  digest
    .update(relative(dist, file))
    .update("\0")
    .update(file === path ? worker : await readFile(file));
}
const hash = digest.digest("hex").slice(0, 12);
await writeFile(
  path,
  worker.replace("callista-shell-v1", `callista-shell-${hash}`),
);
console.log(`Versioned offline shell: ${hash}`);
