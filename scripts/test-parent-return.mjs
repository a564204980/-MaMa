import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';import {pathToFileURL} from 'node:url';
fs.mkdirSync('.work/wishes-tests',{recursive:true});
for(const name of ['House','Run']){const source=fs.readFileSync(`src/gameplay/${name}.ts`,'utf8').replace("'./House'","'./House.mjs'").replace("import collisionData from './collision-overrides.json';",`const collisionData=${fs.readFileSync('src/gameplay/collision-overrides.json','utf8')};`);fs.writeFileSync(`.work/wishes-tests/${name}.mjs`,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2020}}).outputText);}
const {Run}=await import(pathToFileURL(process.cwd()+'/.work/wishes-tests/Run.mjs'));
for (const index of [0,1]) {
 const r=new Run('parent-return');r.player={x:1200,y:700};const f=r.family[index];f.state='active';f.timer=.01;f.x=520;f.y=260;f.path=[];
 r.update(.1,{x:0,y:0});assert.equal(f.returning,true);assert.equal(f.state,'active');
 for(let n=0;n<1500&&f.state!=='sleep';n++)r.update(.1,{x:0,y:0});
 assert.equal(f.state,'sleep','parent returns to sleep');assert.equal(f.returning,false);
}
const r=new Run('inspection-return');r.sleeping=true;r.inspecting=true;r.inspectionTimer=.01;r.family[1].state='active';r.family[1].timer=20;r.family[1].x=500;r.family[1].y=300;
r.update(.1,{x:0,y:0});assert.equal(r.family[1].returning,true);
console.log('PASS parent timeout return, arrival sleep, successful inspection return');
