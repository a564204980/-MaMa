import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import assert from 'node:assert/strict';
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);
 const exports={};cache.set(file,exports);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('exports','require',code)(exports,p=>load(path.resolve(path.dirname(file),p+'.ts')));return exports;
}
const {playerPose}=load('src/systems/PlayerGait.ts');
for(let d=0;d<3;d++)for(let r=0;r<=1;r++)for(let n=0;n<100;n++){
 const p=playerPose(n/100*Math.PI*2,1,r,d);
 for(const limb of [...p.legs,...p.arms])for(const point of Object.values(limb))assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));
 const next=playerPose(n/100*Math.PI*2+Math.PI*2,1,r,d);
 assert.ok(Math.abs(p.legs[0].tip.y-next.legs[0].tip.y)<1e-8,'cycle closes');
}
const contact=playerPose(0,1,1,2),swing=playerPose(Math.PI/2,1,1,2);
assert.equal(contact.legs[0].tip.y,0);
assert.ok(swing.legs[1].tip.y<0,'opposite foot lifts');
assert.ok(contact.arms[0].tip.x<contact.arms[0].root.x,'arm opposes forward leg');
const {CharacterSprites}=load('src/systems/CharacterSprites.ts');
function simulate(fps){const s=new CharacterSprites();s.track('player',{x:0,y:0},1/fps);for(let i=1;i<=fps;i++)s.track('player',{x:i*60/fps,y:0},1/fps);return s;}
const a=simulate(30),b=simulate(60);
assert.ok(Math.abs(a.motion.get('player').stride-b.motion.get('player').stride)<1e-6);
const before=b.motion.get('player').stride;
for(let i=0;i<60;i++)b.track('player',{x:60,y:0},1/60);
assert.equal(b.motion.get('player').stride,before,'blocked/idle feet do not advance');
assert.ok(b.motion.get('player').amount<.001,'relaxes to stand');
b.track('player',{x:600,y:0},1/60);
assert.equal(b.motion.get('player').stride,before,'teleport is not a step');
console.log('Player gait: cycles, alternating feet/arms, frame independence, stop and teleport passed.');
