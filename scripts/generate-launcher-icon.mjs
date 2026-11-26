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
// Extend the original charcoal face beyond its silver frame. Sample only
// inside the original rounded panel; the operating system supplies the outer mask.
function sample(x,y,k){
  const lo=27,hi=484,rad=111;
  x=Math.max(lo,Math.min(hi,x));y=Math.max(lo,Math.min(hi,y));
  const cx=Math.max(lo+rad,Math.min(hi-rad,x)),cy=Math.max(lo+rad,Math.min(hi-rad,y));
  const dx=x-cx,dy=y-cy,d=Math.hypot(dx,dy);
  if(d>rad){x=cx+dx*rad/d;y=cy+dy*rad/d;}
  const a=Math.floor(x),b=Math.floor(y),c=a+1,e=b+1,u=x-a,v=y-b;
  return Math.round((1-v)*((1-u)*pixels[(b*n+a)*3+k]+u*pixels[(b*n+c)*3+k])+v*((1-u)*pixels[(e*n+a)*3+k]+u*pixels[(e*n+c)*3+k]));
}
function render(size,dim=n){
  const row=dim*3+1,out=Buffer.alloc(dim*row);let clipped=0,marks=0;
  for(let y=0;y<dim;y++)for(let x=0;x<dim;x++){
    const sx=(x+.5-dim/2)*n/size+n/2-.5,sy=(y+.5-dim/2)*n/size+n/2-.5;
    const i=y*row+1+x*3;
    for(let k=0;k<3;k++)out[i+k]=sample(sx,sy,k);
    if(out[i]>170){marks++;if(Math.hypot(x-dim/2,y-dim/2)>dim*.4-2)clipped++;}
  }
  return {out,clipped,marks};
}
let chosen;for(let size=400;size>=280;size-=2){const r=render(size);if(!r.clipped&&r.marks>1000){chosen={...r,size};break;}}
if(!chosen)throw Error("No safe launcher size");
const crc=b=>{let c=0xffffffff;for(const v of b){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
const chunk=(type,data)=>{const b=Buffer.concat([Buffer.from(type),data]);return Buffer.concat([u32(data.length),b,u32(crc(b))]);};
async function save(name,dim,raw){
  const header=Buffer.from(src.subarray(16,29));header.writeUInt32BE(dim,0);header.writeUInt32BE(dim,4);
  await writeFile(new URL(name,root),Buffer.concat([src.subarray(0,8),chunk("IHDR",header),chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]));
}
await save("icon-maskable-v3.png",512,chosen.out);
for(const dim of [192,512])await save("launcher-v3-"+dim+".png",dim,render(dim,dim).out);
console.log("Launcher artwork scaled to "+chosen.size+"px (previously 280px); bright marks remain in safe circle.");
