/**
 * 跨平台安全绘制圆角矩形路径（百分百兼容各基础库版本的微信小游戏与浏览器）
 * 解决特定环境下 ctx.roundRect 传入非序列参数报错的问题
 */
export function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number = 0
): void {
  ctx.beginPath();
  if (radius <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  const r = Math.min(radius, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * 绘制圆润饱满、带柔和温暖金色外发光的治愈系月牙
 * 对齐儿童房绘本与摇篮曲高质感视觉规范
 * @param ctx Canvas 2D 上下文
 * @param cx 月牙视觉中心 X
 * @param cy 月牙视觉中心 Y
 * @param r 基准半径（约 11~16px）
 * @param color 填充或描边颜色（建议已点亮使用 #fedd8f 暖金）
 * @param dashed 是否为未点亮的虚线空心轮廓
 * @param glow 是否产生柔和金色外发光（实心默认开启，虚线默认关闭）
 */
export function drawCrescentMoon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  dashed: boolean = false,
  glow: boolean = !dashed
): void {
  ctx.save();
  ctx.translate(cx, cy);
  // 微微逆时针倾斜约 12~15 度（-0.22 rad），使月牙轻盈上仰、温润治愈
  ctx.rotate(-0.22);

  // 几何构造：两段高精度圆弧构成的闭合月牙（完全平滑无折角）
  const O1x = 0.16 * r;
  const O1y = 0;
  const R1 = r;
  const O2x = 0.70 * r;
  const O2y = 0;
  const R2 = 0.84 * r;
  const D = O2x - O1x;

  // 两圆交点解析解
  const x = (R1 * R1 - R2 * R2 + D * D) / (2 * D);
  const y = Math.sqrt(Math.max(0, R1 * R1 - x * x));

  // 角度计算
  const theta = Math.acos(Math.min(1, Math.max(-1, x / R1)));
  const phi2 = Math.atan2(y, x - D);
  const phi1 = Math.atan2(-y, x - D);

  ctx.beginPath();
  // 1. 外圆大弧：从右上交点逆时针绕过左侧饱满大背弧到右下交点
  ctx.arc(O1x, O1y, R1, -theta, theta, true);
  // 2. 内凹圆弧：从右下交点顺时针切回右上交点
  ctx.arc(O2x, O2y, R2, phi2, phi1, false);
  ctx.closePath();

  if (dashed) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([3, 2.5]);
    ctx.stroke();
  } else {
    if (glow) {
      // 柔和温暖的金色外发光（soft outer glow）
      ctx.shadowColor = 'rgba(255, 205, 90, 0.78)';
      ctx.shadowBlur = Math.max(6, r * 0.65);
    }
    ctx.fillStyle = color;
    ctx.fill();

    // 强化一层内层高亮微光质感（仅在开启 glow 时）
    if (glow) {
      ctx.shadowColor = 'rgba(255, 235, 160, 0.5)';
      ctx.shadowBlur = Math.max(2, r * 0.25);
      ctx.fill();
    }
  }

  ctx.restore();
}


/**
 * 绘制四角星/多角星光辉
 */
export function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  const inner = r * 0.36;
  for (let i = 0; i < 8; i++) {
    const rad = (i * Math.PI) / 4 - Math.PI / 2;
    const curR = i % 2 === 0 ? r : inner;
    const x = cx + Math.cos(rad) * curR;
    const y = cy + Math.sin(rad) * curR;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * 绘制漫画风晶莹水滴/慌张冷汗
 */
export function drawSweatDrop(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  angle = 0.25
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.bezierCurveTo(size * 0.72, -size * 0.25, size * 0.85, size * 0.65, 0, size);
  ctx.bezierCurveTo(-size * 0.85, size * 0.65, -size * 0.72, -size * 0.25, 0, -size);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -size, 0, size);
  g.addColorStop(0, '#8fe1ff');
  g.addColorStop(0.5, '#4bb5f5');
  g.addColorStop(1, '#2490df');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#186fae';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(size * 0.25, size * 0.35, size * 0.32, -Math.PI * 0.7, -Math.PI * 0.15);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = Math.max(1, size * 0.22);
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

/**
 * 绘制经典日漫风【💢 动感暴怒青筋表情】
 * @param ctx 画布上下文
 * @param cx 中心点 X
 * @param cy 中心点 Y
 * @param size 尺寸（基准半径约 8~12px）
 * @param scale 动态缩放比例（用于弹性心跳脉冲跳跃）
 */
export function drawAngerMark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number = 10,
  scale: number = 1.0
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.25);
  ctx.scale(scale, scale);

  const s = size;
  const off = s * 0.32;
  const bend = s * 0.24;

  // 1. 底层暗红柔和光晕
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, s * 1.6);
  glow.addColorStop(0, 'rgba(255, 30, 40, 0.55)');
  glow.addColorStop(0.6, 'rgba(255, 20, 30, 0.25)');
  glow.addColorStop(1, 'rgba(255, 20, 30, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, s * 1.6, 0, Math.PI * 2);
  ctx.fill();

  // 绘制四根经典向心微凹的井字粗弧线
  const drawLines = () => {
    // 纵向两根
    ctx.beginPath();
    ctx.moveTo(-off, -s);
    ctx.quadraticCurveTo(-off + bend, 0, -off, s);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(off, -s);
    ctx.quadraticCurveTo(off - bend, 0, off, s);
    ctx.stroke();

    // 横向两根
    ctx.beginPath();
    ctx.moveTo(-s, -off);
    ctx.quadraticCurveTo(0, -off + bend, s, -off);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-s, off);
    ctx.quadraticCurveTo(0, off - bend, s, off);
    ctx.stroke();
  };

  // 2. 外部深红粗轮廓（确保在任何深浅背景下清晰立体）
  ctx.strokeStyle = '#850000';
  ctx.lineWidth = Math.max(3.6, s * 0.36);
  ctx.lineCap = 'round';
  drawLines();

  // 3. 内部鲜红高亮条
  ctx.strokeStyle = '#ff283b';
  ctx.lineWidth = Math.max(2.0, s * 0.22);
  drawLines();

  // 4. 左上交叉点微高光，增添动画立体质感
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(-off * 0.35, -off * 0.35, Math.max(1, s * 0.12), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
