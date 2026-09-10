import {globalResources} from '../core/ResourceManager';
import {playerRigFrames} from '../gameplay/PlayerRigFrames';
import {playerPose,Joint,Limb} from './PlayerGait';
export class PlayerRig {
  load(){return globalResources.loadImage('player-rig','assets/images/player-rig.png');}
  draw(ctx:CanvasRenderingContext2D,p:Joint,direction:number,left:boolean,phase:number,amount:number,running:number,alpha:number){
    const image=globalResources.getImage('player-rig');if(!image)return false;
    const pose=playerPose(phase,amount,running,direction);
    const part=(index:number,x:number,y:number,w:number,h:number)=>{
      const f=playerRigFrames[direction*10+index];ctx.drawImage(image,f.x,f.y,f.w,f.h,x,y,w,h);
    };
    const bone=(index:number,a:Joint,b:Joint,width:number)=>{
      ctx.save();ctx.translate(a.x,a.y);ctx.rotate(Math.atan2(b.y-a.y,b.x-a.x)-Math.PI/2);
      if(direction===2&&(index===7||index===9))ctx.scale(-1,1);
      part(index,-width/2,-1,width,Math.hypot(b.x-a.x,b.y-a.y)+2);ctx.restore();
    };
    const limb=(index:number,l:Limb,width:number)=>{bone(index,l.root,l.joint,width);bone(index+1,l.joint,l.tip,width);};
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(p.x,p.y+23);
    if(direction===2&&left)ctx.scale(-1,1);
    limb(6,pose.legs[0],6);limb(2,pose.arms[0],4.8);
    if(direction!==2)limb(4,pose.arms[1],4.8);
    limb(8,pose.legs[1],6);
    part(1,pose.lean-(direction===2?6:8),-29+pose.bob,direction===2?12:16,18);
    if(direction===2)limb(4,pose.arms[1],4.8);
    const f=playerRigFrames[direction*10];const hh=30,hw=hh*f.w/f.h;
    part(0,pose.lean-hw/2,-57+pose.bob,hw,hh);
    ctx.restore();return true;
  }
}
