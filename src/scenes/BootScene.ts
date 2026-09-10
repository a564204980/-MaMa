import { Scene } from '../core/Scene';
import { globalSceneManager } from '../core/SceneManager';
export class BootScene extends Scene {
  constructor() { super('BootScene'); }
  onEnter() {}
  onUpdate() { globalSceneManager.switchScene('MainGameScene'); }
  onRender() {}
  onExit() {}
}
