import { StorageManager } from './StorageManager';

/**
 * 音频管理器
 * 统一管理背景音乐(BGM)与音效(SFX)，支持音量控制、静音设置及音效并发池
 */
export class AudioManager {
  private bgmContext: WechatMinigame.InnerAudioContext | null = null;
  private sfxPool: Map<string, WechatMinigame.InnerAudioContext[]> = new Map();
  private maxPoolSize: number = 5;

  private isBgmMuted: boolean = false;
  private isSfxMuted: boolean = false;
  private currentBgmUrl: string = '';

  constructor() {
    this.isBgmMuted = StorageManager.get('bgm_muted', false);
    this.isSfxMuted = StorageManager.get('sfx_muted', false);
  }

  /**
   * 播放或切换背景音乐
   * @param url 音频文件路径
   * @param loop 是否循环，默认为 true
   */
  public playBgm(url: string, loop: boolean = true): void {
    this.currentBgmUrl = url;
    if (typeof wx === 'undefined' || !wx.createInnerAudioContext) {
      return;
    }

    if (!this.bgmContext) {
      this.bgmContext = wx.createInnerAudioContext();
      this.bgmContext.loop = loop;
    }

    this.bgmContext.src = url;
    this.bgmContext.loop = loop;
    this.bgmContext.volume = this.isBgmMuted ? 0 : 1;

    if (!this.isBgmMuted) {
      this.bgmContext.play();
    }
  }

  /**
   * 暂停背景音乐
   */
  public pauseBgm(): void {
    if (this.bgmContext) {
      this.bgmContext.pause();
    }
  }

  /**
   * 恢复背景音乐
   */
  public resumeBgm(): void {
    if (this.bgmContext && !this.isBgmMuted) {
      this.bgmContext.play();
    }
  }

  /**
   * 停止背景音乐
   */
  public stopBgm(): void {
    if (this.bgmContext) {
      this.bgmContext.stop();
    }
  }

  /**
   * 播放短音效（从对象池获取空闲或新建 context，避免快速连续点击被截断）
   * @param url 音频路径
   */
  public playSfx(url: string): void {
    if (this.isSfxMuted || typeof wx === 'undefined' || !wx.createInnerAudioContext) {
      return;
    }

    if (!this.sfxPool.has(url)) {
      this.sfxPool.set(url, []);
    }

    const pool = this.sfxPool.get(url)!;
    // 寻找闲置上下文
    let ctx = pool.find((item) => (item as any).paused || (item as any).ended);

    if (!ctx) {
      if (pool.length < this.maxPoolSize) {
        ctx = wx.createInnerAudioContext();
        ctx.src = url;
        pool.push(ctx);
      } else {
        // 池满则复用第一个
        ctx = pool[0];
      }
    }

    ctx.stop();
    ctx.play();
  }

  /**
   * 切换 BGM 静音状态
   */
  public toggleBgm(): boolean {
    this.isBgmMuted = !this.isBgmMuted;
    StorageManager.set('bgm_muted', this.isBgmMuted);

    if (this.bgmContext) {
      if (this.isBgmMuted) {
        this.bgmContext.pause();
      } else {
        this.bgmContext.play();
      }
    }
    return this.isBgmMuted;
  }

  /**
   * 切换音效静音状态
   */
  public toggleSfx(): boolean {
    this.isSfxMuted = !this.isSfxMuted;
    StorageManager.set('sfx_muted', this.isSfxMuted);
    return this.isSfxMuted;
  }

  public get bgmMuted(): boolean {
    return this.isBgmMuted;
  }

  public get sfxMuted(): boolean {
    return this.isSfxMuted;
  }
}

export const globalAudio = new AudioManager();
