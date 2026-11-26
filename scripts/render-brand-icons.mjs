// Explicit, deterministic resizing of the attached artwork. Never draw a replacement face.
// Normal dev/build commands validate committed outputs and do not run this renderer.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
const root = new URL("../public/brand/prompterson/launcher-v4/", import.meta.url);
const manifestUrl = new URL("launcher-v4-assets.json", import.meta.url);
const approved = JSON.parse(await readFile(manifestUrl, "utf8"));
const source = await readFile(new URL("approved-master.png", root));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
if (hash(source) !== approved.sourceSha256) throw Error("The master differs from the approved attachment.");
const browser = await chromium.launch();
let rendered;
try {
  const page = await browser.newPage();
  rendered = await page.evaluate(async encoded => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    if (image.width !== image.height) throw Error("Approved launcher must be square; never crop the master.");
    function canvas(size) { const c = document.createElement("canvas"); c.width = c.height = size; return c; }
    const files = {};
    for (const size of [16, 32, 48, 180, 192, 512, 1024]) {
      const c = canvas(size), ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0, size, size);
      files[`icon-${size}.png`] = c.toDataURL("image/png").split(",")[1];
    }
    const sample = canvas(image.width), s = sample.getContext("2d");
    s.drawImage(image, 0, 0);
    const { data } = s.getImageData(0, 0, image.width, image.height);
    let radius = 0;
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      if (data[i+3] !== 255) throw Error("Expected the approved opaque, full-bleed master.");
      // Measure bright silver/white/red marks and dark eyewear, not the charcoal field.
      const eyewear = x > image.width*.08 && x < image.width*.92 && y > image.height*.18 && y < image.height*.6 && Math.max(data[i],data[i+1],data[i+2]) < 35;
      if (data[i] > 150 || eyewear) radius = Math.max(radius, Math.hypot(x+.5-image.width/2, y+.5-image.height/2));
    }
    const size = 512;
    // Largest even scale that keeps every measured feature 2px inside the safe circle.
    const artworkSize = Math.min(size, Math.floor(((size*.4-2) * image.width / radius)/2)*2);
    const inset = (size-artworkSize)/2;
    const c = canvas(size), ctx = c.getContext("2d");
    // Average only the peripheral background before extending it so one-pixel
    // texture does not become visible streaks. The central artwork is untouched.
    const background = canvas(32), bg = background.getContext("2d");
    bg.imageSmoothingQuality = "high";
    bg.drawImage(image,0,0,32,32);
    ctx.imageSmoothingQuality = "high";
    // Extend the existing background, without a frame, black tile or new shapes.
    const src = [[0,1],[0,32],[31,1]];
    const dst = [[0,inset],[inset,artworkSize],[inset+artworkSize,inset]];
    for (let y=0;y<3;y++) for (let x=0;x<3;x++) {
      if (x===1 && y===1) continue;
      ctx.drawImage(background,src[x][0],src[y][0],src[x][1],src[y][1],dst[x][0],dst[y][0],dst[x][1],dst[y][1]);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image,inset,inset,artworkSize,artworkSize);
    files["icon-maskable.png"] = c.toDataURL("image/png").split(",")[1];
    return { files, maskable: { size, artworkSize, inset, safeRadius: size*.4, safetyMargin: 2, sourceFeatureRadius: radius } };
  }, source.toString("base64"));
} finally { await browser.close(); }
const files = { "approved-master.png": hash(source) };
for (const [file, encoded] of Object.entries(rendered.files)) {
  const bytes = Buffer.from(encoded, "base64");
  await writeFile(new URL(file,root),bytes); files[file]=hash(bytes);
}
const apple = Buffer.from(rendered.files["icon-180.png"],"base64");
await writeFile(new URL("apple-touch-icon.png",root),apple); files["apple-touch-icon.png"]=hash(apple);
// Standard ICO container with the same approved image at 16, 32 and 48 pixels.
const sizes=[16,32,48], header=Buffer.alloc(6+16*sizes.length); header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
let offset=header.length; const images=[];
sizes.forEach((size,i)=>{const png=Buffer.from(rendered.files[`icon-${size}.png`],"base64"),p=6+16*i;header[p]=header[p+1]=size;header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(png.length,p+8);header.writeUInt32LE(offset,p+12);offset+=png.length;images.push(png);});
const ico=Buffer.concat([header,...images]);await writeFile(new URL("favicon.ico",root),ico);files["favicon.ico"]=hash(ico);
await writeFile(manifestUrl,JSON.stringify({...approved,files,maskable:rendered.maskable},null,2)+"\n");
console.log(JSON.stringify(rendered.maskable));
