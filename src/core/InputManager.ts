import { globalEvents } from './EventBus';
export interface TouchPoint { x: number; y: number; identifier: number }
export type TouchCallback = (point: TouchPoint, originalEvent: any) => void;
type Phase = 'start' | 'move' | 'end';
export class InputManager {
  private scaleX = 1; private scaleY = 1;
  private onStartListeners: TouchCallback[] = []; private onMoveListeners: TouchCallback[] = []; private onEndListeners: TouchCallback[] = [];
  private active = new Map<number, TouchPoint>();
  private aliases = new Map<string, number>();
  private nextId = -1;

  private canvases = new WeakSet<object>();
  constructor() {
    if (typeof wx !== 'undefined') {
      wx.onTouchStart(e => this.dispatch('wx', 'start', e));
      wx.onTouchMove(e => this.dispatch('wx', 'move', e));
      wx.onTouchEnd(e => this.dispatch('wx', 'end', e));
      wx.onTouchCancel(e => this.dispatch('wx', 'end', e));
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', e => this.dispatch('pointer', 'start', e));
      window.addEventListener('pointermove', e => this.dispatch('pointer', 'move', e));
      window.addEventListener('pointerup', e => this.dispatch('pointer', 'end', e));
      window.addEventListener('pointercancel', e => this.cancelPointer(e));
      window.addEventListener('blur', () => { if (typeof wx === 'undefined') this.reset(); });
      if (typeof (window as any).PointerEvent !== 'function') {
        window.addEventListener('mousedown', e => this.dispatch('mouse','start',e));
        window.addEventListener('mousemove', e => this.dispatch('mouse','move',e));
        window.addEventListener('mouseup', e => this.dispatch('mouse','end',e));
      }
    }
    globalEvents.on('app:hide', () => this.reset());
    globalEvents.on('input:reset', () => this.reset());
  }
  private cancelPointer(e: any) {
    const id = this.aliases.get('pointer:' + e.pointerId);
    // Native touch remains authoritative when the simulator cancels only its mirrored pointer.
    if (id !== undefined && [...this.aliases].some(([key,value]) => key.startsWith('wx:') && value === id)) return;
    this.dispatch('pointer', 'end', e);
  }
  private dispatch(source: string, phase: Phase, e: any) {
    // Simulator hover events are not finger releases. Only explicit up/cancel ends a gesture.
    if (phase === 'move' && (source === 'pointer' || source === 'mouse') && e.buttons === 0) return;

    const touches = e.changedTouches?.length ? Array.from(e.changedTouches) : phase === 'end' ? [] : e.touches?.length ? Array.from(e.touches) : ('touches' in e || 'changedTouches' in e) ? [] : [e];
    if (phase === 'end' && !touches.length && (e.pointerId !== undefined || e.identifier !== undefined)) touches.push(e);
    if (phase === 'end' && !touches.length) {
      const remaining = new Set(Array.from(e.touches || [], (t: any) => t.identifier ?? t.pointerId ?? 0));
      for (const [id, p] of [...this.active]) if ([...this.aliases].some(([key,value]) => key.startsWith(source + ':') && value === id) && !remaining.has(id)) this.release(p, e);
      return;
    }
    for (const t of touches as any[]) {
      const rawId = t.identifier ?? t.pointerId ?? 0;
      const key = source + ':' + rawId;
      const x = t.clientX ?? t.x ?? t.pageX, y = t.clientY ?? t.y ?? t.pageY;
      const mapped = this.transformPoint(x, y);
      let id = this.aliases.get(key);
      if (id === undefined && phase === 'end') continue;
      if (id === undefined) {
        const nearest = [...this.active.values()].sort((a,b) => Math.hypot(a.x-mapped.x,a.y-mapped.y)-Math.hypot(b.x-mapped.x,b.y-mapped.y))[0];
        if (phase === 'start' && nearest && Math.hypot(nearest.x-mapped.x,nearest.y-mapped.y) < 24) id = nearest.identifier;
        else if (phase !== 'start' && this.active.has(rawId)) id = rawId;
        else if (phase !== 'start' && this.active.size === 1) id = this.active.keys().next().value;
        else if (phase !== 'start' && nearest && Number.isFinite(x) && Number.isFinite(y)) id = nearest.identifier;
        else if (phase === 'start') id = this.active.has(rawId) ? this.nextId-- : rawId;
        if (id !== undefined) this.aliases.set(key,id);
      }
      if (id === undefined) continue;
      const old = this.active.get(id);
      const p = Number.isFinite(x) && Number.isFinite(y) ? this.transformPoint(x, y, id) : old;
      if (!p) continue;
      if (phase === 'end') { if (old) this.release(p, e); continue; }
      if (phase === 'start') {
        if (old) continue;
        this.active.set(id, p); this.onStartListeners.forEach(fn => fn(p, e));
      } else if (old) {

        this.active.set(id, p); this.onMoveListeners.forEach(fn => fn(p, e));
      }
    }
  }
  private release(p: TouchPoint, e: any) { this.active.delete(p.identifier); for (const [key,id] of this.aliases) if (id === p.identifier) this.aliases.delete(key); this.onEndListeners.forEach(fn => fn(p, e)); }
  reset() { for (const p of [...this.active.values()]) this.release(p, {}); }
  setScale(x: number, y: number) { this.scaleX = x; this.scaleY = y; }
  transformPoint(x: number, y: number, identifier = 0): TouchPoint { return { x: x * this.scaleX, y: y * this.scaleY, identifier }; }
  bindCanvas(canvas: any) {
    if (!canvas?.addEventListener || this.canvases.has(canvas)) return;
    this.canvases.add(canvas);
    if (canvas.style) { canvas.style.touchAction = 'none'; canvas.style.userSelect = 'none'; }
    canvas.addEventListener('contextmenu', (e: any) => e.preventDefault?.());
    for (const [event, phase] of [['touchstart','start'],['touchmove','move'],['touchend','end'],['touchcancel','end'],['pointerdown','start'],['pointermove','move'],['pointerup','end'],['pointercancel','end'],['lostpointercapture','end'],['mousedown','start'],['mousemove','move'],['mouseup','end']] as const) {
      // In browsers use Pointer Events only; wx still gets a canvas-touch fallback.
      if (event.startsWith('mouse') && typeof window !== 'undefined' && typeof (window as any).PointerEvent === 'function') continue;
      if (event.startsWith('touch') && typeof wx === 'undefined') continue;
      canvas.addEventListener(event, (e: any) => {
        if (event === 'pointercancel') { this.cancelPointer(e); return; }
        if (event === 'lostpointercapture' && typeof wx !== 'undefined') return;
        if (e.cancelable) e.preventDefault?.();
        if (event === 'pointerdown') { try { canvas.setPointerCapture?.(e.pointerId); } catch {} }
        this.dispatch(event.startsWith('touch') ? 'canvas-touch' : event.startsWith('mouse') ? 'mouse' : 'pointer', phase, e);
      });
    }
  }
  onTouchStart(cb: TouchCallback) { this.onStartListeners.push(cb); }
  onTouchMove(cb: TouchCallback) { this.onMoveListeners.push(cb); }
  onTouchEnd(cb: TouchCallback) { this.onEndListeners.push(cb); }
  removeListener(cb: TouchCallback) { this.onStartListeners = this.onStartListeners.filter(f => f !== cb); this.onMoveListeners = this.onMoveListeners.filter(f => f !== cb); this.onEndListeners = this.onEndListeners.filter(f => f !== cb); }
  clear() { this.reset(); this.onStartListeners = []; this.onMoveListeners = []; this.onEndListeners = []; }
}
export const globalInput = new InputManager();


