import { Scene } from './Scene';
import { TouchPoint } from './InputManager';

/**
 * 场景管理器
 * 调度游戏主场景状态机流转与渲染管道传递
 */
export class SceneManager {
  private scenes: Map<string, Scene> = new Map();
  private currentScene: Scene | null = null;
  private isTransitioning: boolean = false;

  /**
   * 注册场景
   */
  public register(scene: Scene): void {
    this.scenes.set(scene.name, scene);
  }

  /**
   * 切换场景
   * @param name 场景标识
   * @param params 传参
   */
  public switchScene(name: string, params?: any): boolean {
    const nextScene = this.scenes.get(name);
    if (!nextScene) {
      console.error(`[SceneManager] 未找到场景: "${name}"`);
      return false;
    }

    if (this.currentScene === nextScene) {
      return true;
    }

    this.isTransitioning = true;

    try {
      if (this.currentScene) {
        this.currentScene.onExit();
      }
      this.currentScene = nextScene;
      this.currentScene.onEnter(params);
      console.log(`[SceneManager] 场景已平滑切换至 -> "${name}"`);
    } catch (e) {
      console.error(`[SceneManager] 切换场景至 "${name}" 发生异常:`, e);
    } finally {
      this.isTransitioning = false;
    }

    return true;
  }

  /**
   * 驱动当前场景更新
   */
  public update(dt: number): void {
    if (this.currentScene && !this.isTransitioning) {
      this.currentScene.onUpdate(dt);
    }
  }

  /**
   * 驱动当前场景渲染
   */
  public render(ctx: CanvasRenderingContext2D): void {
    if (this.currentScene && !this.isTransitioning) {
      this.currentScene.onRender(ctx);
    }
  }

  /**
   * 分发触控事件给当前激活场景
   */
  public handleTouchStart(point: TouchPoint): void {
    this.currentScene?.onTouchStart?.(point);
  }

  public handleTouchMove(point: TouchPoint): void {
    this.currentScene?.onTouchMove?.(point);
  }

  public handleTouchEnd(point: TouchPoint): void {
    this.currentScene?.onTouchEnd?.(point);
  }

  public getCurrentScene(): Scene | null {
    return this.currentScene;
  }
}

export const globalSceneManager = new SceneManager();
