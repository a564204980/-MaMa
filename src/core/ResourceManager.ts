export interface ResourceItem {
  key: string;
  url: string;
}

/**
 * 资源加载与缓存管理器
 * 负责小游戏图片、纹理等资源的统一异步预加载与运行时存取
 */
export class ResourceManager {
  private images: Map<string, HTMLImageElement | any> = new Map();

  /**
   * 单张图片异步加载
   */
  public loadImage(key: string, url: string): Promise<HTMLImageElement | any> {
    if (this.images.has(key)) {
      return Promise.resolve(this.images.get(key));
    }

    return new Promise((resolve, reject) => {
      let img: any;
      if (typeof wx !== 'undefined' && wx.createImage) {
        img = wx.createImage();
      } else {
        img = new Image();
      }

      img.onload = () => {
        this.images.set(key, img);
        resolve(img);
      };

      img.onerror = (err: any) => {
        console.error(`[ResourceManager] 加载图片失败: key=${key}, url=${url}`, err);
        reject(err);
      };

      img.src = url;
    });
  }

  /**
   * 批量加载图片队列，支持进度回调
   */
  public async loadImages(
    items: ResourceItem[],
    onProgress?: (loaded: number, total: number) => void
  ): Promise<void> {
    const total = items.length;
    if (total === 0) {
      onProgress?.(0, 0);
      return;
    }

    let loaded = 0;
    const promises = items.map(async (item) => {
      try {
        await this.loadImage(item.key, item.url);
      } catch (e) {
        console.warn(`[ResourceManager] 资源跳过或加载异常: ${item.key}`);
      } finally {
        loaded++;
        onProgress?.(loaded, total);
      }
    });

    await Promise.all(promises);
  }

  /**
   * 获取已缓存的图片
   */
  public getImage(key: string): any {
    return this.images.get(key);
  }

  /**
   * 检查是否已缓存
   */
  public hasImage(key: string): boolean {
    return this.images.has(key);
  }

  /**
   * 释放并清空资源
   */
  public clear(): void {
    this.images.clear();
  }
}

export const globalResources = new ResourceManager();
