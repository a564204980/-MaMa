import { LullabyState } from '../gameplay/Run';
import { drawRoundRect, drawCrescentMoon, drawStar } from '../utils/draw';
import { Point } from '../gameplay/House';

export class LullabyOverlay {
  /**
   * 判断触控点是否命中哄睡小游戏操作区域
   */
  hitTest(p: Point): boolean {
    return p.x >= 340 && p.x <= 940 && p.y >= 120 && p.y <= 420;
  }

  /**
   * 绘制哄睡小游戏全套高保真 UI
   */
  draw(
    ctx: CanvasRenderingContext2D,
    lullaby: LullabyState | null,
    clock: number,
    textFn: (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size?: number, color?: string, align?: CanvasTextAlign) => void
  ): void {
    if (!lullaby) return;

    const cx = 640;
    const topY = 136;

    // 0. 深色夜幕柔和背板光晕
    const bgGlow = ctx.createRadialGradient(cx, topY + 120, 30, cx, topY + 120, 270);
    bgGlow.addColorStop(0, 'rgba(8, 14, 24, 0.82)');
    bgGlow.addColorStop(0.65, 'rgba(6, 12, 20, 0.70)');
    bgGlow.addColorStop(1, 'rgba(6, 12, 20, 0)');
    ctx.fillStyle = bgGlow;
    ctx.fillRect(cx - 320, topY - 25, 640, 310);

    // 1. 顶部标题“哄 睡”与星月装饰
    textFn(ctx, '哄 睡', cx + 8, topY + 16, 32, '#ffe79a', 'center');
    drawCrescentMoon(ctx, cx - 68, topY + 16, 16, '#ffe68f');
    drawStar(ctx, cx - 58, topY + 4, 3, '#fff4c2');
    drawStar(ctx, cx - 116, topY + 16, 5.5, '#ffd97d');
    drawStar(ctx, cx + 80, topY + 4, 3.8, '#fff2b0');
    drawStar(ctx, cx + 126, topY + 16, 5.5, '#ffd97d');

    // 2. 副标题
    textFn(ctx, '跟着节拍，轻轻拍。', cx, topY + 48, 15, '#bcccdb', 'center');

    // 3. 梦幻星空摇篮节拍胶囊槽（儿童房治愈星空风格）
    const barW = 460, barH = 36, barR = 18;
    const barX = cx - barW / 2, barY = topY + 70;

    // 胶囊槽底板与内裁切
    ctx.save();
    drawRoundRect(ctx, barX, barY, barW, barH, barR);
    ctx.clip();

    // 3.1 梦幻星夜平滑渐变底色（微风蓝 -> 宁静星夜 -> 暖紫晚霞，柔和不刺眼）
    const trackGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    trackGrad.addColorStop(0, '#1c2d46');      // 柔和微风蓝
    trackGrad.addColorStop(0.36, '#182035');   // 宁静夜空
    trackGrad.addColorStop(0.50, '#161d30');   // 摇篮星夜核心
    trackGrad.addColorStop(0.64, '#2c1e2d');   // 暖紫过渡
    trackGrad.addColorStop(1, '#46242c');      // 柔和暖珊瑚红
    ctx.fillStyle = trackGrad;
    ctx.fillRect(barX, barY, barW, barH);

    // 3.2 槽内点缀几颗细微闪烁的童话小星尘
    const stars = [
      { x: barX + 45, y: barY + 12, s: 2.0, a: 0.45 },
      { x: barX + 110, y: barY + 24, s: 2.6, a: 0.5 },
      { x: barX + barW - 55, y: barY + 13, s: 2.2, a: 0.45 },
      { x: barX + barW - 115, y: barY + 23, s: 1.8, a: 0.4 }
    ];
    for (const st of stars) {
      drawStar(ctx, st.x, st.y, st.s, `rgba(255, 235, 170, ${st.a})`);
    }

    // 3.3 中间舒适区（温润月光摇篮区，支持随连击收窄与动态轻柔摇摆）
    const hitStrength = lullaby.hitTimer ? Math.min(1, lullaby.hitTimer / 0.45) : 0;
    const sweetRatio = lullaby.sweetWidth !== undefined ? lullaby.sweetWidth : 0.28;
    const sweetCenterRatio = lullaby.sweetCenter !== undefined ? lullaby.sweetCenter : 0.5;
    const sweetW = barW * sweetRatio;
    const sweetCenterX = barX + barR + sweetCenterRatio * (barW - barR * 2);
    const sweetX = sweetCenterX - sweetW / 2;

    const sweetGrad = ctx.createLinearGradient(sweetX, barY, sweetX + sweetW, barY);
    const baseCenterAlpha = 0.26 + 0.48 * hitStrength;
    const baseSideAlpha = 0.08 + 0.24 * hitStrength;
    sweetGrad.addColorStop(0, `rgba(255, 220, 100, ${baseSideAlpha.toFixed(2)})`);
    sweetGrad.addColorStop(0.5, `rgba(255, 235, 140, ${baseCenterAlpha.toFixed(2)})`);
    sweetGrad.addColorStop(1, `rgba(255, 220, 100, ${baseSideAlpha.toFixed(2)})`);
    ctx.fillStyle = sweetGrad;
    ctx.fillRect(sweetX, barY, sweetW, barH);

    // 命中瞬间的舒适区金芒填充爆发
    if (hitStrength > 0.01) {
      const hitBloom = ctx.createRadialGradient(sweetCenterX, barY + barH / 2, 2, sweetCenterX, barY + barH / 2, sweetW * 0.58);
      hitBloom.addColorStop(0, `rgba(255, 248, 190, ${(0.62 * hitStrength).toFixed(2)})`);
      hitBloom.addColorStop(0.5, `rgba(255, 220, 95, ${(0.38 * hitStrength).toFixed(2)})`);
      hitBloom.addColorStop(1, 'rgba(255, 215, 85, 0)');
      ctx.fillStyle = hitBloom;
      ctx.fillRect(sweetX, barY, sweetW, barH);
    }

    // 中间舒适区中央的柔和金色小月牙暗纹（随摇篮移动，命中时共鸣闪烁）
    ctx.save();
    const moonAlpha = 0.28 + 0.65 * hitStrength;
    ctx.globalAlpha = Math.min(1, moonAlpha);
    const moonR = 11 * (1 + 0.16 * Math.sin(hitStrength * Math.PI));
    drawCrescentMoon(ctx, sweetCenterX, barY + barH / 2, moonR, '#ffe075', false, hitStrength > 0.1);
    ctx.restore();

    ctx.restore(); // 结束 clip

    // 3.4 中间舒适区发光边框（圆润温柔的月光摇篮框，随摇篮移动，命中时弹性微膨胀震颤）
    const sweetPulse = 0.85 + 0.15 * Math.sin(clock * 3.5);
    const popExpand = hitStrength > 0.01 ? Math.sin(hitStrength * Math.PI) * 2.6 : 0;
    const borderWidth = 2.0 + (hitStrength > 0.01 ? Math.sin(hitStrength * Math.PI) * 1.6 : 0);
    const sweetBoxX = sweetX - 1 - popExpand;
    const sweetBoxW = sweetW + 2 + popExpand * 2;
    const sweetBoxY = barY - 2 - popExpand * 0.5;
    const sweetBoxH = barH + 4 + popExpand;

    ctx.save();
    if (hitStrength > 0.01) {
      ctx.shadowColor = 'rgba(255, 215, 80, 0.95)';
      ctx.shadowBlur = 10 + 18 * hitStrength;
    }
    drawRoundRect(ctx, sweetBoxX, sweetBoxY, sweetBoxW, sweetBoxH, 10);
    ctx.strokeStyle = hitStrength > 0.01
      ? `rgba(255, 245, 160, ${(0.75 + 0.25 * hitStrength).toFixed(2)})`
      : `rgba(255, 225, 110, ${(0.65 * sweetPulse).toFixed(2)})`;
    ctx.lineWidth = borderWidth;
    ctx.stroke();

    // 舒适区上方微小的星芒小点缀（随摇篮移动）
    const starGlowSize = (3.5 + 2.5 * hitStrength) * sweetPulse;
    drawStar(ctx, sweetCenterX, barY - 7 - popExpand * 0.5, starGlowSize, '#ffe88a');
    ctx.restore();

    // 3.5 胶囊外轮廓柔粉蓝温润边框
    ctx.save();
    drawRoundRect(ctx, barX, barY, barW, barH, barR);
    ctx.strokeStyle = 'rgba(110, 165, 205, 0.70)';
    ctx.lineWidth = 2.0;
    ctx.stroke();
    ctx.restore();

    // 3.6 往复平滑滑动的童趣小金星 ⭐ / 柔光摇篮光标
    const cursorX = barX + barR + lullaby.progress * (barW - barR * 2);
    const cursorY = barY + barH / 2;
    const inSweetZone = lullaby.progress >= (sweetCenterRatio - sweetRatio / 2) && lullaby.progress <= (sweetCenterRatio + sweetRatio / 2);

    // 3.7 命中时的水波同心金光环与微光星尘迸散（从击中瞬间位置向四周扩散）
    if (hitStrength > 0.01) {
      ctx.save();
      const hitP = lullaby.hitProgress !== undefined ? lullaby.hitProgress : lullaby.progress;
      const hitCenterX = barX + barR + hitP * (barW - barR * 2);
      const ringProgress = 1 - hitStrength; // 0 -> 1 扩散
      const ringRadius = 13 + ringProgress * 28; // 13px -> 41px
      const ringAlpha = (hitStrength * 0.85).toFixed(2);

      // 金色水波光环
      ctx.beginPath();
      ctx.arc(hitCenterX, cursorY, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 235, 135, ${ringAlpha})`;
      ctx.lineWidth = Math.max(1, 2.6 * hitStrength);
      ctx.shadowColor = '#ffe27a';
      ctx.shadowBlur = 8;
      ctx.stroke();

      // 5 颗向外迸散的晶莹小星尘
      const sparkAngles = [-0.65, -0.15, 0.4, 0.9, 2.35];
      const sparkDist = ringProgress * 22;
      for (let sIdx = 0; sIdx < 5; sIdx++) {
        const ang = sparkAngles[sIdx];
        const spX = hitCenterX + Math.cos(ang) * (14 + sparkDist);
        const spY = cursorY + Math.sin(ang) * (8 + sparkDist * 0.65);
        const spAlpha = (hitStrength * 0.95).toFixed(2);
        const spSize = Math.max(1.5, 3.2 * (1 - ringProgress * 0.7));
        drawStar(ctx, spX, spY, spSize, `rgba(255, 245, 180, ${spAlpha})`);
      }
      ctx.restore();
    }

    // 3.8 核心小金星：命中时爆米花跳跃（Scale Pop Bounce）
    const starPopScale = hitStrength > 0.01 ? 1.0 + 0.55 * Math.sin(hitStrength * Math.PI) : 1.0;
    const baseStarSize = inSweetZone ? 8.5 : 7.0;
    const starSize = baseStarSize * starPopScale;
    const baseGlowRadius = inSweetZone ? 32 : 24;
    const glowRadius = baseGlowRadius + (hitStrength > 0.01 ? 16 * Math.sin(hitStrength * Math.PI) : 0);
    const glowAlpha = inSweetZone ? Math.min(0.96, 0.68 + 0.28 * hitStrength) : 0.42;

    ctx.save();
    // 柔和星光晕（进入舒适区时金光更盛，击中时强光脉冲）
    const starGlow = ctx.createRadialGradient(cursorX, cursorY, 2, cursorX, cursorY, glowRadius);
    starGlow.addColorStop(0, inSweetZone ? 'rgba(255, 245, 190, 0.95)' : 'rgba(230, 240, 255, 0.88)');
    starGlow.addColorStop(0.4, `rgba(255, 215, 80, ${glowAlpha})`);
    starGlow.addColorStop(1, 'rgba(255, 210, 80, 0)');
    ctx.fillStyle = starGlow;
    ctx.beginPath();
    ctx.arc(cursorX, cursorY, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // 核心童趣小金星光标
    const starColor = inSweetZone ? '#fffbeb' : '#ffffff';
    drawStar(ctx, cursorX, cursorY, starSize, starColor);
    ctx.save();
    ctx.shadowColor = '#ffe27a';
    ctx.shadowBlur = 8 + (hitStrength > 0.01 ? 12 * hitStrength : 0);
    drawStar(ctx, cursorX, cursorY, starSize * 0.65, '#ffe27a');
    ctx.restore();
    ctx.restore();

    // 4. 6 颗月亮连击计数器（精致星轨托盘 + Q弹出现/点亮专属动效 + 水波星尘）
    const combo = lullaby.combo;
    const moonY = topY + 142;
    const spacing = 46;
    const startX = cx - (5 * spacing) / 2;

    // 4.3 绘制 6 颗月牙（带出现弹性跳跃、波浪欢呼与水波星尘）
    for (let i = 0; i < 6; i++) {
      const mx = startX + i * spacing;
      const isLatestHit = (i === combo - 1) && hitStrength > 0.001;

      // 悬浮与波浪动态偏移
      let curMoonY = moonY;
      if (combo >= 6) {
        // 6连击大成功通关：多米诺琴键欢呼波浪
        curMoonY += Math.sin(clock * 11 - i * 0.55) * 3.6;
      } else if (i < combo) {
        // 已点亮：轻柔安睡起伏微动
        curMoonY += Math.sin(clock * 2.8 + i * 0.9) * 1.1;
      }

      if (i < combo) {
        // --- 已点亮实心月牙 ---
        // 出现弹性跳跃曲线（刚点亮诞生时从 1.52 倍 Q 弹回缩）
        const popScale = isLatestHit ? 1.0 + 0.52 * Math.sin(hitStrength * Math.PI) : 1.0;

        // 水波光晕扩散环（从新诞生的月牙中心向外绽放）
        if (isLatestHit) {
          const ringProg = 1 - hitStrength; // 0 -> 1
          const ringR = 11 + ringProg * 25; // 11px -> 36px
          const ringAlpha = (hitStrength * 0.88).toFixed(2);
          ctx.save();
          ctx.beginPath();
          ctx.arc(mx, curMoonY, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 230, 120, ${ringAlpha})`;
          ctx.lineWidth = Math.max(1, 2.2 * hitStrength);
          ctx.shadowColor = '#ffe27a';
          ctx.shadowBlur = 10 * hitStrength;
          ctx.stroke();

          // 3 颗灵动小星尘向外飘散
          const angles = [-0.85, 0.55, 2.35];
          for (let a = 0; a < 3; a++) {
            const ang = angles[a];
            const dist = 13 + ringProg * 20;
            const spX = mx + Math.cos(ang) * dist;
            const spY = curMoonY + Math.sin(ang) * dist * 0.75;
            const spAlpha = (hitStrength * 0.92).toFixed(2);
            const spSize = Math.max(1.2, 2.8 * (1 - ringProg * 0.65));
            drawStar(ctx, spX, spY, spSize, `rgba(255, 245, 175, ${spAlpha})`);
          }
          ctx.restore();
        }

        // 月牙本体绘制（带 Q 弹 Scale）
        ctx.save();
        ctx.translate(mx, curMoonY);
        if (popScale !== 1.0) {
          ctx.scale(popScale, popScale);
        }
        // 刚诞生瞬间呈现微白高光暖金，随后平滑回归标准奶油金 #fedd8f
        const moonColor = isLatestHit ? '#fff1ba' : '#fedd8f';
        drawCrescentMoon(ctx, 0, 0, 13.5, moonColor, false, true);
        ctx.restore();
      } else {
        // --- 未点亮：精致柔和虚线空心月牙 ---
        drawCrescentMoon(ctx, mx, curMoonY, 13.5, 'rgba(255, 235, 190, 0.45)', true, false);
      }
    }

    // 5. 连击进度文本与失误警戒指示器
    const textY = topY + 180;
    textFn(ctx, '连击', cx - 52, textY, 15, '#8fa6b8', 'right');
    textFn(ctx, `${combo} / 6`, cx - 38, textY, 18, combo >= 6 ? '#ffe278' : '#ffffff', 'left');

    // 容错警戒指示器（失败 2 次直接惊醒）
    const miss = lullaby.missCount || 0;
    const badgeX = cx + 52;
    textFn(ctx, '惊动', badgeX, textY, 13, miss > 0 ? '#ff8585' : '#708696', 'left');
    for (let m = 0; m < 2; m++) {
      const dotX = badgeX + 36 + m * 14;
      const isFailed = m < miss;
      ctx.save();
      if (isFailed) {
        // 红色警报闪烁
        const flash = 0.7 + 0.3 * Math.sin(clock * 8);
        ctx.fillStyle = `rgba(255, 65, 65, ${flash.toFixed(2)})`;
        ctx.shadowColor = '#ff2b2b';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(dotX, textY - 4, 4.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 绿色/柔白平稳安眠状态
        ctx.fillStyle = 'rgba(140, 210, 180, 0.75)';
        ctx.beginPath();
        ctx.arc(dotX, textY - 4, 3.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 处于最后 1 次容错危机边缘时，背板浮现暗红心跳呼吸警戒框
    if (miss === 1) {
      const warnPulse = 0.22 + 0.15 * Math.sin(clock * 6);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 45, 45, ${warnPulse.toFixed(2)})`;
      ctx.lineWidth = 2.0;
      drawRoundRect(ctx, cx - 320, topY - 25, 640, 310, 16);
      ctx.stroke();
      ctx.restore();
    }

    // 6. 即时判定浮动反馈效果
    const feedbackY = topY + 216;
    if (lullaby.feedbackTimer > 0) {
      const alpha = Math.min(1, lullaby.feedbackTimer / 0.35);
      const floatOffset = (1 - alpha) * 4;
      if (lullaby.feedback === '拍得刚刚好') {
        textFn(ctx, '✦  拍得刚刚好  ✦', cx, feedbackY - floatOffset, 20, `rgba(255, 232, 150, ${alpha.toFixed(2)})`, 'center');
      } else if (lullaby.feedback.includes('惊动')) {
        // 醒目的红色警报
        textFn(ctx, `!  ${lullaby.feedback}  !`, cx, feedbackY - floatOffset, 19, `rgba(255, 80, 80, ${alpha.toFixed(2)})`, 'center');
      } else if (lullaby.feedback === '太轻了…') {
        textFn(ctx, '·  太轻了…  ·', cx, feedbackY - floatOffset, 18, `rgba(150, 195, 235, ${alpha.toFixed(2)})`, 'center');
      } else {
        textFn(ctx, `!  ${lullaby.feedback}  !`, cx, feedbackY - floatOffset, 19, `rgba(255, 105, 105, ${alpha.toFixed(2)})`, 'center');
      }
    } else {
      const hintAlpha = (0.42 + 0.22 * Math.sin(clock * 4)).toFixed(2);
      textFn(ctx, '✦  轻触交互键击打节拍  ✦', cx, feedbackY, 15, `rgba(235, 215, 150, ${hintAlpha})`, 'center');
    }

    // 7. 底部退出指引
    const exitY = topY + 252;
    textFn(ctx, '←   移动可退出   →', cx, exitY, 13, '#587082', 'center');
  }
}
