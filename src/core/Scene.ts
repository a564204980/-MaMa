import { TouchPoint } from './InputManager';

/**
 * 场景抽象基类
 * 定义游戏场景标准生命周期与渲染交互接口
 */
export abstract class Scene {
  public name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * 进入场景生命周期钩子
   * @param params 跨场景传递的参数数据
   */
  public abstract onEnter(params?: any): void;

  /**
   * 帧逻辑更新钩子
   * @param dt 距离上一帧的时间差（秒）
   */
  public abstract onUpdate(dt: number): void;

  /**
   * 帧画面渲染钩子
   * @param ctx 2D 画布绘图上下文
   */
  public abstract onRender(ctx: CanvasRenderingContext2D): void;

  /**
   * 退出场景生命周期钩子
   */
  public abstract onExit(): void;

  /**
   * 触控事件可选钩子
   */
  public onTouchStart?(point: TouchPoint): void;
  public onTouchMove?(point: TouchPoint): void;
  public onTouchEnd?(point: TouchPoint): void;
}
