export class NightLighting {
  /**
   * 渲染夜晚全局微光与黑暗滤镜遮罩
   */
  static render(ctx: CanvasRenderingContext2D, blackout: boolean): void {
    // 探索状态下使用自带夜色底图，仅在停电或特殊全黑时叠加暗蓝氛围滤镜
    if (!blackout) return;
    ctx.save();
    ctx.fillStyle = 'rgba(4, 11, 25, 0.42)';
    ctx.fillRect(0, 0, 1580, 996);
    ctx.restore();
  }
}
