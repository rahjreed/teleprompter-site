import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const html = await readFile(new URL("../dist/index.html", import.meta.url));
const hash = createHash("sha256").update(html).digest("hex").slice(0, 12);
const path = new URL("../dist/sw.js", import.meta.url);
const worker = await readFile(path, "utf8");
await writeFile(
  path,
  worker.replace("callista-shell-v1", `callista-shell-${hash}`),
);
console.log(`Versioned offline shell: ${hash}`);
