/**
 * 微信小游戏专属全局 API 与对象类型扩展定义
 */
declare namespace WechatMinigame {
  interface InnerAudioContext {
    src: string;
    startTime: number;
    autoplay: boolean;
    loop: boolean;
    obeyMuteSwitch: boolean;
    volume: number;
    playbackRate: number;
    duration: number;
    currentTime: number;
    paused: boolean;
    buffered: number;
    play(): void;
    pause(): void;
    stop(): void;
    seek(position: number): void;
    destroy(): void;
    onCanplay(callback: () => void): void;
    onPlay(callback: () => void): void;
    onPause(callback: () => void): void;
    onStop(callback: () => void): void;
    onEnded(callback: () => void): void;
    onError(callback: (res: { errMsg: string; errCode: number }) => void): void;
  }

  interface Touch {
    identifier: number;
    x?: number;
    clientX?: number;
    y?: number;
    clientY?: number;
    pageX?: number;
    pageY?: number;
  }

  interface TouchEvent {
    touches: Touch[];
    changedTouches: Touch[];
    timeStamp: number;
  }
}

declare namespace WechatMiniprogram {
  interface Wx {
    createCanvas(): any;
    createImage(): any;
    onTouchStart(callback: (res: WechatMinigame.TouchEvent) => void): void;
    onTouchMove(callback: (res: WechatMinigame.TouchEvent) => void): void;
    onTouchEnd(callback: (res: WechatMinigame.TouchEvent) => void): void;
    onTouchCancel(callback: (res: WechatMinigame.TouchEvent) => void): void;
    onShow(callback: (res: any) => void): void;
    onHide(callback: () => void): void;
    onShareAppMessage(callback: () => { title?: string; imageUrl?: string; query?: string }): void;
    shareAppMessage(options: { title: string; imageUrl?: string; query?: string }): void;
    createInnerAudioContext(): WechatMinigame.InnerAudioContext;
    getMenuButtonBoundingClientRect?(): {
      width: number;
      height: number;
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
  }
}

