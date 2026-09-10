import collisionData from './collision-overrides.json';
export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export const rooms = [
  { id: 'parents', name: '父母卧室', x: 70, y: 35, w: 380, h: 215 },
  { id: 'player', name: '你的卧室', x: 55, y: 265, w: 390, h: 210 },
  { id: 'nursery', name: '婴儿房', x: 40, y: 495, w: 400, h: 205 },
  { id: 'bathroom', name: '卫生间', x: 470, y: 35, w: 135, h: 180 },
  { id: 'living', name: '客厅', x: 590, y: 105, w: 375, h: 505 },
  { id: 'kitchen', name: '厨房', x: 985, y: 35, w: 345, h: 215 },
  { id: 'dining', name: '餐厅', x: 975, y: 260, w: 320, h: 350 },
  { id: 'computer', name: '电脑房', x: 590, y: 665, w: 495, h: 215 },
  { id: 'foyer', name: '玄关', x: 1320, y: 275, w: 170, h: 275 },
];
export const floors: Rect[] = [...rooms,
  { x: 455, y: 215, w: 115, h: 505 },
  { x: 400, y: 215, w: 210, h: 40 }, { x: 420, y: 375, w: 185, h: 60 },
  { x: 420, y: 557, w: 150, h: 59 }, { x: 490, y: 180, w: 65, h: 100 },
  { x: 550, y: 270, w: 490, h: 345 },
  { x: 920, y: 160, w: 115, h: 435 },
  { x: 985, y: 220, w: 310, h: 80 },
  { x: 760, y: 590, w: 60, h: 100 },
  { x: 1270, y: 375, w: 80, h: 65 },
];
export const walls: Rect[] = [
  // Nursery artwork has thick wall faces. Reserve them explicitly so the
  // broad room/doorway floor rectangles cannot make the walls walkable.
  { x: 18, y: 490, w: 47, h: 220 },
  { x: 40, y: 490, w: 415, h: 55 },
  // Actor positions are body centers; feet are drawn 23px lower. Shift the
  // jamb collision up by that offset so visible feet can cross the opening.
  { x: 430, y: 495, w: 25, h: 62 },
  { x: 430, y: 593, w: 25, h: 147 },
  { x: 18, y: 680, w: 437, h: 60 },
  // Bathroom south wall follows the marked correction; doorway x=510..565.
  { x: 440, y: 195, w: 70, h: 25 }, { x: 565, y: 195, w: 40, h: 50 },
  // Solid partitions must override the broad floor unions.
  { x: 440, y: 30, w: 22, h: 177 },
  { x: 430, y: 265, w: 25, h: 110 },
  { x: 430, y: 435, w: 25, h: 55 },
  { x: 55, y: 245, w: 350, h: 20 },
  { x: 565, y: 245, w: 22, h: 80 },
  { x: 565, y: 385, w: 22, h: 195 },
  { x: 635, y: 615, w: 114, h: 44 },
  { x: 816, y: 615, w: 284, h: 44 },
  { x: 1295, y: 280, w: 23, h: 95 },
  { x: 1295, y: 455, w: 23, h: 155 },
];
export const furniture: Rect[] = [
  { x: 195, y: 50, w: 125, h: 163 }, { x: 396, y: 45, w: 40, h: 145 },
  { x: 193, y: 285, w: 95, h: 140 }, { x: 87, y: 285, w: 85, h: 58 },
  { x: 172, y: 515, w: 83, h: 85 }, { x: 55, y: 540, w: 82, h: 90 },
  { x: 465, y: 45, w: 110, h: 61 }, { x: 565, y: 130, w: 37, h: 46 },
  { x: 685, y: 145, w: 220, h: 63 },
  { x: 687, y: 287, w: 240, h: 74 }, { x: 656, y: 368, w: 52, h: 78 },
  { x: 876, y: 368, w: 66, h: 78 }, { x: 744, y: 382, w: 111, h: 55 },
  { x: 715, y: 474, w: 180, h: 48 },
  { x: 1005, y: 40, w: 296, h: 82 }, { x: 1100, y: 150, w: 131, h: 58 },
  { x: 1074, y: 342, w: 130, h: 160 },
  { x: 840, y: 725, w: 190, h: 82 }, { x: 662, y: 742, w: 85, h: 91 },
  { x: 1360, y: 300, w: 102, h: 47 },
];
export interface DoorDefinition { id: string; x: number; y: number; w: number; h: number }
export const doorDefinitions: DoorDefinition[] = (collisionData as { doors?: DoorDefinition[] }).doors ?? [
  { id: 'parents', x: 440, y: 230, w: 18, h: 46 },
  { id: 'player', x: 437, y: 404, w: 18, h: 58 },
  { id: 'nursery', x: 442, y: 598, w: 25, h: 36 },
  { id: 'bathroom', x: 537.5, y: 215, w: 55, h: 14 },
  { id: 'computer', x: 786, y: 644, w: 60, h: 14 },
];
export const inside = (p: Point, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export interface CollisionShape { id: string; kind: 'wall' | 'furniture'; points: Point[] }
export const collisionShapes: CollisionShape[] = (collisionData as { shapes: CollisionShape[] | null }).shapes ??
  [...walls.map(r => ({ ...r, kind: 'wall' as const })), ...furniture.map(r => ({ ...r, kind: 'furniture' as const }))].map((r, i) => ({ id: `original-${i}`, kind: r.kind, points: [{ x:r.x,y:r.y },{ x:r.x+r.w,y:r.y },{ x:r.x+r.w,y:r.y+r.h },{ x:r.x,y:r.y+r.h }] }));
function inPolygon(p: Point, points: Point[]): boolean {
  let hit = false;
  for (let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[i], b=points[j];
    if ((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) hit=!hit;
  }
  return hit;
}
// Test polygon edges against the actor's square footprint, including thin walls.
function blockedByShape(p: Point, radius: number, points: Point[], halfHeight = radius): boolean {
  if (inPolygon(p, points)) return true;
  const minX=p.x-radius,maxX=p.x+radius,minY=p.y-halfHeight,maxY=p.y+halfHeight;
  for (let i=0;i<points.length;i++) {
    const a=points[i], b=points[(i+1)%points.length];
    let lo=0,hi=1;
    for (const [v,d,min,max] of [[a.x,b.x-a.x,minX,maxX],[a.y,b.y-a.y,minY,maxY]]) {
      if (Math.abs(d)<1e-9) { if(v<min||v>max) { hi=-1; break; } }
      else { const t1=(min-v)/d,t2=(max-v)/d; lo=Math.max(lo,Math.min(t1,t2)); hi=Math.min(hi,Math.max(t1,t2)); }
    }
    if(lo<=hi) return true;
  }
  return false;
}
// Subtract the union of door rectangles from the queried footprint, not from
// the saved polygons. This retains the wall beside a doorway and supports
// concave/self-crossing polygons without rewriting the user's drawing.
export function outsideDoors(p: Point, radius: number): Rect[] {
  let pieces: Rect[] = [{x:p.x-radius,y:p.y-radius,w:radius*2,h:radius*2}];
  for(const d of doorDefinitions){
    const next: Rect[]=[];
    for(const r of pieces){
      const l=Math.max(r.x,d.x-d.w/2),t=Math.max(r.y,d.y-d.h/2);
      const right=Math.min(r.x+r.w,d.x+d.w/2),bottom=Math.min(r.y+r.h,d.y+d.h/2);
      if(l>=right||t>=bottom){next.push(r);continue;}
      if(t>r.y)next.push({x:r.x,y:r.y,w:r.w,h:t-r.y});
      if(bottom<r.y+r.h)next.push({x:r.x,y:bottom,w:r.w,h:r.y+r.h-bottom});
      if(l>r.x)next.push({x:r.x,y:t,w:l-r.x,h:bottom-t});
      if(right<r.x+r.w)next.push({x:right,y:t,w:r.x+r.w-right,h:bottom-t});
    }
    pieces=next;
  }
  return pieces;
}
export function walkable(p: Point, closed: Set<string> = new Set(), radius = 10): boolean {
  const corners = [{ x: p.x - radius, y: p.y - radius }, { x: p.x + radius, y: p.y - radius }, { x: p.x - radius, y: p.y + radius }, { x: p.x + radius, y: p.y + radius }];
  const pieces=outsideDoors(p,radius);
  return corners.every(c => inside(c, { x: 0, y: 0, w: 1580, h: 996 })) && !collisionShapes.some(s => pieces.some(r=>blockedByShape({x:r.x+r.w/2,y:r.y+r.h/2},r.w/2,s.points,r.h/2))) && !doorDefinitions.some(d => closed.has(d.id) && Math.abs(p.x - d.x) < d.w / 2 + radius && Math.abs(p.y - d.y) < d.h / 2 + radius);
}
export function move(p: Point, dx: number, dy: number, closed = new Set<string>()): void {
  // FOOT_Y: collision check offset below character center (where feet actually are).
  // FOOT_R: normal footprint half-size. SLIP_R: smaller half-size used when the normal
  // footprint catches on an irregular polygon vertex — allows the character to slide past
  // sharp corners at reduced speed rather than getting stuck completely.
  const FOOT_Y = 20, FOOT_R = 7, SLIP_R = 3;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 5));
  for (let i = 0; i < steps; i++) {
    const sx = dx / steps, sy = dy / steps;
    if (walkable({ x: p.x + sx, y: p.y + FOOT_Y }, closed, FOOT_R)) {
      p.x += sx;
    } else if (Math.abs(sx) > 0.01 && walkable({ x: p.x + sx, y: p.y + FOOT_Y }, closed, SLIP_R)) {
      p.x += sx; // 取消减速，贴墙原速滑动
    }
    if (walkable({ x: p.x, y: p.y + sy + FOOT_Y }, closed, FOOT_R)) {
      p.y += sy;
    } else if (Math.abs(sy) > 0.01 && walkable({ x: p.x, y: p.y + sy + FOOT_Y }, closed, SLIP_R)) {
      p.y += sy; // 取消减速，贴墙原速滑动
    }
  }
}
// Shared navigation grid; actors and seed validation use exactly the same collision geometry.
const navCells = new Map<number, Point>();
const navLinks = new Map<number, number[]>();
export function route(from: Point, to: Point): Point[] {
  const cell = 10, cols = 160, rows = 100;
  const key = (p: Point) => Math.round(p.y / cell) * cols + Math.round(p.x / cell);
  const point = (k: number) => ({ x: (k % cols) * cell, y: Math.floor(k / cols) * cell });
  // Use the same foot-position check as move() so planned paths are always followable.
  const footOk = (p: Point) => walkable({ x: p.x, y: p.y + 20 }, new Set(), 7);
  if (!navCells.size) for (let y = 1; y < rows; y++) for (let x = 1; x < cols; x++) {
    const p = { x: x * cell, y: y * cell }; if (footOk(p)) navCells.set(key(p), p);
  }
  if (!navLinks.size) for (const [k, p] of navCells) {
    navLinks.set(k, [-1, 1, -cols, cols].map(step => k + step).filter(n => {
      const q = navCells.get(n); return q && distance(p, q) <= cell + 1 && footOk({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    }));
  }
  const nearest = (p: Point) => {
    let best = -1, min = Infinity;
    for (const [k, q] of navCells) { const d = distance(p, q); if (d < min) { best = k; min = d; } }
    return best;
  };
  const start = nearest(from), end = nearest(to), queue = [start], prev = new Map<number, number>([[start, -1]]);
  for (let i = 0; i < queue.length && !prev.has(end); i++) {
    for (const next of navLinks.get(queue[i]) || []) {
      if (prev.has(next)) continue;
      prev.set(next, queue[i]); queue.push(next);
    }
  }
  if (!prev.has(end)) return [];
  const path: Point[] = [];
  for (let k = end; k !== start && k !== -1; k = prev.get(k)!) path.unshift(point(k));
  return path;
}




