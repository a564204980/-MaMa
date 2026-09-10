const $=id=>document.getElementById(id), canvas=$('canvas'),ctx=canvas.getContext('2d');
canvas.tabIndex=0;
document.querySelector('h1').textContent='爸妈睡着以后 / 碰撞编辑 · v1.4';
let shapes=[],floors=[],doors=[],selected=null,tool='select',draft=[],drag=null,scale=1,offset={x:0,y:0},width=0,height=0,space=false,ready=false,saving=false;
let undo=[],redo=[],draftRedo=[],saved='',probe=null;
const editState=()=>JSON.stringify({shapes,draft,selected,tool});
function restoreEdit(value){const state=JSON.parse(value);shapes=state.shapes;draft=state.draft;selected=state.selected;tool=state.tool;draftRedo=[];document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));canvas.style.cursor=tool==='select'?'default':'crosshair';}
const image=new Image(), W=1580,H=996;
const doorNames={parents:'父母房门',player:'你的房门',nursery:'婴儿房门',bathroom:'卫生间门',computer:'电脑房门'};
function syncDoors(){doors=shapes.filter(s=>s.kind==='door').map(s=>{const xs=s.points.map(p=>p.x),ys=s.points.map(p=>p.y);return{id:s.id.slice(5),x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2,w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};});}
const snapshot=()=>JSON.stringify(shapes), copy=x=>JSON.parse(JSON.stringify(x));
const message=s=>$('status').textContent=s;
function checkpoint(){undo.push(editState());if(undo.length>100)undo.shift();redo=[];}
function dirty(){ $('dirty').textContent=draft.length?'多边形绘制中 · Ctrl+Z 撤销上一点':snapshot()===saved?'已与项目保存一致':'有未保存的修改';$('undo').disabled=!undo.length;$('redo').disabled=!redo.length;$('delete').disabled=!selected||shapes.some(s=>s.id===selected&&s.kind==='door');$('finish').disabled=draft.length<3; }
function refresh(){
  syncDoors();
  $('count').textContent=`(${shapes.length})`;$('list').replaceChildren();
  shapes.forEach((s,i)=>{const o=document.createElement('option');o.value=s.id;o.textContent=`${i+1}. ${s.kind==='door'?doorNames[s.id.slice(5)]:s.kind==='wall'?'墙体':'家具'} · ${s.points.length} 顶点`;o.selected=s.id===selected;$('list').append(o);});
  const s=shapes.find(s=>s.id===selected);$('selection').textContent=s?`${s.kind==='door'?doorNames[s.id.slice(5)]:s.kind==='wall'?'墙体':'家具'}：${s.points.map(p=>`${p.x},${p.y}`).join(' / ')}`:'尚未选择';dirty();draw();
}
function fit(){scale=Math.min((width-50)/W,(height-70)/H);offset={x:(width-W*scale)/2,y:(height-H*scale)/2-15};draw();}
function resize(){const r=$('stage').getBoundingClientRect();width=r.width;height=r.height;const d=devicePixelRatio||1;canvas.width=Math.round(width*d);canvas.height=Math.round(height*d);if(ready)fit();}
function path(points){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();}
function inside(p,points){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;}
function outsideDoors(p,radius){
  let pieces=[{x:p.x-radius,y:p.y-radius,w:radius*2,h:radius*2}];
  for(const d of doors){const next=[];for(const r of pieces){
    const l=Math.max(r.x,d.x-d.w/2),t=Math.max(r.y,d.y-d.h/2),right=Math.min(r.x+r.w,d.x+d.w/2),bottom=Math.min(r.y+r.h,d.y+d.h/2);
    if(l>=right||t>=bottom){next.push(r);continue;}
    if(t>r.y)next.push({x:r.x,y:r.y,w:r.w,h:t-r.y});
    if(bottom<r.y+r.h)next.push({x:r.x,y:bottom,w:r.w,h:r.y+r.h-bottom});
    if(l>r.x)next.push({x:r.x,y:t,w:l-r.x,h:bottom-t});
    if(right<r.x+r.w)next.push({x:right,y:t,w:r.x+r.w-right,h:bottom-t});
  }pieces=next;}return pieces;
}
function blocked(p,points,radius=10,halfHeight=radius){
  if(inside(p,points))return true;
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];let lo=0,hi=1;
    for(const[v,d,min,max]of[[a.x,b.x-a.x,p.x-radius,p.x+radius],[a.y,b.y-a.y,p.y-halfHeight,p.y+halfHeight]]){if(Math.abs(d)<1e-9){if(v<min||v>max){hi=-1;break;}}else{const t=(min-v)/d,u=(max-v)/d;lo=Math.max(lo,Math.min(t,u));hi=Math.min(hi,Math.max(t,u));}}if(lo<=hi)return true;
  }return false;
}
function reason(p){
  if(p.x-10<0||p.y-10<0||p.x+10>W||p.y+10>H)return '超出地图外边界';
  const pieces=outsideDoors(p,10);
  const hit=shapes.find(s=>s.kind!=='door'&&pieces.some(r=>blocked({x:r.x+r.w/2,y:r.y+r.h/2},s.points,r.w/2,r.h/2)));if(hit)return `碰到${hit.kind==='wall'?'墙体':'家具'} #${shapes.indexOf(hit)+1}`;
  if($('doorsClosed').checked&&doors.some(d=>Math.abs(p.x-d.x)<d.w/2+10&&Math.abs(p.y-d.y)<d.h/2+10))return '门处于关闭状态';return '';
}
function draw(){if(!ready)return;ctx.setTransform(devicePixelRatio||1,0,0,devicePixelRatio||1,0,0);ctx.clearRect(0,0,width,height);ctx.save();ctx.translate(offset.x,offset.y);ctx.scale(scale,scale);ctx.drawImage(image,0,0,W,H);
  if($('floors').checked){ctx.fillStyle='#65e9ae18';ctx.strokeStyle='#8dd5ba66';ctx.lineWidth=1/scale;floors.forEach(r=>{ctx.fillRect(r.x,r.y,r.w,r.h);ctx.strokeRect(r.x,r.y,r.w,r.h);});}
  for(const s of shapes){ctx.save();if(s.kind!=='door')for(const d of doors){ctx.beginPath();ctx.rect(0,0,W,H);ctx.rect(d.x-d.w/2,d.y-d.h/2,d.w,d.h);ctx.clip('evenodd');}const color=s.kind==='door'?'#8dd5ba':s.kind==='wall'?'#ff5269':'#ffb45e';path(s.points);ctx.fillStyle=color;ctx.globalAlpha=Number($('opacity').value)/100;ctx.fill('evenodd');ctx.globalAlpha=1;ctx.strokeStyle=s.id===selected?'#fff':color;ctx.lineWidth=(s.id===selected?2.5:1.2)/scale;ctx.stroke();ctx.restore();}
  ctx.setLineDash([5/scale,4/scale]);ctx.strokeStyle='#8dd5ba';ctx.lineWidth=1.5/scale;for(const d of doors)ctx.strokeRect(d.x-d.w/2,d.y-d.h/2,d.w,d.h);ctx.setLineDash([]);
  const s=shapes.find(s=>s.id===selected);if(s){ctx.fillStyle='#fff';s.points.forEach(p=>ctx.fillRect(p.x-4/scale,p.y-4/scale,8/scale,8/scale));}
  if(draft.length){ctx.strokeStyle='#fff';ctx.lineWidth=2/scale;ctx.beginPath();draft.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));if(drag?.type==='rect')ctx.closePath();ctx.stroke();ctx.fillStyle='#fff';draft.forEach(p=>ctx.fillRect(p.x-3/scale,p.y-3/scale,6/scale,6/scale));}
  if(probe&&tool==='probe'){ctx.strokeStyle=reason(probe)?'#ff5a64':'#71ffba';ctx.lineWidth=2/scale;ctx.strokeRect(probe.x-10,probe.y-10,20,20);ctx.beginPath();ctx.moveTo(probe.x-5,probe.y);ctx.lineTo(probe.x+5,probe.y);ctx.moveTo(probe.x,probe.y-5);ctx.lineTo(probe.x,probe.y+5);ctx.stroke();}
  ctx.restore();$('zoom').textContent=Math.round(scale*100)+'%';
}
function point(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left-offset.x)/scale,y:(e.clientY-r.top-offset.y)/scale};}
const clamp=p=>({x:Math.round(Math.max(0,Math.min(W,p.x))),y:Math.round(Math.max(0,Math.min(H,p.y)))});
const onMap=p=>p.x>=0&&p.x<=W&&p.y>=0&&p.y<=H;
function setTool(t){if(saving)return;if(tool!==t||draft.length)checkpoint();tool=t;draft=[];draftRedo=[];drag=null;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));canvas.style.cursor=t==='select'?'default':'crosshair';$('help').textContent={select:'点击区域选择；拖动内部移动，拖动白色顶点修改。矩形顶点会保持直角。',rect:'在背景上按下并拖动，松开创建矩形。',poly:'沿墙边逐点点击；点击起点或按 Enter 闭合。允许交叉，以填色区域为准。',probe:'移动鼠标检查人物是否能通过。红色为阻挡，绿色为可走。'}[t];dirty();draw();}
function add(points){if(points.length<3)return;if(tool==='rect'){const pending=draft;draft=[];checkpoint();draft=pending;}else checkpoint();const s={id:crypto.randomUUID(),kind:$('kind').value,points:copy(points)};shapes.push(s);selected=s.id;draft=[];draftRedo=[];refresh();message('区域已添加，可拖动顶点修正；完成后保存。');}
function finish(){if(draft.length>=3&&tool==='poly')add(draft);}
canvas.addEventListener('pointerdown',e=>{
  if(!ready||saving)return;e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);const p=point(e);
  if(space||e.button===1){drag={type:'pan',x:e.clientX,y:e.clientY,offset:{...offset}};return;}
  if(e.button!==0)return;
  if(tool==='probe'){probe=p;message(reason(p)||'此处可以通行');draw();return;}
  if(!onMap(p))return;
  if(tool==='rect'){drag={type:'rect',start:clamp(p)};draft=[];return;}
  if(tool==='poly'){if(draft.length>=3&&Math.hypot(p.x-draft[0].x,p.y-draft[0].y)<10/scale)finish();else {checkpoint();draft.push(clamp(p));draftRedo=[];dirty();draw();}return;}
  const priorSelection=editState();let s=shapes.find(s=>s.id===selected);const v=s?s.points.findIndex(q=>Math.hypot(q.x-p.x,q.y-p.y)<10/scale):-1;
  if(v<0){s=[...shapes].reverse().find(s=>inside(p,s.points));selected=s?.id??null;}
  if(s){const pts=s.points;const rect=pts.length===4&&pts[0].y===pts[1].y&&pts[1].x===pts[2].x&&pts[2].y===pts[3].y&&pts[3].x===pts[0].x;drag={type:v>=0?'vertex':'move',index:v,start:p,original:copy(pts),s,rect,before:snapshot(),editBefore:priorSelection};}else if(priorSelection!==editState()){undo.push(priorSelection);redo=[];}refresh();
});
canvas.addEventListener('pointermove',e=>{
  const p=point(e);$('coords').textContent=`背景坐标 ${Math.round(p.x)}, ${Math.round(p.y)}`;
  if(tool==='probe'&&!drag){probe=p;message(reason(p)||'此处可以通行');draw();}
  if(!drag)return;
  if(drag.type==='pan'){offset={x:drag.offset.x+e.clientX-drag.x,y:drag.offset.y+e.clientY-drag.y};draw();return;}
  if(drag.type==='rect'){const a=drag.start,b=clamp(p);draft=[{x:a.x,y:a.y},{x:b.x,y:a.y},{x:b.x,y:b.y},{x:a.x,y:b.y}];draw();return;}
  if(drag.type==='vertex'){const q=clamp(p),i=drag.index;drag.s.points[i]=q;if(drag.rect){const prev=(i+3)%4,next=(i+1)%4;drag.s.points[prev]=i%2===0?{x:q.x,y:drag.original[prev].y}:{x:drag.original[prev].x,y:q.y};drag.s.points[next]=i%2===0?{x:drag.original[next].x,y:q.y}:{x:q.x,y:drag.original[next].y};}}
  else {const xs=drag.original.map(p=>p.x),ys=drag.original.map(p=>p.y);const dx=Math.round(Math.max(-Math.min(...xs),Math.min(W-Math.max(...xs),p.x-drag.start.x))),dy=Math.round(Math.max(-Math.min(...ys),Math.min(H-Math.max(...ys),p.y-drag.start.y)));drag.s.points=drag.original.map(q=>({x:q.x+dx,y:q.y+dy}));}syncDoors();draw();
});
function end(cancel=false){if(!drag)return;const d=drag;drag=null;if(d.type==='rect'){if(!cancel&&draft.length&&Math.abs(draft[2].x-draft[0].x)>=2&&Math.abs(draft[2].y-draft[0].y)>=2)add(draft);draft=[];}else if(d.before){if(cancel){restoreEdit(d.editBefore);}else if(editState()!==d.editBefore){undo.push(d.editBefore);redo=[];}}refresh();}
canvas.addEventListener('pointerup',()=>end());canvas.addEventListener('pointercancel',()=>end(true));canvas.addEventListener('lostpointercapture',()=>end(true));
function zoom(f,x=width/2,y=height/2){const next=Math.max(.2,Math.min(5,scale*f));offset={x:x-(x-offset.x)*next/scale,y:y-(y-offset.y)*next/scale};scale=next;draw();}
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.001),e.clientX-r.left,e.clientY-r.top);},{passive:false});
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
$('list').onchange=()=>{checkpoint();selected=$('list').value;refresh();};$('opacity').oninput=draw;$('floors').onchange=draw;$('doorsClosed').onchange=draw;
$('finish').onclick=finish;$('cancel').onclick=()=>{end(true);if(draft.length)checkpoint();draft=[];draftRedo=[];refresh();};$('fit').onclick=fit;$('minus').onclick=()=>zoom(1/1.25);$('plus').onclick=()=>zoom(1.25);
function remove(){if(!selected||saving||shapes.some(s=>s.id===selected&&s.kind==='door'))return;checkpoint();shapes=shapes.filter(s=>s.id!==selected);selected=null;refresh();}
$('delete').onclick=remove;
$('editDoors').onclick=()=>{setTool('select');checkpoint();selected='door:player';refresh();message('已选中你的房门。拖动绿色区域移动，拖动白色四角调整大小；其他门可从区域列表选择。');};
function history(back){if(saving)return;
  if(drag){end(true);message('已撤销当前拖动。');return;}
  const src=back?undo:redo,dst=back?redo:undo;if(!src.length)return;
  dst.push(editState());restoreEdit(src.pop());refresh();
  message(draft.length?'已退回绘制步骤，可继续加点；Enter 闭合。':back?'已撤销上一步操作。':'已重做上一步操作。');
}
$('undo').onclick=()=>history(true);$('redo').onclick=()=>history(false);
document.addEventListener('keydown',e=>{
  if(e.target.isContentEditable||e.target.tagName==='TEXTAREA'||(e.target.tagName==='INPUT'&&!['range','checkbox'].includes(e.target.type)))return;
  const command=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
  if(command&&key==='z'){e.preventDefault();e.stopPropagation();history(!e.shiftKey);return;}
  if(command&&key==='y'){e.preventDefault();e.stopPropagation();history(false);return;}
  if(command&&key==='s'){e.preventDefault();$('save').click();return;}
  if(e.target.tagName==='SELECT')return;
  if(e.code==='Space'){e.preventDefault();space=true;}if(saving)return;
  if(e.key==='Enter'){e.preventDefault();finish();}
  if(e.key==='Escape')$('cancel').click();
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}
},true);
document.addEventListener('keyup',e=>{if(e.code==='Space')space=false;});window.addEventListener('blur',()=>{space=false;end(true);});
window.addEventListener('beforeunload',e=>{if(ready&&(snapshot()!==saved||draft.length)){e.preventDefault();e.returnValue='';}});
$('save').onclick=async()=>{
  if(!ready||saving)return;if(draft.length||drag){message('请先完成或取消正在绘制的区域。');return;}saving=true;$('save').disabled=true;message('正在保存并构建游戏，请稍候…');const sent=snapshot();
  try{const response=await fetch('/api/collisions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:1,shapes:JSON.parse(sent).filter(s=>s.kind!=='door'),doors})});const data=await response.json();if(data.saved)saved=sent;if(!response.ok)throw Error(data.error);saved=sent;message('已保存并构建。刷新游戏预览，或在微信开发者工具重新编译；上一版数据已备份。');}catch(e){message('保存提示：'+e.message);}finally{saving=false;$('save').disabled=false;dirty();}
};
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,shapes:shapes.filter(s=>s.kind!=='door'),doors},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='four-asleep-collisions.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
try{const response=await fetch('/api/collisions');if(!response.ok)throw Error('无法读取碰撞数据');const data=await response.json();shapes=data.shapes;floors=[{x:0,y:0,w:W,h:H}];doors=data.doors;for(const d of doors) shapes.push({id:'door:'+d.id,kind:'door',points:[{x:d.x-d.w/2,y:d.y-d.h/2},{x:d.x+d.w/2,y:d.y-d.h/2},{x:d.x+d.w/2,y:d.y+d.h/2},{x:d.x-d.w/2,y:d.y+d.h/2}]});saved=snapshot();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('背景加载失败'));image.src='/background.png';});ready=true;resize();refresh();message('已加载当前项目碰撞。先选中一段墙，拖动白色顶点即可调整。');}catch(e){message(e.message);}
new ResizeObserver(resize).observe($('stage'));
