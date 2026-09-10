import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const wxEvents={}, canvasEvents={}, windowEvents={}, labels=[];
let frame;
const ctx=new Proxy({}, {get:(o,k)=>k in o?o[k]:k==='fillText'?t=>labels.push(t):k.startsWith('create')?()=>({addColorStop(){}}):()=>{},set:(o,k,v)=>(o[k]=v,true)});
const canvas={getContext:()=>ctx,addEventListener:(k,fn)=>canvasEvents[k]=fn,setPointerCapture(){}};
const wx={createCanvas:()=>canvas,createImage:()=>({}),getSystemInfoSync:()=>({windowWidth:1280,windowHeight:720,pixelRatio:1,safeArea:{left:0,right:1280}}),getStorageSync:()=>'',onTouchStart:fn=>wxEvents.start=fn,onTouchMove:fn=>wxEvents.move=fn,onTouchEnd:fn=>wxEvents.end=fn,onTouchCancel:fn=>wxEvents.cancel=fn,onShow(){},onHide(){},onWindowResize(){}};
const sandbox={wx,window:{addEventListener:(k,fn)=>windowEvents[k]=fn},console:{log(){},warn(){},error(){}},performance:{now:()=>0},requestAnimationFrame:fn=>(frame=fn,1),cancelAnimationFrame(){},setTimeout,clearTimeout};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('dist/game.js','utf8')+'\nglobalThis.testSceneManager=globalSceneManager;',sandbox);
let t=0;function tick(){labels.length=0;frame(t+=17);}tick();tick();const scene=sandbox.testSceneManager.getCurrentScene();scene.start();tick();
assert(labels.includes('爸爸')&&labels.includes('妈妈')&&labels.includes('婴儿'));
// Independent scene sleeper invocation proves every sleeping family member is drawn, even off camera.
const sleepCalls=[];const original=scene.sleeper.bind(scene);scene.sleeper=(...a)=>{sleepCalls.push(a[3]);return original(...a)};tick();assert.deepEqual(sleepCalls,['爸爸','妈妈','婴儿']);
const e=(x,y,id=0)=>({changedTouches:[{x,y,identifier:id}]});
wxEvents.start(e(122,607));assert.equal(scene.joystick.id,0);
// Duplicate canvas and window streams must not take ownership of the same gesture.
canvasEvents.pointerdown({clientX:122,clientY:607,pointerId:9});
canvasEvents.touchstart(e(122,607));
wxEvents.move(e(165,607));assert(scene.joystick.current.x>scene.joystick.origin.x);
wxEvents.move(e(80,607));assert(scene.joystick.current.x<scene.joystick.origin.x);
wxEvents.move(e(122,565));assert(scene.joystick.current.y<scene.joystick.origin.y);
wxEvents.move(e(122,650));assert(scene.joystick.current.y>scene.joystick.origin.y);
wxEvents.end({changedTouches:[{identifier:0}],touches:[]});assert.equal(scene.joystick,null);
const stopped={...scene.run.player};for(let i=0;i<15;i++)tick();assert.equal(scene.run.player.x,stopped.x);assert.equal(scene.run.player.y,stopped.y);
wxEvents.start(e(122,607,0));wxEvents.start(e(1130,595,1));wxEvents.end({changedTouches:[{identifier:1}],touches:[{identifier:0,x:122,y:607}]});assert(scene.joystick);wxEvents.cancel({changedTouches:[],touches:[]});assert.equal(scene.joystick,null);
// Canvas-first fallback preserves ID zero and handles cancellation without coordinates.
canvasEvents.touchstart(e(122,607,0));canvasEvents.touchmove(e(170,607,0));assert.equal(scene.joystick.current.x,170);canvasEvents.touchcancel({changedTouches:[],touches:[]});assert.equal(scene.joystick,null);
const ptr={clientX:122,clientY:607,pointerId:7,buttons:1,pointerType:'mouse'};
canvasEvents.pointerdown(ptr);windowEvents.pointerdown(ptr);assert.equal(scene.joystick.id,7);
windowEvents.pointermove({...ptr,clientX:170});assert.equal(scene.joystick.current.x,170);
windowEvents.pointerup({pointerId:7});assert.equal(scene.joystick,null);
console.log('PASS: four joystick directions; zero IDs; mixed-source deduplication; coordinate-free release; stationary after release; two fingers; touch cancel; pointer capture/bubbling; all sleeping family renders.');

scene.run.hidden=false;scene.run.sleeping=false;scene.run.player={x:500,y:400};
wxEvents.start(e(122,607,0));
const reusable={changedTouches:[{clientX:170,clientY:607,identifier:19}]};
canvasEvents.touchmove(reusable);assert.equal(scene.joystick.current.x,170);
const beforeX=scene.run.player.x;for(let i=0;i<8;i++)tick();assert(scene.run.player.x>beforeX,'cross-source drag must actually move player');
reusable.changedTouches[0].clientX=80;canvasEvents.touchmove(reusable);assert.equal(scene.joystick.current.x,80,'reused event object must update');
const beforeLeft=scene.run.player.x;for(let i=0;i<8;i++)tick();assert(scene.run.player.x<beforeLeft,'reverse direction must move left');
canvasEvents.touchend({changedTouches:[{identifier:19}],touches:[]});assert.equal(scene.joystick,null);
const finalX=scene.run.player.x;for(let i=0;i<8;i++)tick();assert.equal(scene.run.player.x,finalX);
canvasEvents.mousedown({clientX:122,clientY:607});windowEvents.mousemove({clientX:165,clientY:607,buttons:1});assert.equal(scene.joystick.current.x,165);windowEvents.mouseup({});assert.equal(scene.joystick,null);
console.log('PASS: mixed wx/canvas gesture, mismatched IDs, reused move event, actual right/left movement, release stops player, legacy mouse drag.');

// Ten seconds of held input, including simulator noise at the reported 1–2 second boundary.
scene.run.hidden=false;scene.run.sleeping=false;
wxEvents.start(e(122,607,0));wxEvents.move(e(163,607,0));
canvasEvents.pointerdown({clientX:122,clientY:607,pointerId:91,buttons:1});
for(let second=0;second<10;second++) {
  windowEvents.pointermove({clientX:163,clientY:607,pointerId:91,buttons:0,pointerType:'mouse'});
  windowEvents.pointerup({pointerId:777});
  canvasEvents.lostpointercapture({pointerId:91});
  windowEvents.pointercancel({pointerId:91});
  windowEvents.blur();
  for(let i=0;i<60;i++)tick();
  assert(scene.joystick,`held joystick released at second ${second+1}`);
  assert.equal(scene.joystick.current.x,163);
}
wxEvents.end({changedTouches:[{identifier:0}],touches:[]});assert.equal(scene.joystick,null);
const holdStop={...scene.run.player};for(let i=0;i<60;i++)tick();assert.equal(scene.run.player.x,holdStop.x);assert.equal(scene.run.player.y,holdStop.y);
console.log('PASS: ten-second hold survives hover, unrelated up, mirrored cancellation, capture loss and simulator blur; native release still stops immediately.');
