import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const directory = new URL("../public/brand/prompterson/", import.meta.url);
const icon = await readFile(new URL("favicon.svg", directory), "utf8");
// Scale the foreground around the center so even its corners fit the maskable safe circle.
const maskable = icon.replace(
  'id="icon-mark"',
  'id="icon-mark" transform="translate(58.88 58.88) scale(.77)"',
);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const [file, size, svg] of [
    ["icon-192.png", 192, icon],
    ["icon-512.png", 512, icon],
    ["icon-maskable.png", 512, maskable],
    ["apple-touch-icon.png", 180, icon],
  ]) {
    const png = await page.evaluate(
      async ({ svg, size }) => {
        const image = new Image(size, size);
        image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        canvas.getContext("2d").drawImage(image, 0, 0, size, size);
        return canvas.toDataURL("image/png").split(",")[1];
      },
      { svg, size },
    );
    await writeFile(new URL(file, directory), Buffer.from(png, "base64"));
  }
} finally {
  await browser.close();
}
