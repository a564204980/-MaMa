import { Scene } from '../core/Scene';
import { TouchPoint } from '../core/InputManager';
import { StorageManager } from '../core/StorageManager';
import { globalResources } from '../core/ResourceManager';
import { globalEvents } from '../core/EventBus';
import { WechatBridge } from '../platform/WechatBridge';
import { SoundService } from '../systems/SoundService';
import { CharacterSprites } from '../systems/CharacterSprites';
import { Run } from '../gameplay/Run';
import { Point, rooms, floors, furniture, doorDefinitions, distance, walls, collisionShapes } from '../gameplay/House';
import { characterFrames } from '../gameplay/CharacterFrames';
import { drawRoundRect, drawSweatDrop } from '../utils/draw';
import { LullabyOverlay } from '../ui/LullabyOverlay';
import { GameViews, UIHelper } from '../ui/GameViews';
import { NightLighting } from '../systems/NightLighting';

type Screen = 'home' | 'play' | 'settings';
interface Button { x: number; y: number; w: number; h: number; label: string; action: () => void; primary?: boolean }
interface Progress { unlocked: number; best: number; runs: number; }
const thoughts = {
  stir: ['……', '有动静……', '被子动了……', '翻身了……'],
  restless: ['呼吸变了……', '睡得不沉了……', '又翻身了……', '快醒了吗……'],
  awake: ['醒了。', '坐起来了。', '怎么醒了……', '这下麻烦了。', '还没睡熟……'],
  walking: ['下床了……', '脚步声……', '有人走动。', '起来了……', '听见脚步了。'],
  caught: ['糟了。', '被看见了。', '来不及了。', '还是被发现了。', '躲不过了……'],
};
export class MainGameScene extends Scene {
  private screen: Screen = 'home';
  private sprites = new CharacterSprites();
  private lullabyOverlay = new LullabyOverlay();
  private back: Screen = 'home';
  private run = new Run('first-night');
  private progress = StorageManager.get<Progress>('progress_v1', { unlocked: 1, best: 0, runs: 0 });
  private settings = StorageManager.get('settings_v1', { hints: true, sound: true, cueVolume: .55, ambientVolume: .3 });
  private selected = 1;
  private buttons: Button[] = [];
  private keys = new Set<string>();
  private joystick: { id: number; origin: Point; current: Point } | null = null;
  private actionId: number | null = null;
  private holding = false;
  private holdTime = 0;
  private heldAction = false;
  private scale = 1; private ox = 0; private oy = 0; private rotated = false; private physicalWidth = 0;
  private saved = false; private daily = false; private resume = 0;
  private mapScale = 1.8; private mapX = 210; private mapY = 85;
  private clock = 0; private sounds = new SoundService(); private stepTimer = 0; private ambienceTimer = 0; private feedback = { found: 0, clues: 0, alerts: 0, noise: 0 };
  private ripples: Array<{ x: number; y: number; age: number; strength: number }> = [];
  private floatText: { text: string; age: number; level: number; duration: number } | null = null;
  private sleepDark = 0;
  private thoughtCooldown = 0;
  private thoughtLevel = -1;
  private thoughtChoices: Partial<Record<keyof typeof thoughts, number>> = {};
  private lastThoughtPhase = 'explore';
  private chasePanicTimer = 0;
  private chasePanicIndex = 0;
  private resultFadeTimer = 0;
  private babyCryTimer = 0;
  private lastCryHigh = false;
  private lullabyBtnProgress = 0;
  private tapBtnAnim = 0;
  private static CHASE_PANIC_LINES = [
    '糟糕糟糕……！',
    '哇！快溜快溜！',
    '要被抓住了……！',
    '别看这边别看这边……',
    '脚步好快，救命呀！',
  ];
  private thought(kind: keyof typeof thoughts, level: number) {
    // Escalations replace quiet observations; minor events never queue up.
    if (this.thoughtCooldown > 0 && level <= this.thoughtLevel) return;
    const choices = thoughts[kind];
    const previous = this.thoughtChoices[kind];
    // Pick from all alternatives except the last line heard in this category.
    const index = previous === undefined ? Math.floor(Math.random() * choices.length) : (previous + 1 + Math.floor(Math.random() * (choices.length - 1))) % choices.length;
    this.thoughtChoices[kind] = index;
    const text = choices[index];
    this.floatText = { text, age: 0, level, duration: level >= 2 ? 1.6 : 2.2 };
    this.thoughtCooldown = 7;
    this.thoughtLevel = level;
  }
  constructor() { super('MainGameScene'); }
  onEnter() {
    this.sprites.load().catch(() => this.run.say('角色图片加载失败，暂时使用简化人物。'));
    globalResources.loadImage('house', 'assets/images/house-night-merged.png').catch(() => this.run.say('场景图加载失败，已启用可玩地图。'));
    globalResources.loadImage('title', 'assets/images/title-night.jpg').catch(() => {});
    globalResources.loadImage('wish-props', 'assets/images/wish-props.png').catch(() => this.run.say('道具图片暂未加载，仍可按提示互动。'));
    if (typeof window !== 'undefined') { window.addEventListener('keydown', this.keyDown); window.addEventListener('keyup', this.keyUp); }
    globalEvents.on('input:reset', this.clearInput); globalEvents.on('app:hide', this.clearInput); globalEvents.on('app:show', this.onResume);
  }
  private clearInput = () => { this.sounds.stop(); this.keys.clear(); this.joystick = null; this.holding = false; this.actionId = null; };
  private onResume = () => { this.clearInput(); this.resume = 1; };
  private keyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
    this.keys.add(key); if (e.repeat) return;
    if (this.screen === 'play' && this.run.phase !== 'result') {
      if (key === 'e' || key === ' ') { this.holding = true; this.holdTime = 0; this.heldAction = false; }
      if (key === 'escape' && this.run.phase === 'explore') { this.back = 'play'; this.screen = 'settings'; }
    } else if (key === 'escape') { this.screen = this.screen === 'settings' ? this.back : this.screen === 'home' ? 'home' : 'play'; this.clearInput(); }
  };
  private keyUp = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); this.keys.delete(k); if (k === 'e' || k === ' ') this.releaseAction(); };
  private releaseAction() {
    if (this.holding && !this.heldAction && this.screen === 'play') {
      this.tapBtnAnim = 1.0;
      this.run.interact();
    }
    this.holding = false;
    this.actionId = null;
  }
  private start(daily = false) {
    this.sprites.reset();
    this.daily = daily;
    const seed = daily ? `daily-v1-${new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)}` : this.selected === 1 ? 'first-night-v1' : `night-${this.selected}-${Date.now()}`;
    this.run = new Run(seed, daily ? 3 : this.selected); this.feedback = { found: 0, clues: 0, alerts: 0, noise: 0 }; this.saved = false; this.screen = 'play'; this.clearInput();
    this.ripples = []; this.floatText = null; this.thoughtCooldown = 0; this.lastThoughtPhase = 'explore'; this.sleepDark = 0;
    this.babyCryTimer = 0; this.lastCryHigh = false; this.resultFadeTimer = 0; this.lullabyBtnProgress = 0; this.tapBtnAnim = 0;
    this.mapX = 600 - this.run.player.x * this.mapScale;
    this.mapY = 360 - this.run.player.y * this.mapScale;
  }
  onUpdate(dt: number) {
    this.clock += dt;
    if (this.resume > 0) { this.resume -= dt; return; }
    if (this.screen !== 'play') { this.sounds.stop(); return; }
    if (this.holding) { this.holdTime += dt; if (this.holdTime >= .5 && !this.heldAction) { this.heldAction = true; if (!this.run.hidden && !this.run.sleeping) this.run.interact(true); } }
    let x = Number(this.keys.has('d') || this.keys.has('arrowright')) - Number(this.keys.has('a') || this.keys.has('arrowleft'));
    let y = Number(this.keys.has('s') || this.keys.has('arrowdown')) - Number(this.keys.has('w') || this.keys.has('arrowup'));
    if (this.joystick) { x = (this.joystick.current.x - this.joystick.origin.x) / 60; y = (this.joystick.current.y - this.joystick.origin.y) / 60; }
    const length = Math.hypot(x, y); if (length > 1) { x /= length; y /= length; }
    if (this.keys.has('shift')) { x *= .35; y *= .35; }
    const familyBefore = this.run.family.map(f => ({ state: f.state, sleep: f.sleep }));
    const caughtBefore = this.run.caughtByFamily;
    this.thoughtCooldown = Math.max(0, this.thoughtCooldown - dt);
    if (this.run.phase === 'result') {
      this.resultFadeTimer = Math.min(1, this.resultFadeTimer + dt * 2.5);
    } else {
      this.resultFadeTimer = 0;
    }
    const targetLullabyBtn = (Boolean(this.run.lullaby) || this.run.interactionLabel.includes('轻拍') || this.run.interactionLabel.includes('哄睡')) && this.run.phase === 'explore';
    const lSpeed = targetLullabyBtn ? 4.8 : 3.6;
    if (targetLullabyBtn) {
      this.lullabyBtnProgress = Math.min(1, this.lullabyBtnProgress + dt * lSpeed);
    } else {
      this.lullabyBtnProgress = Math.max(0, this.lullabyBtnProgress - dt * lSpeed);
    }
    this.tapBtnAnim = Math.max(0, this.tapBtnAnim - dt * 6.0);
    if (this.floatText) { this.floatText.age += dt; if (this.floatText.age >= this.floatText.duration) this.floatText = null; }
    // Fade screen dark when sleeping (eyes closing), fade back when waking up.
    const darkTarget = (this.run.sleeping && this.run.phase !== 'result') ? 0.92 : 0;
    this.sleepDark += (darkTarget - this.sleepDark) * Math.min(1, dt * (this.run.sleeping ? 2.5 : 4));
    this.run.update(dt, { x, y }, this.holding);
    let playerDir = { x, y };
    if (this.run.momCaught) {
      const mom = this.run.family[1];
      if (mom) {
        playerDir = { x: this.run.player.x - mom.x, y: this.run.player.y - mom.y };
      }
    }
    this.sprites.track('player', this.run.player, dt, playerDir);
    this.run.family.forEach((f, i) => {
      let targetNode = f.path.length > 0 ? f.path[0] : undefined;
      if (f.path.length > 1 && Math.hypot(f.path[0].x - f.x, f.path[0].y - f.y) < 2) {
        targetNode = f.path[1];
      }
      let parentDir = targetNode ? { x: targetNode.x - f.x, y: targetNode.y - f.y } : undefined;
      if (this.run.momCaught && i === 1) {
        parentDir = { x: this.run.player.x - f.x, y: this.run.player.y - f.y };
      }
      this.sprites.track('family' + i, f, dt, parentDir);
    });
    const targetX = Math.min(150, Math.max(1280 - 150 - 1580 * this.mapScale, 560 - this.run.player.x * this.mapScale));
    const targetY = Math.min(100, Math.max(720 - 100 - 996 * this.mapScale, 360 - this.run.player.y * this.mapScale));
    // Snap camera immediately when sleeping so the player is in bed before darkness fades in.
    const camSpeed = this.run.sleeping ? 20 : 6;
    this.mapX += (targetX - this.mapX) * Math.min(1, camSpeed * dt);
    this.mapY += (targetY - this.mapY) * Math.min(1, camSpeed * dt);

    this.sounds.volume = this.settings.cueVolume ?? .55;
    if (this.run.found.size > this.feedback.found) this.sounds.play('found');
    if (this.run.alerts > this.feedback.alerts) this.sounds.play('warning');
    if (this.run.phase === 'result') this.floatText = null;
    else if (this.run.caughtByFamily > caughtBefore) this.thought('caught', 4);
    else if (this.run.family.some((f, i) => f.state === 'alert' && familyBefore[i].state === 'sleep')) this.thought('awake', 2);
    else if (this.run.family.some((f, i) => f.state === 'active' && familyBefore[i].state !== 'active')) this.thought('walking', 3);
    else if (this.run.family.some((f, i) => f.state === 'sleep' && f.sleep < 55 && familyBefore[i].sleep >= 55)) this.thought('restless', 1);
    else if (this.run.family.some((f, i) => f.state === 'sleep' && f.sleep < 70 && familyBefore[i].sleep >= 70)) this.thought('stir', 0);
    this.lastThoughtPhase = this.run.phase;
    const isChased = !this.run.sleeping && !this.run.hidden && this.run.family.some(f => 
      f.state === 'active' && !f.returning && distance(f, this.run.player) < 260
    );
    if (isChased && this.run.phase !== 'result' && this.run.playerStunTimer <= 0) {
      this.chasePanicTimer -= dt;
      if (this.chasePanicTimer <= 0) {
        this.chasePanicTimer = 3.2 + Math.random() * 1.5;
        const line = MainGameScene.CHASE_PANIC_LINES[this.chasePanicIndex++ % MainGameScene.CHASE_PANIC_LINES.length];
        this.run.sayChatter(line, 2.2);
      }
    } else {
      this.chasePanicTimer = 0.5;
    }
    if (this.run.noise >= 19 && this.feedback.noise < 19) this.sounds.play('door');
    this.feedback = { found: this.run.found.size, clues: 0, alerts: this.run.alerts, noise: this.run.noise };
    this.ripples = this.ripples.filter(r => (r.age += dt) < 0.35);
    this.stepTimer += dt; this.ambienceTimer += dt;
    if (this.stepTimer > .55 && length > .05 && !this.run.hidden && !this.run.sleeping && this.run.phase !== 'result') {
      this.stepTimer = 0; this.sounds.volume *= .28; this.sounds.play('step');
      this.ripples.push({ x: this.run.player.x, y: this.run.player.y + 23, age: 0, strength: length });
    }
    if (this.ambienceTimer > 5 && this.run.phase !== 'result') {
      this.ambienceTimer = 0; this.sounds.volume = this.settings.ambientVolume ?? .3;
      if (this.run.cry > 40 && this.run.cry < 75) this.sounds.play('cry', { x: 214, y: 558 }, this.run.player);
    }
    const isBabyCrying = this.run.cry >= 75 && this.run.babySleepShield <= 0 && this.run.phase !== 'result';
    if (isBabyCrying) {
      if (!this.lastCryHigh) {
        // 瞬间爆发：失误大哭瞬间零延迟响起啼哭与警报！
        this.sounds.volume = this.settings.cueVolume ?? .65;
        this.sounds.play('cry');
        this.sounds.play('warning');
        this.babyCryTimer = 1.9;
      } else {
        this.babyCryTimer -= dt;
        if (this.babyCryTimer <= 0) {
          this.babyCryTimer = 2.0 + Math.random() * 0.4;
          this.sounds.volume = this.settings.cueVolume ?? .65;
          this.sounds.play('cry', { x: 214, y: 558 }, this.run.player);
        }
      }
    } else {
      this.babyCryTimer = 0;
    }
    this.lastCryHigh = isBabyCrying;

    if (this.run.phase === 'result' && !this.saved) {
      this.saved = true; this.progress.runs++; this.progress.best = Math.max(this.progress.best, this.run.score);
      if (this.run.escaped && !this.daily) this.progress.unlocked = Math.min(4, Math.max(this.progress.unlocked, this.selected + 1));
      StorageManager.set('progress_v1', this.progress);
    }
  }
  private text(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 16, color = '#e8dfce', align: CanvasTextAlign = 'left') {
    ctx.fillStyle = color; ctx.font = `${size >= 30 ? 'bold' : 'normal'} ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
  }
  private box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, stroke?: string) {
    ctx.fillStyle = color; drawRoundRect(ctx, x, y, w, h, 2); ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  private button(ctx: CanvasRenderingContext2D, b: Button) {
    this.buttons.push(b); this.box(ctx, b.x, b.y, b.w, b.h, b.primary ? '#691515' : 'rgba(20,22,22,.91)', b.primary ? '#a83232' : '#454a48');
    this.text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2, 16, b.primary ? '#e8d4b3' : '#a3aca8', 'center');
  }
  private wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, size = 17, color = '#d0cbbd') {
    let line = '', row = 0; for (const c of text) { if (line.length >= max) { this.text(ctx, line, x, y + row++ * 28, size, color); line = ''; } line += c; } if (line) this.text(ctx, line, x, y + row * 28, size, color);
  }
  private get viewportBounds() {
    const sys = WechatBridge.getSystemInfo();
    const vw = this.rotated ? sys.windowHeight : sys.windowWidth;
    const vh = this.rotated ? sys.windowWidth : sys.windowHeight;
    const s = this.scale || 1;
    return {
      left: -this.ox / s,
      top: -this.oy / s,
      width: vw / s,
      height: vh / s,
    };
  }
  private panel(ctx: CanvasRenderingContext2D, title: string, sub: string) {
    this.buttons = [];
    const b = this.viewportBounds;
    this.box(ctx, b.left, b.top, b.width, b.height, 'rgba(5,5,5,.94)');
    this.box(ctx, 245, 100, 790, 530, '#141111', '#752424');
    this.text(ctx, title, 290, 150, 30, '#ba3434');
    this.text(ctx, sub, 290, 192, 14, '#a39b8d');
  }
  private get uiHelper(): UIHelper {
    return {
      text: this.text.bind(this),
      box: this.box.bind(this),
      button: this.button.bind(this),
      wrap: this.wrap.bind(this),
      panel: this.panel.bind(this),
    };
  }
  onRender(ctx: CanvasRenderingContext2D) {
    const sys = WechatBridge.getSystemInfo();
    const w = sys.windowWidth, h = sys.windowHeight;
    const atHome = this.screen === 'home' || (this.screen === 'settings' && this.back === 'home');
    const landscapeHome = atHome && w >= h;
    this.rotated = !atHome && h > w; this.physicalWidth = w;
    const vw = this.rotated ? h : w, vh = this.rotated ? w : h;
    const dw = atHome && !landscapeHome ? 390 : 1280, dh = atHome && !landscapeHome ? 844 : 720;
    const left = this.rotated ? 0 : sys.safeAreaLeft, right = this.rotated ? 0 : sys.safeAreaRight;
    this.scale = Math.min((vw - left - right) / dw, vh / dh);
    this.ox = left + (vw - left - right - dw * this.scale) / 2; this.oy = (vh - dh * this.scale) / 2;
    ctx.fillStyle = '#090f14'; ctx.fillRect(0, 0, w, h);
    if (atHome) {
      const image = globalResources.getImage('title');
      if (image) {
        const cover = Math.max(w / image.width, h / image.height);
        ctx.drawImage(image, (w - image.width * cover) / 2, (h - image.height * cover) / 2, image.width * cover, image.height * cover);
      }
      const shade = ctx.createLinearGradient(0, 0, w, 0);
      shade.addColorStop(0, 'rgba(15,4,4,.9)'); shade.addColorStop(.65, 'rgba(15,4,4,.4)'); shade.addColorStop(1, 'rgba(15,4,4,.15)');
      ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);
    }
    ctx.save();
    if (this.rotated) { ctx.translate(w, 0); ctx.rotate(Math.PI / 2); }
    ctx.translate(this.ox, this.oy); ctx.scale(this.scale, this.scale); this.buttons = [];
    if (atHome) {
      if (landscapeHome) {
        GameViews.drawLandscapeHome(ctx, this.uiHelper, this.selected, this.progress, {
          start: (daily) => this.start(daily),
          switchNight: () => { this.selected = this.selected % this.progress.unlocked + 1; },
          openSettings: () => { this.back = 'home'; this.screen = 'settings'; }
        });
        if (this.screen === 'settings') {
          GameViews.drawSettingsPanel(ctx, this.uiHelper, this.settings, () => { this.screen = 'home'; this.clearInput(); }, () => { this.screen = this.back; this.clearInput(); });
        }
      } else {
        GameViews.drawPortraitHome(ctx, this.uiHelper, this.selected, this.progress, {
          start: (daily) => this.start(daily),
          switchNight: () => { this.selected = this.selected % this.progress.unlocked + 1; },
          openSettings: () => { this.back = 'home'; this.screen = 'settings'; }
        });
        if (this.screen === 'settings') {
          GameViews.drawPortraitSettings(ctx, this.uiHelper, this.settings, () => { this.screen = 'home'; this.clearInput(); });
        }
      }
    } else {
      this.game(ctx);
      if (this.run.phase === 'result') {
        const resultAlpha = Math.min(1, Math.max(0, this.resultFadeTimer));
        ctx.save();
        ctx.globalAlpha = resultAlpha;
        GameViews.drawResult(ctx, this.uiHelper, this.run, this.daily, {
          onHome: () => { this.screen = 'home'; },
          onRestart: () => this.start(this.daily)
        });
        ctx.restore();
      }
      if (this.screen === 'settings') {
        GameViews.drawSettingsPanel(ctx, this.uiHelper, this.settings, () => { this.screen = 'home'; this.clearInput(); }, () => { this.screen = this.back; this.clearInput(); });
      }
      if (this.resume > 0) { this.box(ctx, 450, 290, 380, 95, '#111a20'); this.text(ctx, '正在回到这个夜晚…', 640, 337, 24, '#ece3d2', 'center'); }
    }
    ctx.restore();
  }
  private game(ctx: CanvasRenderingContext2D) {
    const r = this.run, img = globalResources.getImage('house');
    this.box(ctx, 0, 0, 1280, 720, '#0b1219');
    ctx.save(); ctx.translate(this.mapX, this.mapY); ctx.scale(this.mapScale, this.mapScale);
    if (img) ctx.drawImage(img, 0, 0, 1580, 996); else { for (const f of floors) this.box(ctx, f.x, f.y, f.w, f.h, '#665442'); for (const f of furniture) this.box(ctx, f.x, f.y, f.w, f.h, '#292a29'); }
    NightLighting.render(ctx, false);
    // this.drawCollisionDebug(ctx);
    for (const d of doorDefinitions) {
      ctx.strokeStyle = r.closed.has(d.id) ? '#d9ba84' : '#617e78'; ctx.lineWidth = 7; ctx.beginPath();
      if (d.h > d.w) { ctx.moveTo(d.x, d.y - d.h / 2); ctx.lineTo(d.x + (r.closed.has(d.id) ? 0 : 24), d.y + d.h / 2); } else { ctx.moveTo(d.x - d.w / 2, d.y); ctx.lineTo(d.x + d.w / 2, d.y + (r.closed.has(d.id) ? 0 : 20)); } ctx.stroke();
    }
    for (const s of r.spots) {
      if (s.kind === 'toy' && (r.found.has(s.id)||r.carrying?.id===s.id)) continue;
      if(s.kind==='toy')this.prop(ctx,s.toy!,s.x,s.y+12,34);
    }
    r.family.forEach((f, i) => {
      if (f.state === 'sleep' || f.state === 'alert') {
        const turning = f.sleep < 70;
        const posX = i === 0 ? 229 : 281;
        const posY = 108;
        this.sleeper(ctx, posX, posY, f.name, i === 0 ? '#758998' : '#ac8493', false, f.state === 'alert');
        if (i === 1 && r.momToy && f.state === 'sleep') {
          ctx.save();
          ctx.translate(posX + 14, posY + 10);
          ctx.rotate(0.2);
          this.prop(ctx, r.momToy, 0, 0, 22);
          ctx.restore();
        }
        if (f.state === 'alert') {
          const alertColor = i === 1 ? '#ff6464' : '#e6be8a';
          const alertText = i === 1 ? `揉眼中 · ${Math.ceil(f.timer)}秒 💢` : `揉眼中 · ${Math.ceil(f.timer)}秒`;
          const alertX = i === 0 ? 218 : 292;
          this.text(ctx, alertText, alertX, 68, 12, alertColor, 'center');
        }
        if (f.chatter && f.chatterTimer && f.chatterTimer > 0) {
          this.text(ctx, f.chatter, i === 0 ? 229 : 281, 52, 13, '#ffffff', 'center');
        }
      }
    });
    const babyLabel = r.babySleepShield > 0 ? `婴儿 · 安睡 ${Math.ceil(r.babySleepShield)}s` : (r.cry > 75 ? '婴儿 · 哭闹' : '婴儿');
    this.sleeper(ctx, 214, 558, babyLabel, r.babySleepShield > 0 ? '#78b598' : '#b9b093', true, r.cry > 75 && r.babySleepShield <= 0);
    r.family.forEach((f,i)=>{
      if(f.state==='active'){
        const isMom = i === 1;
        const isAngry = !f.returning && (isMom || (r.dadForgives<=0 && r.family[1].state==='sleep'));
        if(!this.sprites.draw(ctx,'family'+i,isMom?'mother':'father',f,isAngry))this.actor(ctx,f,'#c09f7a',.9);
        const nameColor = (isMom && isAngry) ? '#ff5454' : '#ecd4ac';
        const displayName = (isMom && isAngry) ? `${f.name} 💢` : f.name;
        this.text(ctx, displayName, f.x, f.y - 45, 15, nameColor, 'center');

        // 碎碎念文字（无背景纯文字，带阴影提升辨识度）
        if (f.chatter && f.chatterTimer && f.chatterTimer > 0) {
          ctx.save();
          ctx.shadowColor = '#000000';
          ctx.shadowBlur = 4;
          this.text(ctx, f.chatter, f.x, f.y - 68, 13, isMom && isAngry ? '#ffe2e2' : '#ffffff', 'center');
          ctx.restore();
        }
      }
    });
    const glow = ctx.createRadialGradient(r.player.x, r.player.y, 4, r.player.x, r.player.y, 92); glow.addColorStop(0, 'rgba(229,219,169,.18)'); glow.addColorStop(1, 'rgba(229,219,169,0)'); ctx.fillStyle = glow; ctx.fillRect(r.player.x - 95, r.player.y - 95, 190, 190);

    // 绘制脚底声音涟漪
    ctx.save();
    ctx.lineWidth = 1.5;
    for (const ripple of this.ripples) {
      const progress = ripple.age / 0.35;
      const radius = 6 + progress * (ripple.strength * 10);
      const alpha = Math.pow(1 - progress, 2) * (0.15 + ripple.strength * 0.35);
      ctx.strokeStyle = `rgba(210, 217, 204, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Keep the reachable bedside anchor for inspection; draw the sleeper on the pillow.
    const isEatingOrCarrying = Boolean(r.carrying || r.activity === 'cake');
    const playerPose = r.playerStunTimer > 0 ? 'stun' : (isEatingOrCarrying ? 'eat' : 'default');
    const hopY = r.momCaught ? -Math.abs(Math.sin(this.clock * 22)) * 10 : 0;
    const shakeX = r.momCaught ? Math.sin(this.clock * 32) * 2 : 0;
    const drawPlayerPos = { x: r.player.x + shakeX, y: r.player.y + hopY };
    if (r.sleeping) this.sleeper(ctx, 240, 315, '装睡', '#526b87');
    else if(!this.sprites.draw(ctx,'player','girl',drawPlayerPos,false,r.hidden?.4:1, playerPose)) this.actor(ctx, drawPlayerPos, r.hidden ? '#7b8e9a' : '#d1d8ca', r.hidden ? .4 : 1);
    if (r.playerStunTimer > 0) {
      const shake = Math.sin(this.clock * 45) * 2;
      ctx.save();
      ctx.font = 'bold 24px sans-serif';
      ctx.fillStyle = '#ff3b3b';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      ctx.textAlign = 'center';
      ctx.fillText('！', r.player.x + shake, r.player.y + hopY - 48);
      ctx.restore();
    }
    if (r.momCaught) {
      ctx.save();
      // 1. 头顶三颗旋转眩晕小星星
      for (let s = 0; s < 3; s++) {
        const starAngle = this.clock * 7 + s * (Math.PI * 2 / 3);
        const starX = r.player.x + Math.cos(starAngle) * 20;
        const starY = r.player.y + hopY - 48 + Math.sin(starAngle) * 7;
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💫', starX, starY);
      }

      // 2. 经典漫画击打爆星与“啪！”拟声词（精准在妈妈与主角屁股/后背交界处爆发）
      const mom = r.family[1];
      const spankPhase = (this.clock * 3.8) % 1;
      const spankSide = Math.sin(this.clock * 8) > 0 ? 1 : -1;
      let hitX = r.player.x + spankSide * 12;
      let hitY = r.player.y + 6;
      if (mom) {
        const dx = mom.x - r.player.x;
        const dy = mom.y - r.player.y;
        const d = Math.hypot(dx, dy) || 1;
        // 靠近老妈一侧的后背/屁股
        hitX = r.player.x + (dx / d) * 14 + spankSide * 4;
        hitY = r.player.y + (dy / d) * 14 + hopY + 6;
      }
      if (spankPhase < 0.65) {
        ctx.save();
        const pop = 1.0 + 0.35 * Math.sin(spankPhase / 0.65 * Math.PI);
        ctx.translate(hitX, hitY);
        ctx.scale(pop, pop);
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffe27a';
        ctx.shadowBlur = 6;
        ctx.fillText('💥', 0, 0);

        // 拟声词飘起
        ctx.font = 'bold 13px sans-serif';
        ctx.fillStyle = '#ffdf4a';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 3;
        const words = ['啪！', '嗷！', '啪啪！'];
        const word = words[Math.floor((this.clock * 2.5) % words.length)];
        ctx.fillText(word, 0, -18);
        ctx.restore();
      }

      // 3. 喷涌飞出的滑稽宽面条眼泪粒子
      for (const dir of [-1, 1]) {
        for (let p = 0; p < 3; p++) {
          const tearPhase = (this.clock * 3.0 + p * 0.33) % 1;
          const tX = r.player.x + dir * (10 + tearPhase * 18);
          const tY = r.player.y - 28 - Math.sin(tearPhase * Math.PI) * 12 + tearPhase * 8;
          const alpha = (1 - tearPhase) * 0.95;
          ctx.fillStyle = `rgba(100, 200, 255, ${alpha.toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(tX, tY, 2.2 * (1 - tearPhase * 0.4), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 4. 妈妈头顶伴随挥掌怒气「💢」
      if (mom) {
        const angryScale = 1.0 + Math.sin(this.clock * 12) * 0.2;
        ctx.save();
        ctx.translate(mom.x, mom.y - 50);
        ctx.scale(angryScale, angryScale);
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💢', 0, 0);
        ctx.restore();
      }
      ctx.restore();
    }
    // 选项C：双向受惊呼应系统（冷汗水滴）
    const beingChased = !r.sleeping && !r.hidden && r.family.some(f => 
      f.state === 'active' && !f.returning && distance(f, r.player) < 260
    );
    if (r.playerStunTimer > 0) {
      const sweatBob = Math.sin(this.clock * 22) * 1.5;
      drawSweatDrop(ctx, r.player.x + 18, r.player.y - 34 + sweatBob, 5.5, 0.3);
      drawSweatDrop(ctx, r.player.x - 18, r.player.y - 34 + sweatBob, 5.5, -0.3);
    } else if (beingChased) {
      const sweatBob = Math.sin(this.clock * 16) * 2.0;
      drawSweatDrop(ctx, r.player.x + 14, r.player.y - 35 + sweatBob, 6.0, 0.28);
      drawSweatDrop(ctx, r.player.x + 21, r.player.y - 42 + sweatBob * 0.8, 3.8, 0.38);
    }
    if(r.carrying&&!r.sleeping&&!r.hidden){
      this.prop(ctx,r.carrying.toy!,r.player.x,r.player.y+1,31);
    }
    if(r.tvOn){this.box(ctx,746,148,100,39,'#628b9c');this.text(ctx,'♪',797,167,22,'#d5edb2','center');}
    if(r.activity){
      const px = r.player.x, py = r.player.y - 67; // 进度条依然在头顶
      
      // 蛋糕图标移动到人物嘴巴位置 (y-18 左右)
      if (r.activity === 'cake') {
        const mouthY = r.player.y - 18;
        // 每 0.4 秒交替旋转一下 (-5度到5度)，并且随着进度缩小
        const eatingAngle = (Math.floor(this.clock * 2.5) % 2 === 0) ? -0.1 : 0.1;
        const currentScale = 1 - r.actionProgress; // 进度越满，蛋糕越小
        if (currentScale > 0.05) {
          ctx.save();
          ctx.translate(r.player.x, mouthY);
          ctx.rotate(eatingAngle);
          ctx.scale(currentScale, currentScale);
          this.prop(ctx, 'cake', 0, 0, 18);
          ctx.restore();
        }
      } else {
        // 电视图标还是在进度条旁边
        this.prop(ctx, r.activity, px - 37, py, 18);
      }
      
      // 进度槽底色和进度色
      this.box(ctx, px - 23, py - 3, 58, 6, '#283138'); 
      this.box(ctx, px - 23, py - 3, 58 * r.actionProgress, 6, '#e7b18c');
    }
    // 主角碎碎念气泡（含平滑淡入淡出与轻柔上浮动画）
    if (r.taskLineTime > 0 && !this.floatText && !r.sleeping && !r.hidden) {
      const dur = r.taskLineDuration || 2.6;
      const elapsed = dur - r.taskLineTime;
      const fadeIn = Math.min(1, elapsed / 0.3);
      const fadeOut = Math.min(1, r.taskLineTime / 0.35);
      const alpha = Math.max(0, Math.min(1, fadeIn * fadeOut));
      const floatY = (1 - fadeIn) * 4 + (elapsed / dur) * 3;
      const px = r.player.x;
      const py = r.activity ? (r.player.y - 67 - 20 - floatY) : (r.player.y - 48 - floatY);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      this.text(ctx, r.taskLine, px, py + 3.5, 12, '#f6e7d0', 'center');
      ctx.restore();
    }
    if (this.floatText) {
      const progress = this.floatText.age / this.floatText.duration;
      ctx.save(); ctx.globalAlpha = progress < 0.1 ? progress / 0.1 : progress > 0.8 ? (1 - progress) / 0.2 : 1;
      const emphasis = this.floatText.level >= 2 ? 1 + .08 * Math.max(0, 1 - this.floatText.age / .18) : 1;
      ctx.translate(r.sleeping ? 252 : r.player.x + 12, r.sleeping ? 275 : r.player.y - (r.activity?95:53)); ctx.scale(emphasis, emphasis);
      ctx.shadowColor = '#080b10'; ctx.shadowBlur = 3;
      this.text(ctx, this.floatText.text, 0, 0, this.floatText.level === 0 ? 12 : 14, this.floatText.level >= 2 ? '#c77b73' : this.floatText.level === 1 ? '#d2c7b4' : '#a6ada9', 'center');
      ctx.restore();
    }
    if (r.hidden && this.sleepDark < 0.3) this.text(ctx, '躲藏', r.player.x, r.player.y - 34, 16, '#fff0cd', 'center');
    ctx.restore();
    // The world extends outside the centered 1280x720 HUD on wide phones.
    // Convert the full viewport into HUD coordinates, including safe-area margins.
    const bounds = this.viewportBounds;
    const viewLeft = bounds.left;
    const viewTop = bounds.top;
    const viewWidth = bounds.width;
    const viewHeight = bounds.height;
    const viewBottom = viewTop + viewHeight;
    // Sleep darkness overlay — simulates eyes closing.
    if (this.sleepDark > 0.01) {
      ctx.fillStyle = `rgba(0,0,0,${this.sleepDark.toFixed(3)})`;
      ctx.fillRect(viewLeft, viewTop, viewWidth, viewHeight);
      if (this.sleepDark > 0.6) {
        const inspecting = r.inspecting;
        const nearbyParent = r.sleeping && (inspecting || r.family.some(f => f.state === 'active' && distance(f, r.player) < 320));
        const alpha = Math.min(1, (this.sleepDark - 0.6) / 0.32).toFixed(3);
        let hint: string;
        if (inspecting) hint = `别……动……  ${Math.ceil(r.inspectionTimer)}`;
        else if (nearbyParent) hint = '有脚步声……别动';
        else hint = '交互键 · 起身';
        this.text(ctx, hint, 640, 680, 14, `rgba(180,160,130,${alpha})`, 'center');
        // Breathing guide circle — only visible during inspection.
        if (inspecting) {
          const bPhase = r.breathPhase;
          // Triangle wave: inhale 0→0.5 (expand), exhale 0.5→1 (contract)
          const breathT = bPhase < 0.5 ? bPhase * 2 : (1 - bPhase) * 2;
          const radius = 22 + 28 * breathT;
          const inWindow = bPhase >= 0.68 && bPhase <= 0.95;
          const circleAlpha = parseFloat(alpha) * (inWindow ? 0.75 : 0.35);
          const cx = viewLeft + viewWidth / 2, cy = viewTop + viewHeight / 2;
          ctx.save();
          ctx.strokeStyle = inWindow ? `rgba(160,210,185,${circleAlpha})` : `rgba(110,150,140,${circleAlpha})`;
          ctx.lineWidth = inWindow ? 2 : 1.5;
          ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
          // Pulsing dot at center when in tap window ("breathe out now")
          if (inWindow) {
            const dotAlpha = circleAlpha * (0.5 + 0.5 * Math.sin(this.clock * 14));
            ctx.fillStyle = `rgba(160,210,185,${dotAlpha.toFixed(3)})`;
            ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
          }
          ctx.restore();
        }
      }
    }
    
    const topGlow = ctx.createLinearGradient(0, 0, 0, 110);
    topGlow.addColorStop(0, 'rgba(5,2,2,0.95)'); topGlow.addColorStop(1, 'rgba(5,2,2,0)');
    ctx.fillStyle = topGlow; ctx.fillRect(viewLeft, viewTop, viewWidth, 110 - viewTop);
    
    this.text(ctx, '疯狂妈妈MaMa', 45, 36, 24, '#ba3434'); 
    this.text(ctx, `第 ${r.night} 夜  ·  ${Math.floor(r.elapsed / 60).toString().padStart(2, '0')}:${Math.floor(r.elapsed % 60).toString().padStart(2, '0')}`, 45, 68, 14, '#8a7d76');
    const meters = [...r.family.map(f => ({ name: f.name, value: f.sleep, sub: f.state === 'sleep' ? (f.sleep < 30 ? '快醒了' : f.sleep < 70 ? '浅睡' : '沉睡') : f.state === 'alert' ? '惊动！' : '走动中' })), { name: '婴儿', value: r.babySleepShield > 0 ? 100 : 100 - r.cry, sub: r.babySleepShield > 0 ? `安睡 ${Math.ceil(r.babySleepShield)}s` : (r.cry > 75 ? '哭闹！' : r.cry > 40 ? '躁动' : '安静') }, { name: '你的睡意', value: r.sleepProgress, sub: `${Math.floor(r.sleepProgress)}%` }];
    meters.forEach((m, i) => { const x = 280 + i * 180; this.text(ctx, m.name, x, 36, 16, '#c4b5a3'); this.text(ctx, m.sub, x + 135, 36, 13, i === 3 ? '#c44343' : '#918274', 'right'); this.box(ctx, x, 56, 135, 3, '#1a1010'); this.box(ctx, x, 56, Math.max(1, m.value * 1.35), 3, i === 3 ? '#8b1e1e' : '#736555'); });
    this.text(ctx, `机会 ${Math.max(0, 3 - r.caughtByFamily)}`, 1080, 48, 17, '#ba8d84', 'right');
    if (r.phase === 'explore') this.button(ctx, { x: 1115, y: 28, w: 90, h: 42, label: '暂停', action: () => { this.back = 'play'; this.screen = 'settings'; this.clearInput(); } });
    // 🚨 婴儿大哭 & 妈妈破门冲锋危机提示（纯净通透悬浮，彻底移除突兀生硬的红色背景框）
    if (r.cry >= 75 && r.babySleepShield <= 0 && r.phase === 'explore') {
      const bannerPulse = 0.85 + 0.15 * Math.sin(this.clock * 8);
      const alpha = (0.92 * bannerPulse).toFixed(2);
      ctx.save();
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 6;
      this.text(ctx, '🚨 小宝宝嚎啕大哭！妈妈被彻底吵醒，正破门冲来！！', 640, 84, 13, `rgba(255, 95, 95, ${alpha})`, 'center');
      ctx.restore();
    }
    const isDraining = r.sleepDrainRate > 0;
    let status = `剩余 ${Math.max(0, Math.ceil(r.timeLimit - r.elapsed))} 秒${r.tvOn ? ' · 电视还开着' : ''}`;
    if (isDraining) {
      status = '被爸妈追赶惊吓！肾上腺素飙升，睡意正在飞速消散！！';
    } else if (r.sleeping) {
      status = r.sleepProgress >= 100 ? '睡意圆满… 正在进入深度甜蜜梦乡…' : `在床上装睡避险中 · 睡意 ${Math.floor(r.sleepProgress)}%`;
    } else if (r.hidden) {
      status = `躲藏平复心率中 · 屏息耐力 ${Math.ceil(r.breath)}%`;
    }
    this.text(ctx, status, 640, 680, 15, isDraining ? '#ff7373' : '#c7d3c0', 'center');
    
    // 虚拟摇杆
    const restingX = 139, restingY = 550, origin = this.joystick ? this.joystick.origin : { x: restingX, y: restingY };
    ctx.strokeStyle = '#68858d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(origin.x, origin.y, 65, 0, Math.PI * 2); ctx.stroke();
    const joy = this.joystick; const delta = joy ? { x: joy.current.x - joy.origin.x, y: joy.current.y - joy.origin.y } : { x: 0, y: 0 }; const len = Math.max(1, Math.hypot(delta.x, delta.y) / 55);
    ctx.fillStyle = '#91aab0'; ctx.beginPath(); ctx.arc(origin.x + delta.x / len, origin.y + delta.y / len, 43, 0, Math.PI * 2); ctx.fill();
    
    // 圆形交互按钮
    const btnCx = 1141, btnCy = 550, btnR = 80;
    const label = r.interactionLabel;
    const hasInteraction = label.length > 0;
    this.buttons.push({ 
      x: btnCx - btnR, 
      y: btnCy - btnR, 
      w: btnR * 2, 
      h: btnR * 2, 
      label, 
      primary: hasInteraction, 
      action: () => {
        if (this.lullabyBtnProgress > 0.25) {
          this.tapBtnAnim = 1.0;
        }
        r.interact();
      } 
    });
    
    // 底部提示文字
    this.text(ctx, 'WASD / 方向键 · Shift 慢走', restingX, 700, 11, '#72878b', 'center');

    // 普通交互/待机形态按钮（随 lullabyBtnProgress 平滑淡出）
    if (this.lullabyBtnProgress < 0.999) {
      ctx.save();
      if (this.lullabyBtnProgress > 0.001) {
        ctx.globalAlpha = 1 - this.lullabyBtnProgress;
      }
      if (hasInteraction) {
        const pulse = 0.85 + 0.15 * Math.sin(this.clock * 3.5);
        const glowR = btnR * 1.4 * pulse;
        const glow2 = ctx.createRadialGradient(btnCx, btnCy, btnR * 0.6, btnCx, btnCy, glowR);
        glow2.addColorStop(0, 'rgba(140,20,20,0.28)');
        glow2.addColorStop(1, 'rgba(140,20,20,0)');
        ctx.fillStyle = glow2; ctx.beginPath(); ctx.arc(btnCx, btnCy, glowR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(30,8,8,0.88)'; ctx.beginPath(); ctx.arc(btnCx, btnCy, btnR, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#a83232'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(btnCx, btnCy, btnR, 0, Math.PI * 2); ctx.stroke();
        const lines = label.split('/').map((s: string) => s.trim());
        if (lines.length > 1) { this.text(ctx, lines[0], btnCx, btnCy - 11, 17, '#e8d4b3', 'center'); this.text(ctx, lines[1], btnCx, btnCy + 13, 14, '#a38a7a', 'center'); }
        else this.text(ctx, label, btnCx, btnCy, 17, '#e8d4b3', 'center');
      } else {
        ctx.fillStyle = 'rgba(20,24,28,0.35)'; ctx.beginPath(); ctx.arc(btnCx, btnCy, btnR, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#323c42'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(btnCx, btnCy, btnR, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }

    // 专属轻拍哄睡金色手势按钮（图 1 风格：跟随光点点击 + 食指放射线 + 弹性弹开过渡）
    if (this.lullabyBtnProgress > 0.001) {
      this.drawLullabyActionButton(ctx, btnCx, btnCy, btnR, this.lullabyBtnProgress, this.clock, this.tapBtnAnim);
    }

    // 绘制哄睡小游戏 UI
    this.lullabyOverlay.draw(ctx, r.lullaby, this.clock, this.text.bind(this));
    // Red heartbeat vignette drawn last — on top of all HUD — so it appears on all four edges.
    if (this.sleepDark > 0.01) {
      const inspecting = r.inspecting;
      const nearbyParent = r.sleeping && (inspecting || r.family.some(f => f.state === 'active' && distance(f, r.player) < 320));
      if (nearbyParent) {
        const pulseFreq = inspecting ? 8 : 5;
        const pulseAmp  = inspecting ? 0.22 : 0.12;
        const pulseBase = inspecting ? 0.30 : 0.18;
        const pulse = pulseBase + pulseAmp * Math.sin(this.clock * pulseFreq);
        const edgeAlpha = (pulse * this.sleepDark * 0.45).toFixed(3);
        const redEdge = `rgba(100,5,5,${edgeAlpha})`;
        const clear = 'rgba(0,0,0,0)';
        const ex = viewWidth * 0.38, ey = viewHeight * 0.38;
        const tg = ctx.createLinearGradient(0, viewTop, 0, viewTop + ey);
        tg.addColorStop(0, redEdge); tg.addColorStop(1, clear);
        ctx.fillStyle = tg; ctx.fillRect(viewLeft, viewTop, viewWidth, ey);
        const bg = ctx.createLinearGradient(0, viewTop + viewHeight, 0, viewTop + viewHeight - ey);
        bg.addColorStop(0, redEdge); bg.addColorStop(1, clear);
        ctx.fillStyle = bg; ctx.fillRect(viewLeft, viewTop + viewHeight - ey, viewWidth, ey);
        const lg = ctx.createLinearGradient(viewLeft, 0, viewLeft + ex, 0);
        lg.addColorStop(0, redEdge); lg.addColorStop(1, clear);
        ctx.fillStyle = lg; ctx.fillRect(viewLeft, viewTop, ex, viewHeight);
        const rg = ctx.createLinearGradient(viewLeft + viewWidth, 0, viewLeft + viewWidth - ex, 0);
        rg.addColorStop(0, redEdge); rg.addColorStop(1, clear);
        ctx.fillStyle = rg; ctx.fillRect(viewLeft + viewWidth - ex, viewTop, ex, viewHeight);
      }
    }
    // 被妈妈抓获时戏剧落幕特效（前 2.6 秒纯现场挨揍狂欢，0.5 秒黑幕收拢，后 1.9 秒纯黑剧场大字从容展示）
    if (r.momCaught) {
      const curtainStart = 2.4; // 倒数至 2.4 秒时开始收拢黑幕（前 2.6 秒为无遮挡纯现场挨揍表演）
      const textStart = 1.9;    // 倒数至 1.9 秒时黑幕已完全纯黑，专场大字登场
      if (r.momCaughtTimer <= curtainStart) {
        ctx.save();
        // 黑幕淡入阶段：2.4s -> 1.9s（0.5 秒内平滑升至 1.0 纯黑）
        const fadeProgress = Math.min(1, Math.max(0, (curtainStart - r.momCaughtTimer) / (curtainStart - textStart)));
        ctx.fillStyle = `rgba(0, 0, 0, ${(fadeProgress * 0.98).toFixed(3)})`;
        ctx.fillRect(viewLeft, viewTop, viewWidth, viewHeight);

        // 专场落幕大字展示阶段：1.9s -> 0s（持续整整 1.9 秒，背景纯黑，无底层气泡重叠打架）
        if (r.momCaughtTimer <= textStart) {
          const textElapsed = textStart - r.momCaughtTimer; // 0 -> 1.9 秒
          const enterAnim = Math.min(1, textElapsed / 0.28); // 0.28 秒弹性缩放浮现
          const scale = 0.92 + 0.08 * Math.sin(enterAnim * Math.PI * 0.5);
          const alpha = Math.min(1, textElapsed / 0.18);

          ctx.save();
          ctx.translate(640, 345);
          ctx.scale(scale, scale);
          ctx.shadowColor = '#ff3344';
          ctx.shadowBlur = 10;
          this.text(ctx, '惨遭老妈物理制裁，屁股开花……💥', 0, 0, 28, `rgba(255, 95, 95, ${alpha.toFixed(2)})`, 'center');

          ctx.shadowColor = '#000000';
          ctx.shadowBlur = 6;
          this.text(ctx, '——大半夜不睡觉，被老妈赏了一顿热气腾腾的竹笋炒肉😭——', 0, 42, 15, `rgba(245, 225, 190, ${(alpha * 0.9).toFixed(2)})`, 'center');
          ctx.restore();
        }
        ctx.restore();
      }
    }
  }
  private prop(ctx:CanvasRenderingContext2D,kind:string,x:number,y:number,size:number){
    const index=['cake','tv','bear','rabbit','dino'].indexOf(kind),image=globalResources.getImage('wish-props');
    if(image&&index>=0)ctx.drawImage(image,index*96,0,96,96,x-size/2,y-size/2,size,size);
    else this.text(ctx,kind==='cake'?'蛋糕':kind==='tv'?'电视':'玩具',x,y,10,'#edcaa0','center');
  }
  private drawLullabyActionButton(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, progress: number, clock: number, tapAnim: number) {
    if (progress <= 0.001) return;

    ctx.save();
    // 弹簧进场与按压反馈
    const popBounce = Math.sin(progress * Math.PI) * 0.07;
    const pressScale = 1.0 - tapAnim * 0.08;
    const scale = (1.0 + popBounce) * pressScale;

    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    // 1. 外部金色呼吸微光光环（Radial Halo）
    const pulse = 0.88 + 0.12 * Math.sin(clock * 3.6);
    const haloR = r * (1.32 * pulse);
    const halo = ctx.createRadialGradient(0, 0, r * 0.7, 0, 0, haloR);
    halo.addColorStop(0, `rgba(255, 215, 80, ${(0.36 * progress).toFixed(3)})`);
    halo.addColorStop(0.65, `rgba(255, 195, 50, ${(0.14 * progress).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(255, 190, 40, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, haloR, 0, Math.PI * 2);
    ctx.fill();

    // 2. 按钮主体底盘（暗金琥珀渐变磨砂质感）
    const bgGrad = ctx.createRadialGradient(0, -r * 0.2, r * 0.1, 0, 0, r);
    bgGrad.addColorStop(0, `rgba(48, 34, 12, ${(0.82 * progress).toFixed(3)})`);
    bgGrad.addColorStop(1, `rgba(22, 16, 6, ${(0.92 * progress).toFixed(3)})`);
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // 3. 亮金色发光双层外轮廓
    ctx.strokeStyle = `rgba(255, 222, 115, ${(0.95 * progress).toFixed(3)})`;
    ctx.lineWidth = 3.0;
    ctx.shadowColor = '#f5b530';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // 4. 绘制点击手势图标（手指与 5 道放射金光）
    ctx.save();
    ctx.translate(0, -18);
    const tipX = 0, tipY = -14;

    // 4.1 五道放射光芒
    ctx.shadowColor = '#ffe27a';
    ctx.shadowBlur = 6;
    ctx.strokeStyle = `rgba(255, 228, 136, ${(progress * 0.95).toFixed(3)})`;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    const rayAngles = [-150, -115, -80, -45, -10].map(d => d * Math.PI / 180);
    const rayPulse = 0.5 + 0.5 * Math.sin(clock * 5.5);
    for (let i = 0; i < rayAngles.length; i++) {
      const ang = rayAngles[i];
      const r1 = 14 + (i % 2 === 0 ? rayPulse * 2.5 : 0);
      const r2 = 22 + (i % 2 === 0 ? rayPulse * 2.5 : 0);
      ctx.beginPath();
      ctx.moveTo(tipX + Math.cos(ang) * r1, tipY + Math.sin(ang) * r1);
      ctx.lineTo(tipX + Math.cos(ang) * r2, tipY + Math.sin(ang) * r2);
      ctx.stroke();
    }

    // 4.2 卡通手势轮廓（食指微斜，线条饱满可爱）
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(0.24); // 向右微倾斜约 14 度
    ctx.beginPath();
    // 从食指根部左侧向上
    ctx.moveTo(-5.5, 9);
    ctx.lineTo(-5.5, -7);
    // 食指指尖圆弧
    ctx.arc(0, -7, 5.5, Math.PI, 0);
    // 食指右侧向下
    ctx.lineTo(5.5, 6);
    // 中指关节
    ctx.arc(10.5, 7.5, 4.5, -Math.PI * 0.85, 0.1);
    ctx.lineTo(15, 14);
    // 无名指关节
    ctx.arc(14, 15.5, 4.2, -Math.PI * 0.85, 0.1);
    ctx.lineTo(17.5, 21.5);
    // 小指关节
    ctx.arc(15, 22.5, 3.8, -Math.PI * 0.85, 0.3);
    // 掌缘收拢
    ctx.quadraticCurveTo(11, 34, -2, 32);
    // 手腕下沿
    ctx.lineTo(-10, 26);
    // 大拇指扣握外凸
    ctx.quadraticCurveTo(-15.5, 21, -13, 14.5);
    ctx.quadraticCurveTo(-11, 9, -5.5, 9);
    ctx.closePath();

    ctx.lineWidth = 2.8;
    ctx.strokeStyle = `rgba(255, 228, 136, ${(progress * 0.98).toFixed(3)})`;
    ctx.shadowColor = '#f5b530';
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    // 5. 文字排版：“轻拍” 与 “跟随光点点击”
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    // 主文字“轻拍”
    ctx.font = 'bold 21px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255, 247, 226, ${(progress * 0.98).toFixed(3)})`;
    ctx.fillText('轻拍', 0, 26);

    // 副文字“跟随光点点击”
    ctx.font = '12px sans-serif';
    ctx.fillStyle = `rgba(228, 208, 168, ${(progress * 0.88).toFixed(3)})`;
    ctx.fillText('跟随光点点击', 0, 48);

    ctx.restore();
  }
  private drawCollisionDebug(ctx: CanvasRenderingContext2D) {
    ctx.save(); ctx.lineWidth = 1;
    // Match door cutouts in movement and editor overlays.
    ctx.strokeStyle = '#ff3949'; ctx.fillStyle = 'rgba(255,35,45,.12)';
    ctx.save();
    for(const door of doorDefinitions){ctx.beginPath();ctx.rect(0,0,1580,996);ctx.rect(door.x-door.w/2,door.y-door.h/2,door.w,door.h);ctx.clip('evenodd');}
    for (const shape of collisionShapes) {
      ctx.strokeStyle = shape.kind === 'wall' ? '#ff3949' : '#d86868';
      ctx.beginPath(); shape.points.forEach((p,i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y)); ctx.closePath(); ctx.fill('evenodd'); ctx.stroke();
    }
    ctx.restore();
    for (const door of doorDefinitions) if (this.run.closed.has(door.id)) {
      ctx.strokeStyle = '#ff3949';
      ctx.strokeRect(door.x - door.w / 2, door.y - door.h / 2, door.w, door.h);
    }
    ctx.strokeStyle = '#fff0ce'; ctx.strokeRect(this.run.player.x - 10, this.run.player.y - 10, 20, 20);
    ctx.restore();
  }
  private drawBabySleeper(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, awake: boolean) {
    ctx.save();
    // 呼吸或抽泣高频起伏
    const sob = awake ? Math.sin(this.clock * 28) * 1.5 : Math.sin(this.clock * 2.2) * 0.8;
    ctx.translate(x - 10, y + sob);

    // 0. 大哭时的扩散声波震荡光环（Shockwaves）
    if (awake) {
      ctx.save();
      for (let w = 0; w < 3; w++) {
        const wp = (this.clock * 1.4 + w * 0.33) % 1;
        const r = 16 + wp * 58;
        const wAlpha = (1 - wp) * 0.65;
        ctx.strokeStyle = `rgba(255, 80, 60, ${wAlpha.toFixed(2)})`;
        ctx.lineWidth = 2.0 * (1 - wp * 0.5);
        ctx.beginPath();
        ctx.arc(-16, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 1. 小枕头（横向枕在左侧床垫上）
    ctx.fillStyle = '#f0ebe1';
    drawRoundRect(ctx, -28, -14, 24, 28, 6);
    ctx.fill();
    ctx.strokeStyle = '#d2c8b2';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 2. 完整的婴儿横躺头部（旋转 90 度横睡）
    ctx.save();
    ctx.translate(-16, 0);
    // 逆时针旋转 90 度，横躺侧卧，面朝床前，大哭时剧烈挣扎晃头
    ctx.rotate(-Math.PI / 2 + (awake ? Math.sin(this.clock * 26) * 0.14 : 0));
    const img = globalResources.getImage('characters');
    const f = characterFrames[awake ? 'baby-idle-0' : 'baby-idle-2'] || characterFrames['baby-idle-0'];
    const bw = 26, bh = 20;
    if (img && f) {
      ctx.drawImage(img, f.x, f.y, f.w, 70, -bw / 2, -bh / 2, bw, bh);
    } else {
      ctx.fillStyle = '#eedac3';
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    // 大哭表情：痛苦紧闭双眼 + 张开嚎啕深红大嘴与粉嫩小舌头
    if (awake) {
      // 嚎啕大哭张开的深红大嘴
      ctx.fillStyle = '#8a1818';
      ctx.beginPath();
      ctx.ellipse(0, 3.2, 4.6, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      // 哭腔粉红小舌头
      ctx.fillStyle = '#f89a9a';
      ctx.beginPath();
      ctx.ellipse(0, 4.8, 2.6, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      // 痛苦紧闭的哭眼线（两条弯曲向上的闭眼弧线）
      ctx.strokeStyle = '#5a3d28';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(-4.6, -2.6, 3.2, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(4.6, -2.6, 3.2, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
    ctx.restore();

    // 3. 婴儿小被子（从脖颈下方自然向右延展盖住身子）
    const quiltX = 0;
    const quiltY = -12;
    const quiltW = 46;
    const quiltH = 24;
    const quiltColor = awake ? '#d17979' : '#9fc3cc';
    const quiltBorder = awake ? '#a14d4d' : '#7ba2ab';

    ctx.save();
    if (awake) {
      // 大哭蹬被子微倾动效
      ctx.translate(quiltX, quiltY + quiltH / 2);
      ctx.rotate(Math.sin(this.clock * 18) * 0.06);
      ctx.translate(-quiltX, -(quiltY + quiltH / 2));
    }

    // 身体被窝底垫
    ctx.fillStyle = '#8ca8b8';
    drawRoundRect(ctx, quiltX - 2, quiltY + 2, quiltW, quiltH - 2, 8);
    ctx.fill();

    // 柔软小被子
    ctx.fillStyle = quiltColor;
    drawRoundRect(ctx, quiltX, quiltY, quiltW, quiltH, 8);
    ctx.fill();
    ctx.strokeStyle = quiltBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    // 被子领口白边
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    drawRoundRect(ctx, quiltX, quiltY, 5, quiltH, 2);
    ctx.fill();
    ctx.restore();

    // 4. 呼噜动画 vs 大哭泪花与嚎啕弹跳符号
    if (!awake) {
      for (let k = 0; k < 3; k++) {
        const progress = (this.clock * 0.75 + k * 0.33) % 1;
        const zX = -12 + progress * 8 + Math.sin(progress * Math.PI * 2) * 2;
        const zY = -16 - progress * 24;
        const zSize = Math.floor(9 + progress * 6);
        const alpha = progress < 0.2 ? (progress / 0.2) : progress > 0.65 ? (1 - progress) / 0.35 : 1;
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 3;
        const zChar = k === 2 ? 'Z' : 'z';
        this.text(ctx, zChar, zX, zY, zSize, `rgba(224, 226, 215, ${alpha.toFixed(2)})`);
        ctx.restore();
      }
    } else {
      // 双向喷射抛物线高光晶莹蓝泪滴
      for (let t = 0; t < 4; t++) {
        const progress = (this.clock * 2.5 + t * 0.25) % 1;
        // 左侧泪花抛物线向左上飞溅
        const t1X = -20 - progress * 16;
        const t1Y = -8 - Math.sin(progress * Math.PI) * 14 + progress * 8;
        // 右侧泪花抛物线向右上飞溅
        const t2X = -12 + progress * 14;
        const t2Y = -12 - Math.sin(progress * Math.PI) * 12 + progress * 9;
        const tAlpha = (1 - progress) * 0.95;
        ctx.fillStyle = `rgba(110, 205, 255, ${tAlpha.toFixed(2)})`;
        ctx.beginPath(); ctx.arc(t1X, t1Y, 2.2 * (1 - progress * 0.3), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(t2X, t2Y, 1.8 * (1 - progress * 0.3), 0, Math.PI * 2); ctx.fill();
      }
      // 头顶弹跳的「哇——！」血红大哭符号
      const cryScale = 1.0 + Math.sin(this.clock * 14) * 0.16;
      ctx.save();
      ctx.translate(-16, -26);
      ctx.scale(cryScale, cryScale);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;
      this.text(ctx, '哇——！', 0, 0, 13, '#ff5959', 'center');
      ctx.restore();
    }
    ctx.restore();
  }
  private sleeper(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, color: string, baby = false, awake = false) {
    if (baby) {
      this.drawBabySleeper(ctx, x, y, name, awake);
      return;
    }
    ctx.save(); ctx.translate(x, y + Math.sin(this.clock * 1.7) * .8);
    // 枕头受压下凹柔和投影（沉浸式贴合枕面）
    ctx.save();
    const pillowShadow = ctx.createRadialGradient(0, 1, 2, 0, 1, 20);
    pillowShadow.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
    pillowShadow.addColorStop(0.65, 'rgba(0, 0, 0, 0.18)');
    pillowShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = pillowShadow;
    ctx.beginPath();
    ctx.ellipse(0, 1, 20, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const w = baby ? 25 : 36, h = baby ? 29 : 63;
    const drawn = this.sprites.head(ctx, baby ? 'baby' : name === '爸爸' ? 'father' : name === '妈妈' ? 'mother' : 'girl', 0, 0, awake, baby);
    if (!drawn) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, -7, baby ? 9 : 12, 0, Math.PI * 2); ctx.fill();
    }
    if (!awake) {
      // 经典动漫呼吸飘浮 Zzz 连环动画
      for (let k = 0; k < 3; k++) {
        const progress = (this.clock * 0.75 + k * 0.33) % 1;
        const zX = w / 2 + 6 + progress * 10 + Math.sin(progress * Math.PI * 2) * 2;
        const zY = -6 - progress * 26;
        const zSize = Math.floor(9 + progress * 7);
        const alpha = progress < 0.2 ? (progress / 0.2) : progress > 0.65 ? (1 - progress) / 0.35 : 1;
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 3;
        const zChar = k === 2 ? 'Z' : 'z';
        this.text(ctx, zChar, zX, zY, zSize, `rgba(224, 226, 215, ${alpha.toFixed(2)})`);
        ctx.restore();
      }
    }
    ctx.restore();
  }
  private actor(ctx: CanvasRenderingContext2D, p: Point, color: string, alpha: number) { ctx.save(); ctx.globalAlpha = alpha; const shadow = ctx.createRadialGradient(p.x, p.y + 23, 1, p.x, p.y + 23, 15); shadow.addColorStop(0, 'rgba(0,0,0,.38)'); shadow.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = shadow; ctx.save(); ctx.translate(p.x, p.y + 23); ctx.scale(1, .4); ctx.translate(-p.x, -p.y - 23); ctx.beginPath(); ctx.arc(p.x, p.y + 23, 15, 0, Math.PI * 2); ctx.fill(); ctx.restore(); this.box(ctx, p.x - 11, p.y - 4, 22, 27, color); ctx.fillStyle = '#d8c3a3'; ctx.beginPath(); ctx.arc(p.x, p.y - 12, 11, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#2b2c2d'; ctx.beginPath(); ctx.arc(p.x, p.y - 16, 10, Math.PI, Math.PI * 2); ctx.fill(); ctx.restore(); }
  private point(p: TouchPoint): TouchPoint { const x = this.rotated ? p.y : p.x, y = this.rotated ? this.physicalWidth - p.x : p.y; return { x: (x - this.ox) / this.scale, y: (y - this.oy) / this.scale, identifier: p.identifier }; }
  private debugTouches: any[] = [];

  onTouchStart(raw: TouchPoint) {
    const p = this.point(raw);
    this.debugTouches.push({ rawX: raw.x, rawY: raw.y, pX: p.x, pY: p.y, time: Date.now() });
    console.log('[Touch] raw:', raw.x, raw.y, 'mapped:', p.x.toFixed(1), p.y.toFixed(1), 'buttons:', this.buttons.length);

    if (this.screen === 'play' && this.run.inspecting) { this.run.tapBreath(); return; }

    // 哄睡小游戏期间：点击屏幕上方小游戏区域直接击打节拍
    if (this.screen === 'play' && this.run.lullaby && this.lullabyOverlay.hitTest(p)) {
      this.run.interact();
      return;
    }

    if (this.screen === 'play' && this.run.phase !== 'result' && p.x >= 1045 && p.x <= 1238 && p.y >= 566 && p.y <= 627) { this.actionId = p.identifier; this.holding = true; this.holdTime = 0; this.heldAction = false; return; }
    const b = [...this.buttons].reverse().find(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h); if (b) { b.action(); return; }
    if (this.screen === 'play' && p.x < 280 && p.y > 465 && this.run.phase !== 'result' && !this.joystick) this.joystick = { id: p.identifier, origin: p, current: p };
  }
  onTouchMove(raw: TouchPoint) { const p = this.point(raw); if (this.joystick?.id === p.identifier) this.joystick.current = p; }
  onTouchEnd(raw: TouchPoint) { if (this.joystick?.id === raw.identifier) this.joystick = null; if (this.actionId === raw.identifier) this.releaseAction(); }
  onExit() { this.clearInput(); this.sounds.dispose(); if (typeof window !== 'undefined') { window.removeEventListener('keydown', this.keyDown); window.removeEventListener('keyup', this.keyUp); } globalEvents.off('input:reset', this.clearInput); globalEvents.off('app:hide', this.clearInput); globalEvents.off('app:show', this.onResume); }
}
