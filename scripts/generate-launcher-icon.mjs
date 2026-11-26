// Generate a larger launcher-only derivative from the immutable RGB PNG.
import { inflateSync, deflateSync } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";
const root = new URL("../public/brand/prompterson/approved-v1/", import.meta.url);
const src = await readFile(new URL("icon-512.png", root));
const n=512, stride=n*3;
if(src.readUInt32BE(16)!==n || src.readUInt32BE(20)!==n || src[24]!==8 || src[25]!==2 || src[28]!==0) throw Error("Expected noninterlaced RGB8 artwork");
const chunks=[];
for(let p=8;p<src.length;){const len=src.readUInt32BE(p);if(src.toString("ascii",p+4,p+8)==="IDAT")chunks.push(src.subarray(p+8,p+8+len));p+=len+12;}
const raw=inflateSync(Buffer.concat(chunks)), pixels=Buffer.alloc(n*stride);
function paeth(a,b,c){const p=a+b-c, x=Math.abs(p-a),y=Math.abs(p-b),z=Math.abs(p-c);return x<=y&&x<=z?a:y<=z?b:c;}
for(let y=0;y<n;y++){const f=raw[y*(stride+1)];for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=3?pixels[i-3]:0,b=y?pixels[i-stride]:0,c=y&&x>=3?pixels[i-stride-3]:0;pixels[i]=(raw[y*(stride+1)+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][f])&255;}}
function render(size){const out=Buffer.alloc(n*(stride+1));let clipped=0,marks=0;const offset=(n-size)/2;
for(let y=offset;y<offset+size;y++)for(let x=offset;x<offset+size;x++){const sx=(x-offset+.5)*n/size-.5,sy=(y-offset+.5)*n/size-.5;const a=Math.max(0,Math.floor(sx)),b=Math.max(0,Math.floor(sy)),c=Math.min(n-1,a+1),d=Math.min(n-1,b+1),u=Math.max(0,sx-a),v=Math.max(0,sy-b);const i=y*(stride+1)+1+x*3;for(let k=0;k<3;k++)out[i+k]=Math.round((1-v)*((1-u)*pixels[(b*n+a)*3+k]+u*pixels[(b*n+c)*3+k])+v*((1-u)*pixels[(d*n+a)*3+k]+u*pixels[(d*n+c)*3+k]));if(out[i]>170){marks++;if(Math.hypot(x-n/2,y-n/2)>n*.4-2)clipped++;}}
return {out,clipped,marks};}
let chosen;for(let size=400;size>=280;size-=2){const r=render(size);if(!r.clipped&&r.marks>1000){chosen={...r,size};break;}}
if(!chosen)throw Error("No safe launcher size");
const crc=b=>{let c=0xffffffff;for(const v of b){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
const chunk=(type,data)=>{const b=Buffer.concat([Buffer.from(type),data]);return Buffer.concat([u32(data.length),b,u32(crc(b))]);};
await writeFile(new URL("icon-maskable-v2.png",root),Buffer.concat([src.subarray(0,8),chunk("IHDR",src.subarray(16,29)),chunk("IDAT",deflateSync(chosen.out)),chunk("IEND",Buffer.alloc(0))]));
console.log("Launcher artwork scaled to "+chosen.size+"px (previously 280px); bright marks remain in safe circle.");
