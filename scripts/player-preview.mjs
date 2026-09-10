import fs from 'node:fs';
import ts from 'typescript';
const out='.work/player-preview';fs.mkdirSync(out,{recursive:true});
for(const file of ['core/ResourceManager','systems/PlayerGait','systems/PlayerRig','gameplay/PlayerRigFrames']){
 const code=ts.transpileModule(fs.readFileSync(`src/${file}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2020}}).outputText
 .replace(/from ['"]([^'"]+)['"]/g,(_,p)=>`from './${p.split('/').pop()}.js'`);
 fs.writeFileSync(`${out}/${file.split('/').pop()}.js`,code);
}
fs.writeFileSync(`${out}/index.html`,`<!doctype html><meta charset="utf-8"><title>主角动作检查</title><style>body{background:#14202a;color:#e8dcc1;font:16px sans-serif;margin:8px}canvas{background:#253442;display:block;max-width:100%}button{padding:12px;margin:8px}</style><h3>主角分层动画</h3><button id="stop">暂停 / 继续</button><canvas width="320" height="640"></canvas><script type="module">
import {globalResources} from './ResourceManager.js';import {PlayerRig} from './PlayerRig.js';
await globalResources.loadImage('player-rig','/assets/images/player-rig.png');const rig=new PlayerRig(),c=document.querySelector('canvas'),ctx=c.getContext('2d');let time=0,prev=0,paused=false;document.querySelector('button').onclick=()=>paused=!paused;
function draw(ms){if(!paused)time+=Math.min(.05,(ms-prev)/1000);prev=ms;ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#e8dcc1';ctx.font='18px sans-serif';
ctx.fillText('慢走',45,24);ctx.fillText('快跑',205,24);
for(let row=0;row<2;row++){for(let d=0;d<3;d++){ctx.save();ctx.translate(80+row*160,195+d*210);ctx.scale(2.6,2.6);rig.draw(ctx,{x:0,y:-23},d,false,time*(row?14:6),1,row,1);ctx.restore();}}
requestAnimationFrame(draw);}requestAnimationFrame(draw);
</script>`);
console.log('http://127.0.0.1:4173/.work/player-preview/index.html');
