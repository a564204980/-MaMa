import {readPNG,writePNG,cut} from './pack-characters.mjs';
const img=readPNG('assets/props/wishes-props-v1.png');
for(let q=0;q<img.data.length;q+=4)if(img.data[q+1]>180&&img.data[q]<70&&img.data[q+2]<70)img.data[q+3]=0;
const out=Buffer.alloc(480*96*4);
for(let i=0;i<5;i++){
 const s=cut(img,i,0,5,1),ratio=Math.min(84/(s.r-s.l+1),84/(s.d-s.t+1));
 const w=Math.round((s.r-s.l+1)*ratio),h=Math.round((s.d-s.t+1)*ratio);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const q=(Math.min(s.d,s.t+Math.floor(y/ratio))*s.w+Math.min(s.r,s.l+Math.floor(x/ratio)))*4;
  s.data.copy(out,((Math.floor((96-h)/2)+y)*480+i*96+Math.floor((96-w)/2)+x)*4,q,q+4);
 }
}
writePNG('assets/images/wish-props.png',480,96,out);
