import fs from 'node:fs';
// Review the original frames without stretching individual bodies or synthesizing poses.
const out='.work/walk-review';fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(`${out}/index.html`,`<!doctype html><meta charset="utf-8"><title>主角逐帧行走检查</title>
<style>body{background:#19252c;color:#eadfca;font:16px sans-serif;margin:16px}canvas{width:100%;max-width:480px;background:#eee}button,input{margin:8px;padding:8px}img{width:100%;max-width:1000px}</style>
<h3>主角侧面行走 · 原始8帧检查</h3><canvas width="480" height="480"></canvas><p id="info"></p>
<button id="play">暂停 / 播放</button><button id="step">下一帧</button><label>帧率 <input id="fps" type="range" min="4" max="16" value="10"></label>
<p>下方为原始图。逐帧检查落脚、摆臂及首尾衔接。</p><img src="/assets/characters/girl-side-walk-v2.png">
<script>const img=new Image();img.src='/assets/characters/girl-side-walk-v2.png';const ctx=document.querySelector('canvas').getContext('2d');let frame=0,playing=true,last=0;
document.querySelector('#play').onclick=()=>playing=!playing;document.querySelector('#step').onclick=()=>{playing=false;frame=(frame+1)%8;};
function draw(t){const fps=Number(document.querySelector('#fps').value);if(playing&&t-last>1000/fps){frame=(frame+1)%8;last=t;}ctx.clearRect(0,0,480,480);if(img.complete&&img.naturalWidth){const w=img.width/4,h=img.height/2,scale=Math.min(440/w,440/h);ctx.drawImage(img,frame%4*w,Math.floor(frame/4)*h,w,h,(480-w*scale)/2,(480-h*scale)/2,w*scale,h*scale);}document.querySelector('#info').textContent='第 '+(frame+1)+' / 8 帧 · '+fps+' fps';requestAnimationFrame(draw);}requestAnimationFrame(draw);</script>`);
console.log('http://127.0.0.1:4173/.work/walk-review/index.html');
