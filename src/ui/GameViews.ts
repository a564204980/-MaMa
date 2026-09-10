import { drawRoundRect, drawCrescentMoon } from '../utils/draw';
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
  registerButton?: (b: Button) => void;
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
      onRevive?: () => void;
    }
  ): void {
        const win = run.escaped;
        const text = (value: string, x: number, y: number, size = 18, color = '#e9dfca', align: CanvasTextAlign = 'left') => ui.text(ctx, value, x, y, size, color, align);

        ctx.save();
        // 居中等比缩小至 0.88，使四周留白更加从容自然
        const scale = 0.88;
        ctx.translate(640, 360);
        ctx.scale(scale, scale);
        ctx.translate(-640, -360);

        // 居中悬浮卡片 (95, 40, 1090, 640) - 高级暮夜幻紫渐变
        const cardX = 95, cardY = 40, cardW = 1090, cardH = 640, cardR = 28;
        const night = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
        night.addColorStop(0, '#312046');
        night.addColorStop(0.48, '#201532');
        night.addColorStop(1, '#130c1f');

        drawRoundRect(ctx, cardX, cardY, cardW, cardH, cardR);
        ctx.fillStyle = night;
        ctx.fill();
        ctx.strokeStyle = 'rgba(245, 217, 158, 0.42)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.save();
        drawRoundRect(ctx, cardX, cardY, cardW, cardH, cardR);
        ctx.clip();
        const halo = ctx.createRadialGradient(357, 357, 20, 357, 357, 320);
        halo.addColorStop(0, 'rgba(228, 198, 142, .24)');
        halo.addColorStop(1, 'rgba(228, 198, 142, 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(cardX, cardY, 635, cardH);

        drawCrescentMoon(ctx, 191, 136, 38, '#dccaa5', false, false);
        for (const [x, y, r] of [[486, 127, 3], [530, 231, 2], [171, 292, 2], [469, 546, 3], [263, 191, 2]]) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = '#ac9a76';
          ctx.fill();
        }
        ctx.restore();
        const girl = globalResources.getImage(win ? 'girl-front' : 'girl-stun-front') || globalResources.getImage('girl-front');
        if (girl) ctx.drawImage(girl, 105, 141, 510, 510);
        text(win ? '把快乐带进梦里。' : '嘘……下次小声一点。', 357, 610, 23, '#c5b89f', 'center');
        text((daily ? '每日同种子' : '第 ' + run.night + ' 夜') + '  /  夜间战绩', 650, 115, 18, '#a4b0bb');
        text(win ? '今晚，偷偷赢了。' : run.outcome.includes('天快亮') ? '天亮了，还没玩够。' : '糟糕，被发现了！', 646, 183, 43, '#f5dfb9');
        text(win ? '小心愿完成，安心睡个好觉。' : '没关系，下一夜再偷偷来。', 650, 219, 19, '#a5b0bb');
        text(String(run.score), 643, 320, 88, '#ffe0a1');
        const grade = run.score >= 900 ? 'S' : run.score >= 750 ? 'A' : run.score >= 600 ? 'B' : run.score >= 400 ? 'C' : 'D';
        text('分', 826, 316, 21, '#c2ad86'); text(grade + ' 级', 1030, 292, 35, '#bda77e');
        text('完成 ' + run.completed + ' / 3 个小心愿', 650, 365, 20, '#d4c5ac');
        const props = globalResources.getImage('wish-props');
        const wishes = [{ label: '偷吃蛋糕', value: run.cakeProgress, icon: 0 }, { label: '偷看电视', value: run.tvProgress, icon: 1 }, { label: '抱玩具回房', value: run.delivered > 0 ? 1 : 0, icon: 2 }];
        wishes.forEach((wish, i) => {
          const x = 699 + i * 166, done = wish.value >= 1;
          if (props) ctx.drawImage(props, wish.icon * 96, 0, 96, 96, x - 36, 384, 72, 72);
          text(wish.label, x, 483, 18, '#e4ddd0', 'center');
          text(done ? '已完成' : wish.value > 0 ? Math.round(wish.value * 100) + '%' : '未完成', x, 507, 15, done ? '#b9d4a7' : '#8493a3', 'center');
        });
        const seconds = Math.floor(run.elapsed), time = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
        text('用时 ' + time + '   ·   被发现 ' + run.caughtByFamily + ' 次', 650, 548, 17, '#9ba8b6');
        const button = (b: Button, style: 'gold' | 'green' | 'link' = 'link') => {
          const sx = 640 + (b.x - 640) * scale;
          const sy = 360 + (b.y - 360) * scale;
          const sw = b.w * scale;
          const sh = b.h * scale;
          if (ui.registerButton) ui.registerButton({ ...b, x: sx, y: sy, w: sw, h: sh }); else ui.button(ctx, b);

          if (style === 'gold' || style === 'green') {
            const fill = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
            if (style === 'gold') {
              fill.addColorStop(0, '#fae3ad');
              fill.addColorStop(1, '#d4a858');
            } else {
              fill.addColorStop(0, '#10c469');
              fill.addColorStop(1, '#079d4f');
            }
            drawRoundRect(ctx, b.x, b.y, b.w, b.h, 20);
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.save();
            const fontSize = b.label.length >= 7 ? 20 : 22;
            ctx.font = `bold ${fontSize}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = style === 'gold' ? '#362410' : '#ffffff';
            ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
            ctx.restore();
          } else {
            ctx.save();
            ctx.font = '500 18px "PingFang SC", "Microsoft YaHei", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#cfc0e8';
            ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
            ctx.restore();
          }
        };

        const canRevive = run.canRevive;
        const shareLabel = canRevive
          ? '分享复活本局+1'
          : (win ? '🌟 炫耀战绩' : '🌟 分享给好友');

        const onShare = () => {
          const title = canRevive
            ? '我在《疯狂妈妈MaMa》被发现了！快帮我复活，就差一点点了！'
            : (win
                ? '《疯狂妈妈MaMa》通关获得 ' + run.score + ' 分！你能撑过今夜吗？'
                : '我在《疯狂妈妈MaMa》拿到了 ' + run.score + ' 分，快来挑战！');
          const shareImg = GameViews.generateShareCard(run);
          WechatBridge.shareAppMessage(title, shareImg, 'seed=' + encodeURIComponent(run.seed));
          if (canRevive && actions.onRevive) {
            actions.onRevive();
          }
        };

        button({ x: 650, y: 574, w: 214, h: 66, label: shareLabel, action: onShare }, 'green');
        button({ x: 878, y: 574, w: 214, h: 66, label: '再来一夜  →', action: actions.onRestart }, 'gold');
        button({ x: 284, y: 624, w: 146, h: 42, label: '返回首页', action: actions.onHome }, 'link');
        ctx.restore();
    }

  /**
   * 动态生成 5:4 黄金比例专属战绩分享卡片，彻底根除横屏默认截屏导致的左侧大黑边与右侧截断
   */
  static generateShareCard(run: Run): string | undefined {
    if (typeof wx === 'undefined' || !(wx as any).createCanvas) return undefined;
    try {
      const canvas: any = (wx as any).createCanvas();
      canvas.width = 500;
      canvas.height = 400;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      if (!ctx) return undefined;

      // 1. 暮夜幻紫渐变背景
      const g = ctx.createLinearGradient(0, 0, 500, 400);
      g.addColorStop(0, '#312046');
      g.addColorStop(0.5, '#201532');
      g.addColorStop(1, '#130c1f');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 500, 400);

      // 2. 月亮与星辰
      drawCrescentMoon(ctx, 52, 48, 22, '#dccaa5', false, false);
      for (const [x, y, r] of [[150, 36, 2], [300, 28, 2], [440, 45, 2], [410, 160, 2]]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#ac9a76';
        ctx.fill();
      }

      // 3. 小女孩立绘（眩晕挨揍或通关甜睡）
      const win = run.escaped;
      const girl = globalResources.getImage(win ? 'girl-front' : 'girl-stun-front') || globalResources.getImage('girl-front');
      if (girl) {
        ctx.drawImage(girl, 15, 68, 215, 215);
      }

      // 4. 战绩大字与排版
      ctx.fillStyle = '#f5dfb9';
      ctx.font = 'bold 22px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('疯狂妈妈MaMa', 236, 78);

      ctx.fillStyle = win ? '#fae3ad' : '#ff9999';
      ctx.font = 'bold 18px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(win ? '今晚偷偷赢了！' : '糟糕，被发现了！', 236, 115);

      ctx.fillStyle = '#ffe0a1';
      ctx.font = 'bold 52px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(String(run.score), 236, 175);
      const scoreW = ctx.measureText(String(run.score)).width;
      ctx.fillStyle = '#c2ad86';
      ctx.font = 'bold 18px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText('分', 236 + scoreW + 8, 185);
      const grade = run.score >= 900 ? 'S' : run.score >= 750 ? 'A' : run.score >= 600 ? 'B' : run.score >= 400 ? 'C' : 'D';
      ctx.fillStyle = '#bda77e';
      ctx.font = 'bold 26px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(grade + ' 级', 415, 175);

      ctx.fillStyle = '#d4c5ac';
      ctx.font = '16px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText('完成 ' + run.completed + ' / 3 个小心愿', 236, 230);
      const seconds = Math.floor(run.elapsed);
      const time = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
      ctx.fillStyle = '#9ba8b6';
      ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText('用时 ' + time, 236, 260);

      // 5. 底部高光横幅条
      const bar = ctx.createLinearGradient(0, 310, 500, 310);
      bar.addColorStop(0, '#10c469');
      bar.addColorStop(1, '#079d4f');
      drawRoundRect(ctx, 25, 310, 450, 56, 16);
      ctx.fillStyle = bar;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const barText = run.canRevive
        ? '📣 快帮我复活本局+1，一起通关！'
        : (win ? '🌟 我已通关，你能打破纪录吗？' : '📣 疯狂妈妈太难了，快来挑战！');
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(barText, 250, 338);

      if (canvas.toTempFilePathSync) {
        return canvas.toTempFilePathSync({
          destWidth: 500,
          destHeight: 400,
          fileType: 'jpg',
          quality: 0.9
        });
      }
    } catch (e) {
      console.error('generateShareCard error:', e);
    }
    return undefined;
  }
}
