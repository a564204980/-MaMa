import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';import {pathToFileURL} from 'node:url';
fs.mkdirSync('.work/wishes-tests',{recursive:true});
for(const name of ['House','Run']){const source=fs.readFileSync(`src/gameplay/${name}.ts`,'utf8').replace("'./House'","'./House.mjs'").replace("import collisionData from './collision-overrides.json';",`const collisionData=${fs.readFileSync('src/gameplay/collision-overrides.json','utf8')};`);fs.writeFileSync(`.work/wishes-tests/${name}.mjs`,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2020}}).outputText);}
const {Run}=await import(pathToFileURL(process.cwd()+'/.work/wishes-tests/Run.mjs'));
const {walkable,route,distance}=await import(pathToFileURL(process.cwd()+'/.work/wishes-tests/House.mjs'));
const tick=(r,seconds)=>{for(let i=0;i<Math.ceil(seconds*10);i++)r.update(.1,{x:0,y:0});};
const at=(r,kind)=>{const s=r.spots.find(s=>s.kind===kind);r.player={x:s.x,y:s.y};return s;};
const r=new Run('wishes');
for(const s of r.spots.filter(s=>['toy','cake','tv','storage'].includes(s.kind))){assert(walkable({x:s.x,y:s.y+20},new Set(),10),s.kind+' spawn blocked');assert(route(r.player,s).length,s.kind+' unreachable');}
console.log(r.spots.filter(s=>['cake','tv','storage','toy'].includes(s.kind)).map(s=>({id:s.id,x:s.x,y:s.y})));
at(r,'cake');r.interact();assert.equal(r.activity,'cake');tick(r,3);assert(r.cakeProgress>0&&r.cakeProgress<1);
r.update(.1,{x:1,y:0});assert.equal(r.activity,null);const cp=r.cakeProgress;tick(r,1);assert.equal(r.cakeProgress,cp);
at(r,'cake');r.interact();tick(r,6);assert.equal(r.cakeProgress,1);assert.equal(r.completed,1);assert.equal(r.activity,null);
at(r,'tv');r.interact();tick(r,2);const tp=r.tvProgress;r.update(.1,{x:1,y:0});assert.equal(r.activity,null);assert(r.tvOn);tick(r,1);assert.equal(r.tvProgress,tp);
at(r,'tv');r.interact(true);assert.equal(r.tvOn,false);r.interact();tick(r,11);assert.equal(r.tvProgress,1);assert(r.tvOn);r.interact();assert.equal(r.tvOn,false);assert(r.canFinish);
const toy=at(r,'toy');r.interact();assert.equal(r.carrying.id,toy.id);assert.equal(r.moveSpeed,102);
r.player={x:1030,y:540};r.interact();assert.equal(r.carrying,null);assert.equal(r.moveSpeed,120);assert(!r.found.has(toy.id));assert(distance(toy,r.player)<=132);assert(walkable({x:toy.x,y:toy.y+20},new Set(),10));
r.player={x:toy.x,y:toy.y};r.interact();at(r,'storage');r.interact();assert.equal(r.delivered,1);assert.equal(r.carrying,null);assert.equal(r.completed,3);
const before=r.delivered;r.interact();assert.equal(r.delivered,before,'storage cannot farm rewards');
const lose=new Run('caught');at(lose,'cake');lose.interact();tick(lose,2);const saved=lose.cakeProgress;lose._caught();assert.equal(lose.activity,null);assert.equal(lose.cakeProgress,saved);assert.equal(lose.caughtByFamily,1);
const win=new Run('win');win.cakeProgress=1;win.tvProgress=1;at(win,'bed');win.interact();tick(win,4.1);assert(win.escaped,'two wishes then bed wins');
const noWin=new Run('no-win');noWin.cakeProgress=1;at(noWin,'bed');noWin.interact();tick(noWin,4.1);assert(!noWin.escaped,'one wish not enough');
const timeout=new Run('timeout');timeout.elapsed=timeout.timeLimit-.05;timeout.update(.1,{x:0,y:0});assert.equal(timeout.phase,'result');assert(!timeout.escaped);
console.log('PASS wishes: reachable props, timed actions, interruption/resume, TV persistence, pickup/drop/deposit, speed, caught progress, win/timeout.');
