// Only add a safe-zone surround; never regenerate or reinterpret the approved artwork.
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
const root = new URL("../public/brand/prompterson/approved-v1/", import.meta.url);
const source = await readFile(new URL("icon-512.png", root));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const png = await page.evaluate(async encoded => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const context = canvas.getContext("2d");
    context.fillStyle = "#000000";
    context.fillRect(0, 0, 512, 512);
    // Even the corners of this entire 280px square fit within the 40% safe circle.
    context.drawImage(image, 116, 116, 280, 280);
    return canvas.toDataURL("image/png").split(",")[1];
  }, source.toString("base64"));
  await writeFile(new URL("icon-maskable.png", root), Buffer.from(png, "base64"));
} finally { await browser.close(); }
