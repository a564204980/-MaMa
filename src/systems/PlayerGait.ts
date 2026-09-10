// Distance-driven gait: collision stops also stop the feet. No frame-rate dependence.
export type Joint = { x: number; y: number };
export type Limb = { root: Joint; joint: Joint; tip: Joint };
export function bend(root: Joint, tip: Joint, a: number, b: number, side = 1): Limb {
  const dx = tip.x-root.x, dy = tip.y-root.y;
  const distance = Math.max(.001, Math.hypot(dx,dy));
  const d = Math.min(a+b-.01, distance);
  const along = (a*a-b*b+d*d)/(2*d);
  const height = Math.sqrt(Math.max(0,a*a-along*along));
  return {root, tip, joint:{x:root.x+dx/distance*along-dy/distance*height*side,
    y:root.y+dy/distance*along+dx/distance*height*side}};
}
export function playerPose(phase: number, amount: number, running: number, direction: number) {
  const side = direction===2;
  const bob = -Math.abs(Math.sin(phase))*amount*(.6+running*1.2);
  const lean = side ? running*2*amount : 0;
  const hipY = -13+bob;
  const legs: Limb[] = [], arms: Limb[] = [];
  for(let i=0;i<2;i++) {
    const t = ((phase/(Math.PI*2)+i*.5)%1+1)%1;
    // First half planted, second half lifted and returning to the next contact.
    const sweep = t<.5 ? 1-4*t : -Math.cos((t-.5)*Math.PI*2);
    const lift = t<.5 ? 0 : Math.sin((t-.5)*Math.PI*2)*(2+running*3)*amount;
    const spread = i===0 ? -3.3 : 3.3;
    const foot = {x:side?sweep*(4+running*2)*amount:spread,
      y:-lift+(side?0:sweep*2*amount)};
    const hip = {x:side?lean:spread,y:hipY};
    legs.push(side?bend(hip,foot,7,7,-1):{root:hip,tip:foot,joint:{x:spread,y:(hip.y+foot.y)/2}});
    const swing = -Math.cos(t*Math.PI*2)*amount;
    const shoulder = {x:side?lean-3:spread*2.5,y:-26+bob};
    const hand = {x:shoulder.x+(side?swing*(5+running*3):swing*1.7),
      y:shoulder.y+10-running*2+(!side?swing*2:0)};
    arms.push(side?bend(shoulder,hand,6,6,-1):{root:shoulder,tip:hand,joint:{x:shoulder.x+swing*.8,y:shoulder.y+5}});
  }
  return {legs,arms,bob,lean};
}
