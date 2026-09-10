/**
 * 本地持久化存储管理器
 * 基于微信小游戏原生 Storage API 封装，提供强类型读写与容错降级
 */
export class StorageManager {
  private static readonly PREFIX = 'four_asleep_';

  /**
   * 写入持久化数据
   * @param key 键名
   * @param value 任意可序列化对象
   */
  public static set<T>(key: string, value: T): boolean {
    try {
      const fullKey = this.PREFIX + key;
      const data = JSON.stringify(value);
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync(fullKey, data);
      } else {
        localStorage.setItem(fullKey, data);
      }
      return true;
    } catch (e) {
      console.error(`[StorageManager] 保存键 "${key}" 失败:`, e);
      return false;
    }
  }

  /**
   * 读取持久化数据
   * @param key 键名
   * @param defaultValue 默认值（若不存在或解析失败时返回）
   */
  public static get<T>(key: string, defaultValue: T): T {
    try {
      const fullKey = this.PREFIX + key;
      let raw: string | null = null;

      if (typeof wx !== 'undefined' && wx.getStorageSync) {
        raw = wx.getStorageSync(fullKey);
      } else if (typeof localStorage !== 'undefined') {
        raw = localStorage.getItem(fullKey);
      }

      if (!raw) {
        return defaultValue;
      }

      return JSON.parse(raw) as T;
    } catch (e) {
      console.warn(`[StorageManager] 读取键 "${key}" 异常，已回退默认值:`, e);
      return defaultValue;
    }
  }

  /**
   * 移除指定项
   */
  public static remove(key: string): void {
    const fullKey = this.PREFIX + key;
    try {
      if (typeof wx !== 'undefined' && wx.removeStorageSync) {
        wx.removeStorageSync(fullKey);
      } else if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(fullKey);
      }
    } catch (e) {
      console.error(`[StorageManager] 移除键 "${key}" 失败:`, e);
    }
  }

  /**
   * 清空所有属于当前游戏前缀的本地缓存
   */
  public static clear(): void {
    try {
      if (typeof wx !== 'undefined' && wx.getStorageInfoSync) {
        const info = wx.getStorageInfoSync();
        for (const key of info.keys) {
          if (key.startsWith(this.PREFIX)) {
            wx.removeStorageSync(key);
          }
        }
      }
    } catch (e) {
      console.error('[StorageManager] 清理存储失败:', e);
    }
  }
}
