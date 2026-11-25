import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
const root = new URL('../public/brand/prompterson/', import.meta.url);
const crc = b => { let c=0xffffffff; for(const v of b){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0; };
const u32 = n => {const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
const chunk=(type,data)=>{const b=Buffer.concat([Buffer.from(type),data]);return Buffer.concat([u32(data.length),b,u32(crc(b))]);};
const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*Math.max(0,Math.min(1,t))));
const navy=[2,6,23],gold=[251,191,36];
function rounded(x,y,l,t,w,h,r){const dx=Math.max(l+r-x,0,x-(l+w-r)),dy=Math.max(t+r-y,0,y-(t+h-r));return dx*dx+dy*dy<=r*r;}
function pixel(x,y,mask){
 let bg=mix([30,41,59],navy,(x*.7+y)/870);
 if(mask){x=(x-256)/.78+256;y=(y-256)/.78+256;}
 if(rounded(x,y,76,106,360,316,56))bg=mix(bg,navy,.5);
 if(rounded(x,y,74.5,94.5,363,319,57.5))bg=mix(bg,gold,.85);
 if(rounded(x,y,77.5,97.5,357,313,54.5))bg=mix([51,65,85],[15,23,42],(y-96)/316);
 for(const [t,w] of [[152,241],[208,208],[264,158],[320,122]])if(rounded(x,y,123,t,w,30,15))bg=gold;
 const d=(x-362)**2+(y-332)**2;
 if(d<=68**2)bg=navy;
 if(d<=56**2)bg=mix([255,101,112],[240,43,60],(y-276)/112);
 return bg;
}
for(const [name,n,mask] of [['icon-192.png',192,false],['icon-512.png',512,false],['icon-maskable.png',512,true],['apple-touch-icon.png',180,false]]){
 const raw=Buffer.alloc(n*(1+3*n));
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const sum=[0,0,0];for(const dy of [.25,.75])for(const dx of [.25,.75]){const p=pixel((x+dx)*512/n,(y+dy)*512/n,mask);for(let i=0;i<3;i++)sum[i]+=p[i];}for(let i=0;i<3;i++)raw[y*(1+3*n)+1+3*x+i]=Math.round(sum[i]/4);}
 const header=Buffer.concat([u32(n),u32(n),Buffer.from([8,2,0,0,0])]);
 writeFileSync(new URL(name,root),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}
