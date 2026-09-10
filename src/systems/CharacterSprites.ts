import { globalResources } from '../core/ResourceManager';
import { characterFrames } from '../gameplay/CharacterFrames';
import { Point } from '../gameplay/House';
type Motion = { x:number;y:number;direction:number;left:boolean;stride:number;moving:boolean;amount:number;running:number };
export class CharacterSprites {
  private motion = new Map<string,Motion>();
  load(){return Promise.all([
    globalResources.loadImage('parents','assets/images/parents-runtime.png'),
    globalResources.loadImage('characters','assets/images/characters-runtime.png'),
    globalResources.loadImage('girl-front','assets/images/girl-front.png'),
    globalResources.loadImage('girl-side', 'assets/images/girl-side.png'),
    globalResources.loadImage('girl-back', 'assets/images/girl-back.png'),
    globalResources.loadImage('girl-eat-front','assets/images/girl-eat-front.png'),
    globalResources.loadImage('girl-eat-side', 'assets/images/girl-eat-side.png'),
    globalResources.loadImage('girl-eat-back', 'assets/images/girl-eat-back.png'),
    globalResources.loadImage('girl-stun-front','assets/images/girl-stun-front.png'),
    globalResources.loadImage('girl-stun-side', 'assets/images/girl-stun-side.png'),
    globalResources.loadImage('girl-stun-back', 'assets/images/girl-stun-back.png'),
  ]);}
  reset(){this.motion.clear();}
  track(id: string, p: Point, dt = 1/60, inputDir?: Point) {
    const old = this.motion.get(id), dx = old ? p.x - old.x : 0, dy = old ? p.y - old.y : 0, travel = Math.hypot(dx, dy);
    const moving = travel > .02 && travel < 30, speed = moving ? travel / Math.max(.001, dt) : 0;
    const blend = 1 - Math.exp(-18 * dt);
    
    // 如果有输入方向，优先使用输入方向判定朝向
    const refX = inputDir ? inputDir.x : dx;
    const refY = inputDir ? inputDir.y : dy;
    const turning = Math.hypot(refX, refY) > 0.05;
    
    this.motion.set(id, {
      x: p.x, y: p.y,
      direction: turning ? (Math.abs(refX) > Math.abs(refY) ? 2 : refY < 0 ? 1 : 0) : old?.direction ?? 0,
      left: turning && Math.abs(refX) > Math.abs(refY) ? refX < 0 : old?.left ?? false,
      stride: (old?.stride ?? 0) + (moving ? travel : 0), moving,
      amount: (old?.amount ?? 0) + ((moving ? 1 : 0) - (old?.amount ?? 0)) * blend,
      running: (old?.running ?? 0) + (Math.max(0, Math.min(1, (speed - 65) / 75)) - (old?.running ?? 0)) * blend
    });
  }
  draw(ctx:CanvasRenderingContext2D,id:string,kind:string,p:Point,angry=false,alpha=1,pose='default'){
    if(kind==='father'||kind==='mother'){
      const img=globalResources.getImage('parents');
      if(img){
        const state=this.motion.get(id),direction=state?.direction??0;
        const col=direction===1?2:direction===2?1:0,row=(kind==='father'?0:2)+(angry?1:0);
        const moving=state?.moving??false, stride=state?.stride??0;
        const stepFreq = angry ? 22 : 26;
        const phase = moving ? Math.sin(stride / stepFreq * Math.PI) : 0;
        const bob   = moving ? Math.abs(phase) * (angry ? 2.8 : 1.8) : 0;
        const sway  = moving ? phase * (angry ? 1.5 : 1.0) : 0;
        const tilt  = moving ? phase * (angry ? 0.03 : 0.018) : 0;

        // 脚底动态接地阴影（双层立体柔化接地阴影）
        const shadowX = direction === 2 ? (state?.left ? 3.5 : -3.5) : 0;
        ctx.save();
        ctx.translate(p.x + shadowX, p.y + 23);
        // 外层柔和羽化环境光遮蔽阴影
        const outerRx = (angry ? 27 : 24) - bob * 0.4;
        const outerRy = 7.5 - bob * 0.2;
        const outerGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, outerRx);
        outerGrad.addColorStop(0, `rgba(0, 0, 0, ${(alpha * 0.45).toFixed(2)})`);
        outerGrad.addColorStop(0.65, `rgba(0, 0, 0, ${(alpha * 0.22).toFixed(2)})`);
        outerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = outerGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, outerRx, outerRy, 0, 0, Math.PI * 2);
        ctx.fill();

        // 内层浓实紧贴鞋底接触阴影
        const innerRx = (angry ? 18 : 16) - bob * 0.3;
        const innerRy = 4.2 - bob * 0.15;
        const innerGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, innerRx);
        innerGrad.addColorStop(0, `rgba(0, 0, 0, ${(alpha * 0.72).toFixed(2)})`);
        innerGrad.addColorStop(0.7, `rgba(0, 0, 0, ${(alpha * 0.35).toFixed(2)})`);
        innerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = innerGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, innerRx, innerRy, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 身体：应用 sway 左右重心晃动 + tilt 走姿微倾角 + bob 颠簸起伏
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x + sway, p.y + 23);
        if (direction === 2 && !state?.left) ctx.scale(-1, 1);
        ctx.rotate(tilt);
        ctx.drawImage(img, col * 128, row * 128, 128, 128, -38, -71 + bob, 76, 76);
        ctx.restore();
        return true;
      }
    }
    if(kind==='girl'){
      const state=this.motion.get(id),direction=state?.direction??0;
      const isStun = pose === 'stun';
      const isEatOrCarry = pose === 'eat';
      const key = isStun
        ? (direction===1 ? 'girl-stun-back' : direction===2 ? 'girl-stun-side' : 'girl-stun-front')
        : isEatOrCarry
        ? (direction===1 ? 'girl-eat-back' : direction===2 ? 'girl-eat-side' : 'girl-eat-front')
        : (direction===1 ? 'girl-back' : direction===2 ? 'girl-side' : 'girl-front');
      const img = globalResources.getImage(key) || globalResources.getImage(direction===1?'girl-back':direction===2?'girl-side':'girl-front');
      if(img){
        const h=70,w=70;
        const stride=state?.stride??0, moving=state?.moving??false;
        const phase = moving ? Math.sin(stride/20*Math.PI) : 0;
        const bob   = moving ? Math.abs(phase)*2.5 : 0;
        const sway  = moving ? phase*1.2 : 0;
        const tilt  = moving ? phase*0.025 : 0;
        // 定身被吓呆时的受惊微颤
        const shiver = isStun ? Math.sin(Date.now() * 0.045) * 1.0 : 0;
        // 脚底动态接地阴影（双层柔和渐变）
        const shadowX = direction===2 ? (state?.left ? 3 : -3) : 0;
        ctx.save();
        ctx.translate(p.x + shadowX, p.y + 23 - 10);
        const gOuterRx = 18 - bob * 0.3;
        const gOuterRy = 5.5 - bob * 0.15;
        const gOuterGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, gOuterRx);
        gOuterGrad.addColorStop(0, `rgba(0, 0, 0, ${(alpha * 0.42).toFixed(2)})`);
        gOuterGrad.addColorStop(0.65, `rgba(0, 0, 0, ${(alpha * 0.18).toFixed(2)})`);
        gOuterGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gOuterGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, gOuterRx, gOuterRy, 0, 0, Math.PI * 2);
        ctx.fill();

        const gInnerRx = 12 - bob * 0.25;
        const gInnerRy = 3.2 - bob * 0.1;
        const gInnerGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, gInnerRx);
        gInnerGrad.addColorStop(0, `rgba(0, 0, 0, ${(alpha * 0.68).toFixed(2)})`);
        gInnerGrad.addColorStop(0.7, `rgba(0, 0, 0, ${(alpha * 0.30).toFixed(2)})`);
        gInnerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gInnerGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, gInnerRx, gInnerRy, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 身体：含 sway + tilt + shiver
        ctx.save();ctx.globalAlpha=alpha;ctx.translate(p.x+sway+shiver,p.y+23);
        const flip = isEatOrCarry ? Boolean(state?.left) : !state?.left;
        if(direction===2 && flip) ctx.scale(-1,1);
        ctx.rotate(tilt);
        ctx.drawImage(img,-w/2,-h+bob,w,h);
        ctx.restore();return true;
      }
    }
    const image=globalResources.getImage('characters');if(!image)return false;
    const state=this.motion.get(id),direction=state?.direction??0;
    const mode=state?.moving?(angry?'angrywalk':'walk'):(angry?'angry':'idle');
    const index=Math.floor((state?.stride??0)/25)%2;
    const frame=characterFrames[`${kind}-${mode}-${direction}${state?.moving?'-'+index:''}`]??characterFrames[`${kind}-idle-${direction}`];
    if(!frame)return false;const h=kind==='girl'?60:66,w=h*.75;
    ctx.save();
    ctx.translate(p.x, p.y + 23);
    const fbGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, 18);
    fbGrad.addColorStop(0, `rgba(0, 0, 0, ${(alpha * 0.55).toFixed(2)})`);
    fbGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = fbGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(p.x,p.y+23);
    if(direction===2&&!!state?.left)ctx.scale(-1,1);
    ctx.drawImage(image,frame.x,frame.y,96,128,-w/2,-h*120/128,w,h);ctx.restore();return true;
  }
  head(ctx:CanvasRenderingContext2D,kind:string,x:number,y:number,angry:boolean,baby:boolean){
    if(kind==='father'||kind==='mother'){
      const img=globalResources.getImage('parents');
      if(img){const row=kind==='father'?0:2;ctx.drawImage(img,0,row*128,128,86,x-23,y-26,46,31);return true;}
    }
    const img=globalResources.getImage('characters'),f=characterFrames[`${kind}-${angry&&kind!=='girl'&&kind!=='baby'?'angry':'idle'}-0`];if(!img||!f)return false;const w=baby?28:38;ctx.drawImage(img,f.x,f.y,f.w,70,x-w/2,y-23,w,w*70/96);return true;
  }
}
