import { Engine } from './core/Engine';
import { globalSceneManager } from './core/SceneManager';
import { BootScene } from './scenes/BootScene';
import { MainGameScene } from './scenes/MainGameScene';

/**
 * 微信小游戏总入口
 */
function bootstrap() {
  console.log('[App] 初始化 fourAsleep 游戏引擎...');

  // 1. 创建游戏引擎实例（启用顶部轻量诊断栏）
  const engine = new Engine({
    showStats: false
  });

  // 2. 注册场景
  globalSceneManager.register(new BootScene());
  globalSceneManager.register(new MainGameScene());

  // 3. 初始进入启动引导场景
  globalSceneManager.switchScene('BootScene');

  // 4. 驱动主循环
  engine.start();
}

// 启动执行。真机初始化异常需要显式显示，否则微信调试页只会一直转圈。
try {
  bootstrap();
} catch (error) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error('[App] 启动失败', error);
  if (typeof wx !== 'undefined' && wx.showModal) {
    wx.showModal({ title: '游戏启动失败', content: message.slice(0, 500), showCancel: false });
  }
}

