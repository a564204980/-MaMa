import { Run } from '../gameplay/Run';
import { StorageManager } from '../core/StorageManager';
import { WechatBridge } from '../platform/WechatBridge';
import { globalResources } from '../core/ResourceManager';

export interface Button {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  action: () => void;
  primary?: boolean;
}

export interface ProgressData {
  unlocked: number;
  best: number;
  runs: number;
}

export interface SettingsData {
  hints?: boolean;
  sound?: boolean;
  cueVolume?: number;
  ambientVolume?: number;
}

export interface UIHelper {
  text: (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size?: number, color?: string, align?: CanvasTextAlign) => void;
  box: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, stroke?: string) => void;
  button: (ctx: CanvasRenderingContext2D, b: Button) => void;
  wrap: (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, size?: number, color?: string) => void;
  panel: (ctx: CanvasRenderingContext2D, title: string, sub: string) => void;
}

export class GameViews {
  static drawLandscapeHome(
    ctx: CanvasRenderingContext2D,
    ui: UIHelper,
    selected: number,
    progress: ProgressData,
    actions: {
      start: (daily?: boolean) => void;
      switchNight: () => void;
      openSettings: () => void;
    }
  ): void {
    ui.text(ctx, 'AFTER THEY FALL ASLEEP', 65, 95, 21, '#c2b08f');
    ui.text(ctx, '妈妈', 60, 180, 78);
    ui.text(ctx, '睡着以后', 60, 265, 78);
    ui.text(ctx, '轻一点，别让妈妈发现你还没睡。', 65, 322, 20, '#d5cbb9');
    ui.text(ctx, '第 ' + selected + ' 夜  /  ' + ['门后的呼吸', '有人下床了', '妈妈来查床', '昨天的你'][selected - 1], 65, 407, 19, '#c2ac84');
    ui.button(ctx, { x: 65, y: 441, w: 380, h: 68, label: '进入这个夜晚   →', primary: true, action: () => actions.start() });
    ui.button(ctx, { x: 65, y: 527, w: 182, h: 54, label: '切换夜晚', action: actions.switchNight });
    ui.button(ctx, { x: 263, y: 527, w: 182, h: 54, label: '每日同种子', action: () => actions.start(true) });
    ui.button(ctx, { x: 65, y: 599, w: 182, h: 50, label: '设置', action: actions.openSettings });
    ui.text(ctx, '最高记录 ' + progress.best + '  ·  已解锁 ' + progress.unlocked + '/4 夜', 270, 630, 15, '#a1a79c');
    ui.text(ctx, '妈妈醒了，快躲好！', 1190, 665, 16, '#abb2a9', 'right');
  }

  static drawPortraitHome(
    ctx: CanvasRenderingContext2D,
    ui: UIHelper,
    selected: number,
    progress: ProgressData,
    actions: {
      start: (daily?: boolean) => void;
      switchNight: () => void;
      openSettings: () => void;
    }
  ): void {
    const img = globalResources.getImage('title');
    if (img) {
      const cropW = (img.height * 390) / 844;
      ctx.drawImage(img, img.width - cropW, 0, cropW, img.height, 0, 0, 390, 844);
    }
    const g = ctx.createLinearGradient(0, 0, 0, 844);
    g.addColorStop(0, 'rgba(16,5,5,.75)');
    g.addColorStop(0.43, 'rgba(16,5,5,.35)');
    g.addColorStop(0.65, 'rgba(16,5,5,.9)');
    g.addColorStop(1, '#0f0909');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 390, 844);

    ui.text(ctx, 'AFTER THEY FALL ASLEEP', 32, 117, 17, '#c2b08f');
    ui.text(ctx, '妈妈', 28, 181, 61);
    ui.text(ctx, '睡着以后', 28, 244, 61);
    ui.text(ctx, '你醒了。', 33, 318, 17);
    ui.text(ctx, '别让妈妈发现你还没睡。', 33, 347, 17, '#c4bcad');
    ui.text(ctx, '第 ' + selected + ' 夜  /  ' + ['门后的呼吸', '有人下床了', '妈妈来查床', '昨天的你'][selected - 1], 32, 503, 16, '#c2ac84');

    ui.button(ctx, { x: 32, y: 537, w: 326, h: 58, label: '进入这个夜晚   →', primary: true, action: () => actions.start() });
    ui.text(ctx, '进入后请横握手机', 195, 617, 13, '#96a09a', 'center');
    ui.button(ctx, { x: 32, y: 645, w: 157, h: 48, label: '切换夜晚', action: actions.switchNight });
    ui.button(ctx, { x: 201, y: 645, w: 157, h: 48, label: '每日同种子', action: () => actions.start(true) });
    ui.button(ctx, { x: 32, y: 707, w: 326, h: 46, label: '设置', action: actions.openSettings });
    ui.text(ctx, '最高记录 ' + progress.best + '  ·  已解锁 ' + progress.unlocked + '/4 夜', 195, 786, 13, '#929b94', 'center');
    ui.text(ctx, '妈妈醒了，快躲好！', 195, 814, 12, '#6b7b7c', 'center');
  }

  static drawPortraitSettings(
    ctx: CanvasRenderingContext2D,
    ui: UIHelper,
    settings: SettingsData,
    onBack: () => void
  ): void {
    ui.box(ctx, 16, 87, 358, 686, '#172126', '#46514e');
    ui.text(ctx, '让夜晚适合你', 38, 135, 26);
    const toggles: Array<'hints'> = ['hints'];
    toggles.forEach((key, i) => {
      ui.button(ctx, {
        x: 36,
        y: 195 + i * 68,
        w: 318,
        h: 52,
        label: '新手提示' + '  ' + (settings[key] ? '开启' : '关闭'),
        action: () => {
          settings[key] = !settings[key];
          StorageManager.set('settings_v1', settings);
        }
      });
    });
    const volumes: Array<'cueVolume' | 'ambientVolume'> = ['cueVolume', 'ambientVolume'];
    volumes.forEach((key, i) => {
      ui.button(ctx, {
        x: 36,
        y: 331 + i * 68,
        w: 318,
        h: 52,
        label: (i === 0 ? '关键提示音量' : '环境音量') + '  ' + Math.round((settings[key] ?? 0.5) * 100) + '%',
        action: () => {
          settings[key] = (settings[key] ?? 0.5) >= 0.9 ? 0 : Math.min(1, (settings[key] ?? 0.5) + 0.25);
          StorageManager.set('settings_v1', settings);
        }
      });
    });
    ui.wrap(ctx, '首页竖屏操作。进入夜晚后横握手机，左手移动，右手交互。', 38, 505, 18, 16);
    ui.button(ctx, { x: 36, y: 675, w: 318, h: 54, label: '返回首页', primary: true, action: onBack });
  }

  static drawSettingsPanel(
    ctx: CanvasRenderingContext2D,
    ui: UIHelper,
    settings: SettingsData,
    onHome: () => void,
    onResume: () => void
  ): void {
    ui.panel(ctx, '让夜晚适合你', '探索时暂停；追逐过程保持连续。');
    const options: Array<{ key: 'hints'; label: string }> = [{ key: 'hints', label: '新手提示' }];
    options.forEach((o, i) =>
      ui.button(ctx, {
        x: 290,
        y: 232 + i * 54,
        w: 690,
        h: 46,
        label: `${o.label}    ${settings[o.key] ? '开启' : '关闭'}`,
        action: () => {
          settings[o.key] = !settings[o.key];
          StorageManager.set('settings_v1', settings);
        }
      })
    );
    for (const [i, key] of (['cueVolume', 'ambientVolume'] as const).entries())
      ui.button(ctx, {
        x: 290,
        y: 340 + i * 54,
        w: 690,
        h: 46,
        label: `${i === 0 ? '关键提示音量' : '环境音量'}    ${Math.round((settings[key] ?? 0.5) * 100)}%`,
        action: () => {
          settings[key] = (settings[key] ?? 0.5) >= 0.9 ? 0 : Math.min(1, (settings[key] ?? 0.5) + 0.25);
          StorageManager.set('settings_v1', settings);
        }
      });
    ui.wrap(ctx, 'WASD 移动，Shift 慢走，E 开始互动或放下玩具。移动中断吃和看；长按轻开门、安抚或屏息。触屏使用摇杆与交互键。', 290, 468, 40, 13);
    ui.button(ctx, { x: 290, y: 554, w: 180, h: 45, label: '回到标题', action: onHome });
    ui.button(ctx, { x: 800, y: 554, w: 185, h: 45, label: '继续', primary: true, action: onResume });
  }

  static drawResult(
    ctx: CanvasRenderingContext2D,
    ui: UIHelper,
    run: Run,
    daily: boolean,
    actions: {
      onHome: () => void;
      onRestart: () => void;
    }
  ): void {
    ui.panel(
      ctx,
      run.escaped ? '心满意足，晚安。' : (run.outcome.includes('妈妈') || run.outcome.includes('竹笋炒肉') ? '惨遭老妈物理制裁！😭' : '今晚先到这里。'),
      `${run.outcome}  ·  ${Math.floor(run.elapsed)} 秒  ·  ${daily ? '每日同种子' : `第 ${run.night} 夜`}`
    );
    ui.text(ctx, `${run.score}`, 330, 300, 76, '#cfbb91');
    const grade = run.score >= 900 ? 'S' : run.score >= 750 ? 'A' : run.score >= 600 ? 'B' : run.score >= 400 ? 'C' : 'D';
    ui.text(ctx, `${grade}  /  1000`, 350, 363, 20, '#899f9f');
    const labels = ['小心愿与玩具', '躲过妈妈', '噪声控制', '时间效率', '安睡结果'];
    run.breakdown.forEach((v, i) => {
      ui.text(ctx, labels[i], 580, 240 + i * 37, 16, '#9daba6');
      ui.text(ctx, String(v), 950, 240 + i * 37, 19, '#ded5be', 'right');
    });
    ui.wrap(
      ctx,
      `完成 ${run.completed}/3 个小心愿，收好 ${run.delivered} 个玩具，被发现 ${run.caughtByFamily} 次。${run.escaped && run.night < 4 ? '下一夜已解锁。' : '进度中断不丢，危险时先躲好。'}`,
      290,
      480,
      39,
      15
    );
    ui.button(ctx, { x: 290, y: 554, w: 180, h: 45, label: '回到标题', action: actions.onHome });
    ui.button(ctx, {
      x: 505,
      y: 554,
      w: 200,
      h: 45,
      label: '分享这一夜',
      action: () =>
        WechatBridge.shareAppMessage(
          `疯狂妈妈MaMa：偷偷完成 ${run.completed} 个小心愿，得到 ${run.score} 分！`,
          undefined,
          `seed=${encodeURIComponent(run.seed)}`
        )
    });
    ui.button(ctx, { x: 800, y: 554, w: 185, h: 45, label: '再来一夜 →', primary: true, action: actions.onRestart });
  }
}
