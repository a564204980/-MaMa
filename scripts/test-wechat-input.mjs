import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const code = fs.readFileSync('dist/game.js','utf8');
for (const [width,height,dpr] of [[390,844,1],[375,812,3]]) {
  let frame; const callbacks = {}, labels = [];
  const ctx = new Proxy({}, { get: (o,k) => k in o ? o[k] : k === 'fillText' ? t => labels.push(t) : k.startsWith('create') ? () => ({addColorStop(){}}) : () => {}, set: (o,k,v) => (o[k]=v,true) });
  const wx = { createCanvas: () => ({getContext: () => ctx}), createImage: () => ({}), getSystemInfoSync: () => ({ windowWidth:width,windowHeight:height,screenWidth:width,screenHeight:height,pixelRatio:dpr,safeArea:{left:0,right:width},statusBarHeight:20 }), getStorageSync: () => '', onTouchStart: cb => callbacks.start=cb, onTouchMove: cb => callbacks.move=cb, onTouchEnd: cb => callbacks.end=cb, onTouchCancel: cb => callbacks.cancel=cb, onShow(){}, onHide(){}, onWindowResize(){} };
  vm.runInNewContext(code, {wx,console:{log(){},warn(){},error(){}},performance:{now:()=>0},requestAnimationFrame: cb => (frame=cb,1),cancelAnimationFrame(){},setTimeout,clearTimeout});
  let t=0; const render = () => { labels.length=0; frame(t+=17); };
  render(); render(); assert(labels.includes('进入这个夜晚   →'));
  const scale = Math.min(width/390,height/844), ox=(width-390*scale)/2,oy=(height-844*scale)/2;
  const tap = (x,y) => { const event={changedTouches:[{x:ox+x*scale,y:oy+y*scale,identifier:1}]}; callbacks.start(event); callbacks.end(event); render(); };
  tap(195,730); assert(labels.includes('让夜晚适合你'),'native settings click');
  tap(195,702); assert(labels.includes('进入这个夜晚   →'),'native return click');
  tap(195,565); assert(labels.includes('疯狂妈妈MaMa'),'native start click'); assert(labels.includes('你的睡意'));
  console.log(`PASS: built game native x/y home/settings/return/start at ${width}x${height}, DPR ${dpr}`);
}

{
  let frame, show, hide; const labels = [];
  const ctx = new Proxy({}, { get: (o,k) => k in o ? o[k] : k === 'fillText' ? t => labels.push(t) : k.startsWith('create') ? () => ({addColorStop(){}}) : () => {}, set: (o,k,v) => (o[k]=v,true) });
  const canvas = { getContext: () => ctx };
  const wx = { createCanvas: () => canvas, createImage: () => ({}), getSystemInfoSync: () => ({windowWidth:844,windowHeight:390,pixelRatio:3}), getStorageSync: () => '', onShow: cb => show=cb, onHide: cb => hide=cb, getPerformance: () => ({now:()=>1700000000000}) };
  const sandbox = { wx, console, requestAnimationFrame: cb => (frame=cb,1), setTimeout, clearTimeout };
  Object.assign(wx, { onTouchStart(){}, onTouchMove(){}, onTouchEnd(){}, onTouchCancel(){} });
  vm.runInNewContext(code + '\nglobalThis.sceneForTest=globalSceneManager;', sandbox);
  let t = 0; const tick = () => { labels.length=0; frame(t+=17); };
  tick(); tick(); sandbox.sceneForTest.getCurrentScene().start();
  hide(); show();
  for(let i=0;i<90;i++) tick();
  assert(!labels.includes('正在回到这个夜晚…'), 'Native clock mismatch must not freeze resume overlay');
  assert(sandbox.sceneForTest.getCurrentScene().run.elapsed > 0, 'Simulation must resume advancing');
  assert.equal(canvas.width, 844*3); assert.equal(canvas.height,390*3);
  console.log('PASS: native resume with different clock epoch and DPR 3 backing resolution');
}
