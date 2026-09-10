import { globalEvents } from '../core/EventBus';

export interface SystemInfoSummary {
  screenWidth: number;
  screenHeight: number;
  windowWidth: number;
  windowHeight: number;
  pixelRatio: number;
  statusBarHeight: number;
  safeAreaTop: number; safeAreaLeft: number; safeAreaRight: number;
  platform: string;
  brand: string;
  model: string;
}

/**
 * 微信小游戏生态桥接层
 * 统一收敛与抹平小游戏平台专属能力（分享、触感震动、生命周期与设备信息）
 */
export class WechatBridge {
  private static initialized: boolean = false;
  private static cachedSystemInfo: SystemInfoSummary | null = null;

  /**
   * 初始化微信专属监听与能力
   */
  public static init(): void {
    if (this.initialized) return;
    if (typeof wx === 'undefined') {
      this.initialized = true;
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => globalEvents.emit(document.hidden ? 'app:hide' : 'app:show'));
      if (typeof window !== 'undefined') { window.addEventListener('blur', () => globalEvents.emit('app:hide')); window.addEventListener('focus', () => globalEvents.emit('app:show')); }
      return;
    }

    this.initialized = true;

    // 1. 开启小游戏右上角菜单中的转发与朋友圈分享
    if (wx.showShareMenu) {
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline']
      } as any);
    }

    // 2. 被动分享监听
    if (wx.onShareAppMessage) {
      wx.onShareAppMessage(() => ({
        title: '一起来玩疯狂妈妈MaMa！',
        imageUrl: '' // 可配置默认分享图
      }));
    }

    // 3. 监听切前后台生命周期，派发到全局事件总线
    if (wx.onShow) {
      wx.onShow((res: any) => {
        console.log('[WechatBridge] 游戏进入前台', res);
        globalEvents.emit('app:show', res);
      });
    }

    if (wx.onHide) {
      wx.onHide(() => {
        console.log('[WechatBridge] 游戏进入后台');
        globalEvents.emit('app:hide');
      });
    }
  }

  /**
   * 触发设备短震动触觉反馈
   */
  public static vibrateShort(type: 'light' | 'medium' | 'heavy' = 'light'): void {
    // Vibration disabled by user preference, including legacy callers.
  }

  /**
   * 触发设备长震动反馈
   */
  public static vibrateLong(): void {
    // Vibration disabled by user preference, including legacy callers.
  }

  /**
   * 主动拉起分享面板
   */
  public static shareAppMessage(title: string, imageUrl?: string, query?: string): void {
    if (typeof wx !== 'undefined' && wx.shareAppMessage) {
      wx.shareAppMessage({
        title,
        imageUrl,
        query
      });
    }
  }

  /**
   * 获取系统与屏幕基础信息
   */
  public static invalidateSystemInfo() { this.cachedSystemInfo = null; }
  public static getSystemInfo(): SystemInfoSummary {
    if (this.cachedSystemInfo) {
      return this.cachedSystemInfo;
    }

    if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
      try {
        const info = wx.getSystemInfoSync();
        const statusBarHeight = info.statusBarHeight || 20;
        let safeAreaTop = statusBarHeight;

        if (wx.getMenuButtonBoundingClientRect) {
          try {
            const menu = wx.getMenuButtonBoundingClientRect();
            if (menu && menu.bottom) {
              safeAreaTop = Math.max(safeAreaTop, menu.bottom);
            }
          } catch (e) {
            // ignore
          }
        }

        this.cachedSystemInfo = {
          screenWidth: info.screenWidth,
          screenHeight: info.screenHeight,
          windowWidth: info.windowWidth,
          windowHeight: info.windowHeight,
          pixelRatio: info.pixelRatio || 1,
          statusBarHeight,
          safeAreaTop, safeAreaLeft: info.safeArea?.left || 0, safeAreaRight: Math.max(0, info.windowWidth - (info.safeArea?.right || info.windowWidth)),
          platform: info.platform || 'unknown',
          brand: info.brand || '',
          model: info.model || ''
        };
        return this.cachedSystemInfo;
      } catch (e) {
        console.error('[WechatBridge] 获取系统信息失败:', e);
      }
    }

    // Web 开发环境降级信息
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const w = typeof window !== 'undefined' ? window.innerWidth : 375;
    const h = typeof window !== 'undefined' ? window.innerHeight : 667;

    return {
      screenWidth: w,
      screenHeight: h,
      windowWidth: w,
      windowHeight: h,
      pixelRatio: dpr,
      statusBarHeight: 20,
      safeAreaTop: 44, safeAreaLeft: 0, safeAreaRight: 0,
      platform: 'devtools',
      brand: 'pc',
      model: 'browser'
    };
  }
}

