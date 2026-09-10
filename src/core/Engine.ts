import { globalSceneManager, SceneManager } from './SceneManager';
import { globalInput, InputManager } from './InputManager';
import { globalAudio } from './AudioManager';
import { globalEvents } from './EventBus';
import { WechatBridge } from '../platform/WechatBridge';

export interface EngineConfig {
  fpsLimit?: number;
  showStats?: boolean;
}

/**
 * 游戏核心驱动引擎
 * 职责：Canvas 画布初始化与高分屏适配、主循环管理(Tick/DeltaTime)、生命周期调度与状态统计
 */
export class Engine {
  private canvas: any;
  private ctx: CanvasRenderingContext2D;

  public logicalWidth: number = 0;
  public logicalHeight: number = 0;
  public dpr: number = 1;

  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private lastTime: number = 0;
  private animFrameId: number = 0;

  // 性能统计
  public fps: number = 60;
  private frameCount: number = 0;
  private fpsTimer: number = 0;
  private showStats: boolean = true;

  private now(): number {
    const nativePerformance: any = typeof wx !== 'undefined' && wx.getPerformance ? wx.getPerformance() : undefined;
    if (nativePerformance?.now) return nativePerformance.now();
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    return Date.now();
  }

  private requestFrame(callback: FrameRequestCallback): number {
    if (this.canvas?.requestAnimationFrame) return this.canvas.requestAnimationFrame(callback);
    if (typeof requestAnimationFrame !== 'undefined') return requestAnimationFrame(callback);
    return setTimeout(() => callback(this.now()), 16) as unknown as number;
  }

  constructor(config?: EngineConfig) {
    if (config?.showStats !== undefined) {
      this.showStats = config.showStats;
    }

    // 1. 初始化平台桥接
    WechatBridge.init();

    // 2. 初始化画布与上下文
    const { canvas, ctx } = this.initCanvas();
    this.canvas = canvas;
    this.ctx = ctx;

    // 3. 绑定触控事件至场景
    this.bindInput();
    globalInput.bindCanvas(this.canvas);

    // 4. 监听前后台生命周期
    this.bindLifecycle();
    const resize = () => {
      WechatBridge.invalidateSystemInfo();
      const sys = WechatBridge.getSystemInfo();
      if (this.logicalWidth === sys.windowWidth && this.logicalHeight === sys.windowHeight) return;
      this.logicalWidth = sys.windowWidth; 
      this.logicalHeight = sys.windowHeight; 
      this.dpr = Math.min(3, sys.pixelRatio || 1);
      
      // 与 initCanvas 保持统一，不再进行二次 scale(dpr)
      this.canvas.width = Math.round(this.logicalWidth * this.dpr);
      this.canvas.height = Math.round(this.logicalHeight * this.dpr);
      
      globalEvents.emit('input:reset');
    };
    if (typeof window !== 'undefined') window.addEventListener('resize', resize);
    if (typeof wx !== 'undefined' && wx.onWindowResize) wx.onWindowResize(resize);
  }

  /**
   * 初始化主画布，并应用高清视网膜屏(Retina/DPR)坐标映射
   */
  private initCanvas(): { canvas: any; ctx: CanvasRenderingContext2D } {
    let canvas: any;
    if (typeof wx !== 'undefined' && wx.createCanvas) {
      canvas = wx.createCanvas();
    } else if (typeof window !== 'undefined' && (window as any).canvas) {
      canvas = (window as any).canvas;
    } else {
      canvas = document.createElement('canvas');
      document.body.appendChild(canvas);
    }

    const sys = WechatBridge.getSystemInfo();
    this.logicalWidth = sys.windowWidth;
    this.logicalHeight = sys.windowHeight;
    this.dpr = Math.min(3, sys.pixelRatio || 1);

    // 微信小游戏主画布：全屏绘制以逻辑宽高为基础，避免双重缩放导致画面被放大数倍
    canvas.width = Math.round(this.logicalWidth * this.dpr);
    canvas.height = Math.round(this.logicalHeight * this.dpr);
    if (canvas.style) { canvas.style.width = `${this.logicalWidth}px`; canvas.style.height = `${this.logicalHeight}px`; }

    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    // 微信环境中底层已做适配，无需二次 scale(dpr)
    
    // 触控映射：微信返回 client 坐标，逻辑比保持 1:1
    globalInput.setScale(1, 1);

    console.log(`[Engine] 画布初始化完成: 逻辑分辨率=${this.logicalWidth}x${this.logicalHeight}, DPR=${this.dpr}`);
    return { canvas, ctx };
  }

  private bindInput(): void {
    globalInput.onTouchStart((p) => globalSceneManager.handleTouchStart(p));
    globalInput.onTouchMove((p) => globalSceneManager.handleTouchMove(p));
    globalInput.onTouchEnd((p) => globalSceneManager.handleTouchEnd(p));
  }

  private bindLifecycle(): void {
    globalEvents.on('app:hide', () => {
      this.pause();
      globalAudio.pauseBgm();
    });

    globalEvents.on('app:show', () => {
      this.resume();
      globalAudio.resumeBgm();
    });
  }

  /**
   * 启动游戏主循环
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    this.lastTime = NaN;
    this.loop = this.loop.bind(this);
    this.animFrameId = this.requestFrame(this.loop);
    console.log('[Engine] 游戏主循环已启动');
  }

  /**
   * 暂停游戏
   */
  public pause(): void {
    this.isPaused = true;
  }

  /**
   * 恢复游戏
   */
  public resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.lastTime = NaN; // First resumed frame establishes the RAF clock origin.
  }

  /**
   * 每一帧的主调度循环
   */
  private loop(currentTime: number): void {
    if (!this.isRunning) return;

    this.animFrameId = this.requestFrame(this.loop);

    if (this.isPaused) {
      return;
    }

    // 计算帧时间步长（秒）
    // RAF timestamps and wx performance may use different origins/units.
    // Establish both endpoints from the same frame clock; never mix them.
    const frameTime = Number.isFinite(currentTime) ? currentTime : Date.now();
    const elapsed = Number.isFinite(this.lastTime) ? Math.max(0, (frameTime - this.lastTime) / 1000) : 0;
    this.lastTime = frameTime;

    // 限制最大 dt 防止切前台或微卡顿时物理穿越
    const dt = Math.min(elapsed, 0.1);

    // 计算实时 FPS
    this.calcFps(elapsed);

    // 1. 逻辑更新
    globalSceneManager.update(dt);

    // 2. 清屏与画面渲染
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    globalSceneManager.render(this.ctx);

    // 3. 绘制统计面板（可选）
    if (this.showStats) {
      this.renderStats(this.ctx);
    }
  }

  private calcFps(elapsed: number): void {
    this.frameCount++;
    this.fpsTimer += elapsed;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.frameCount / this.fpsTimer);
      this.frameCount = 0;
      this.fpsTimer = 0;
    }
  }

  /**
   * 绘制轻量级实时性能与环境诊断面板
   */
  private renderStats(ctx: CanvasRenderingContext2D): void {
    const sys = WechatBridge.getSystemInfo();
    const topY = Math.max(sys.statusBarHeight, 10);

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(10, topY, 115, 34);

    ctx.fillStyle = this.fps >= 50 ? '#00e676' : this.fps >= 30 ? '#ffb300' : '#ff5252';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`FPS: ${this.fps}`, 16, topY + 14);

    ctx.fillStyle = '#b0bec5';
    ctx.font = '10px monospace';
    ctx.fillText(`${this.logicalWidth}x${this.logicalHeight} (DPR:${this.dpr.toFixed(1)})`, 16, topY + 26);
    ctx.restore();
  }

  public getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  public getCanvas(): any {
    return this.canvas;
  }
}


