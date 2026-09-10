import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'src/gameplay/collision-overrides.json');
const port = Number(process.env.COLLISION_EDITOR_PORT || 4174);
let saving = false;
export function validate(data) {
  if(data?.version!==1 || !Array.isArray(data.shapes) || data.shapes.length>500) throw Error('区域数据格式不正确');
  const ids=new Set();
  for(const s of data.shapes) {
    if(typeof s.id!=='string'||s.id.length>100||ids.has(s.id)||!['wall','furniture'].includes(s.kind)||!Array.isArray(s.points)||s.points.length<3||s.points.length>100) throw Error('区域类型、编号或顶点数量不正确');
    ids.add(s.id);
    for(const p of s.points) if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>1580||p.y>996) throw Error('顶点必须位于背景范围内');
    const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    const a=s.points[0], b=s.points.find(p=>p.x!==a.x||p.y!==a.y);
    if(!b || !s.points.some(p=>Math.abs(cross(a,b,p))>=1)) throw Error('区域至少需要三个不在同一直线上的点');
  }
  const doorIds=['parents','player','nursery','bathroom','computer'];
  if(data.doors!==undefined) {
    if(!Array.isArray(data.doors)||data.doors.length!==5||new Set(data.doors.map(d=>d.id)).size!==5) throw Error('必须保留五扇现有门');
    for(const d of data.doors) if(!doorIds.includes(d.id)||![d.x,d.y,d.w,d.h].every(Number.isFinite)||d.w<2||d.h<2||d.x-d.w/2<0||d.y-d.h/2<0||d.x+d.w/2>1580||d.y+d.h/2>996) throw Error('门的位置或大小无效');
  }
  const doors=data.doors;
  return { version:1, shapes:data.shapes.map(s=>({id:s.id,kind:s.kind,points:s.points.map(p=>({x:p.x,y:p.y}))})), ...(doors?{doors:doors.map(d=>({id:d.id,x:d.x,y:d.y,w:d.w,h:d.h}))}:{}) };
}
function geometry() {
  const source=fs.readFileSync(path.join(root,'src/gameplay/House.ts'),'utf8').replace("import collisionData from './collision-overrides.json';",`const collisionData = ${fs.readFileSync(target,'utf8')};`);
  const exports={}; new Function('exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(exports);
  return {version:1,shapes:exports.collisionShapes,floors:exports.floors,doors:exports.doorDefinitions};
}
function build() { return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(root,'node_modules/rollup/dist/bin/rollup'),'-c'],{cwd:root,windowsHide:true}); let log='';
  child.stdout.on('data',s=>log+=s); child.stderr.on('data',s=>log+=s); child.on('error',reject); child.on('exit',code=>code===0?resolve():reject(Error(log.slice(-2000))));
}); }
const routes={'/':'editor.html','/editor.js':'scripts/editor.js','/background.png':'assets/images/house-night-merged.png'};
http.createServer(async(req,res)=>{
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try {
    if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`) return reply(403,{error:'仅允许本机访问'});
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'&&url.pathname==='/api/collisions') return reply(200,geometry());
    if(req.method==='POST'&&url.pathname==='/api/collisions') {
      if(req.headers.origin!==`http://${req.headers.host}`||!req.headers['content-type']?.startsWith('application/json')) return reply(403,{error:'请从本机编辑器保存'});
      if(saving) return reply(409,{error:'正在保存，请稍候'});
      let body=''; for await(const chunk of req) {body+=chunk;if(body.length>512000) return reply(413,{error:'数据过大'});}
      const incoming=JSON.parse(body);
      if(incoming.doors===undefined) incoming.doors=JSON.parse(fs.readFileSync(target,'utf8')).doors;
      const data=validate(incoming); saving=true;
      try {
        fs.mkdirSync(path.join(root,'.work'),{recursive:true});
        fs.copyFileSync(target,path.join(root,'.work/collision-overrides.previous.json'));
        fs.writeFileSync(target+'.tmp',JSON.stringify(data,null,2)+'\n'); fs.renameSync(target+'.tmp',target);
        try {await build();reply(200,{ok:true});} catch(e) {reply(500,{saved:true,error:'数据已保存，但构建失败：'+e.message});}
      } finally {saving=false;} return;
    }
    if(req.method!=='GET'||!routes[url.pathname]) return reply(404,{error:'Not found'});
    res.writeHead(200,{'Content-Type':url.pathname.endsWith('.png')?'image/png':url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});
    res.end(fs.readFileSync(path.join(root,routes[url.pathname])));
  } catch(e) {reply(400,{error:e.message});}
}).listen(port,'127.0.0.1',()=>console.log(`Collision editor: http://127.0.0.1:${port}`));
