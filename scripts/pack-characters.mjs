// Deterministic game-asset preparation: crop generated sheets, remove border-connected
// neutral backdrop, align feet and pack compact runtime frames. Source art is untouched.
import fs from 'node:fs';
import zlib from 'node:zlib';
function readPNG(file){const b=fs.readFileSync(file);let w,h,type,parts=[];for(let p=8;p<b.length;){const n=b.readUInt32BE(p),t=b.toString('ascii',p+4,p+8),d=b.subarray(p+8,p+8+n);if(t==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);type=d[9];if(d[8]!==8||d[12]!==0)throw Error('Unsupported PNG');}if(t==='IDAT')parts.push(d);p+=n+12;}const channels=type===2?3:type===6?4:0;if(!channels)throw Error('Unsupported color');const raw=zlib.inflateSync(Buffer.concat(parts)),out=Buffer.alloc(w*h*4),prev=Buffer.alloc(w*channels);let k=0;for(let y=0;y<h;y++){const f=raw[k++],row=Buffer.alloc(w*channels);for(let x=0;x<row.length;x++){const a=x>=channels?row[x-channels]:0,c=x>=channels?prev[x-channels]:0,v=prev[x],p=a+v-c,pa=Math.abs(p-a),pb=Math.abs(p-v),pc=Math.abs(p-c);row[x]=(raw[k++]+(f===0?0:f===1?a:f===2?v:f===3?Math.floor((a+v)/2):pa<=pb&&pa<=pc?a:pb<=pc?v:c))&255;}for(let x=0;x<w;x++){const q=(y*w+x)*4;out[q]=row[x*channels];out[q+1]=row[x*channels+1];out[q+2]=row[x*channels+2];out[q+3]=channels===4?row[x*channels+3]:255;}row.copy(prev);}return{w,h,data:out};}
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type,data){const t=Buffer.from(type),body=Buffer.concat([t,data]);let c=0xffffffff;for(const b of body)c=crcTable[(c^b)&255]^(c>>>8);const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE((c^0xffffffff)>>>0);return Buffer.concat([head,body,tail]);}
function writePNG(file,w,h,data){const ih=Buffer.alloc(13);ih.writeUInt32BE(w);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;const raw=Buffer.alloc(h*(w*4+1));for(let y=0;y<h;y++)data.copy(raw,y*(w*4+1)+1,y*w*4,(y+1)*w*4);fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]));}
function cut(img,col,row,cols,rows){const x0=Math.floor(col*img.w/cols),y0=Math.floor(row*img.h/rows),w=Math.floor((col+1)*img.w/cols)-x0,h=Math.floor((row+1)*img.h/rows)-y0,data=Buffer.alloc(w*h*4);for(let y=0;y<h;y++)img.data.copy(data,y*w*4,((y+y0)*img.w+x0)*4,((y+y0)*img.w+x0+w)*4);
 const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let a=0,b=0;function visit(p){if(seen[p])return;seen[p]=1;const q=p*4,r=data[q],g=data[q+1],v=data[q+2];if(data[q+3]===0||(Math.min(r,g,v)>100&&Math.max(r,g,v)-Math.min(r,g,v)<55)){queue[b++]=p;data[q+3]=0;}}
 for(let x=0;x<w;x++){visit(x);visit((h-1)*w+x);}for(let y=0;y<h;y++){visit(y*w);visit(y*w+w-1);}while(a<b){const p=queue[a++],x=p%w,y=Math.floor(p/w);if(x)visit(p-1);if(x<w-1)visit(p+1);if(y)visit(p-w);if(y<h-1)visit(p+w);}
 // Remove stray fragments from adjacent grid cells; retain the main connected silhouette.
 const labels=new Int32Array(w*h);let label=0,best=0,bestSize=0;
 for(let p=0;p<w*h;p++)if(data[p*4+3]&&!labels[p]){label++;let head=0,tail=1;queue[0]=p;labels[p]=label;while(head<tail){const v=queue[head++],x=v%w,y=Math.floor(v/w);for(const q of [x?v-1:-1,x<w-1?v+1:-1,y?v-w:-1,y<h-1?v+w:-1])if(q>=0&&data[q*4+3]&&!labels[q]){labels[q]=label;queue[tail++]=q;}}if(tail>bestSize){best=label;bestSize=tail;}}
 let l=w,t=h,r=0,d=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const q=y*w+x;if(labels[q]!==best)data[q*4+3]=0;if(data[q*4+3]){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);d=Math.max(d,y);}}if(r<=l||d<=t)throw Error('Empty sprite');return{w,h,data,l,t,r,d};}
export { readPNG, writePNG, cut };
if (process.argv[1]?.replaceAll('\\','/').endsWith('/pack-characters.mjs')) {
const frames={},tiles=[],names=['girl','father','mother','baby'];
function add(name,img,c,r,cols,rows){frames[name]={x:tiles.length%10*96,y:Math.floor(tiles.length/10)*128,w:96,h:128};tiles.push(cut(img,c,r,cols,rows));}
for(const name of names){const img=readPNG(`assets/characters/${name}-sheet-v1.png`),rows=name==='father'||name==='mother'?2:1;for(let d=0;d<3;d++)add(`${name}-idle-${d}`,img,d,0,3,rows);if(rows===2)for(let d=0;d<3;d++)add(`${name}-angry-${d}`,img,d,1,3,rows);}
for(const name of ['girl','father','mother'])for(const angry of name==='girl'?[false]:[false,true]){const img=readPNG(`assets/characters/${name}-${angry?'angry-':''}walk-v1.png`);for(let d=0;d<3;d++)for(let f=0;f<2;f++){const special=name==='mother'&&!angry;const c=special?d:f,r=special?f:d;add(`${name}-${angry?'angrywalk':'walk'}-${d}-${f}`,img,c,r,4,3);}}
const width=960,height=Math.ceil(tiles.length/10)*128,atlas=Buffer.alloc(width*height*4);
tiles.forEach((s,i)=>{const ratio=Math.min(84/(s.r-s.l+1),112/(s.d-s.t+1)),w=Math.round((s.r-s.l+1)*ratio),h=Math.round((s.d-s.t+1)*ratio),ox=i%10*96+Math.floor((96-w)/2),oy=Math.floor(i/10)*128+120-h;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const sx=Math.min(s.r,s.l+Math.floor(x/ratio)),sy=Math.min(s.d,s.t+Math.floor(y/ratio)),q=(sy*s.w+sx)*4,target=((oy+y)*width+ox+x)*4;s.data.copy(atlas,target,q,q+4);}});
writePNG('assets/images/characters-runtime.png',width,height,atlas);
fs.writeFileSync('src/gameplay/CharacterFrames.ts','// Generated by scripts/pack-characters.mjs\nexport const characterFrames: Record<string,{x:number;y:number;w:number;h:number}> = '+JSON.stringify(frames)+';\n');
console.log(`Packed ${tiles.length} frames; ${fs.statSync('assets/images/characters-runtime.png').size} bytes`);
}

