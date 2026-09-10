export type EventHandler = (...args: any[]) => void;

/**
 * 轻量级发布订阅事件总线
 */
export class EventBus {
  private events: Map<string, EventHandler[]> = new Map();

  /**
   * 注册事件监听
   */
  public on(event: string, handler: EventHandler): void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(handler);
  }

  /**
   * 注册一次性事件监听
   */
  public once(event: string, handler: EventHandler): void {
    const wrapper: EventHandler = (...args: any[]) => {
      this.off(event, wrapper);
      handler(...args);
    };
    this.on(event, wrapper);
  }

  /**
   * 注销事件监听
   */
  public off(event: string, handler: EventHandler): void {
    const handlers = this.events.get(event);
    if (!handlers) return;

    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }

    if (handlers.length === 0) {
      this.events.delete(event);
    }
  }

  /**
   * 触发事件广播
   */
  public emit(event: string, ...args: any[]): void {
    const handlers = this.events.get(event);
    if (!handlers) return;

    // 浅拷贝执行，防止回调中动态增删监听器导致遍历异常
    const copy = [...handlers];
    for (const fn of copy) {
      fn(...args);
    }
  }

  /**
   * 清理所有事件
   */
  public clear(): void {
    this.events.clear();
  }
}

// 导出全局单例，同时允许实例化私有总线
export const globalEvents = new EventBus();
