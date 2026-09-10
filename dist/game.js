'use strict';

/**
 * 场景管理器
 * 调度游戏主场景状态机流转与渲染管道传递
 */
class SceneManager {
    constructor() {
        this.scenes = new Map();
        this.currentScene = null;
        this.isTransitioning = false;
    }
    /**
     * 注册场景
     */
    register(scene) {
        this.scenes.set(scene.name, scene);
    }
    /**
     * 切换场景
     * @param name 场景标识
     * @param params 传参
     */
    switchScene(name, params) {
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
        }
        catch (e) {
            console.error(`[SceneManager] 切换场景至 "${name}" 发生异常:`, e);
        }
        finally {
            this.isTransitioning = false;
        }
        return true;
    }
    /**
     * 驱动当前场景更新
     */
    update(dt) {
        if (this.currentScene && !this.isTransitioning) {
            this.currentScene.onUpdate(dt);
        }
    }
    /**
     * 驱动当前场景渲染
     */
    render(ctx) {
        if (this.currentScene && !this.isTransitioning) {
            this.currentScene.onRender(ctx);
        }
    }
    /**
     * 分发触控事件给当前激活场景
     */
    handleTouchStart(point) {
        this.currentScene?.onTouchStart?.(point);
    }
    handleTouchMove(point) {
        this.currentScene?.onTouchMove?.(point);
    }
    handleTouchEnd(point) {
        this.currentScene?.onTouchEnd?.(point);
    }
    getCurrentScene() {
        return this.currentScene;
    }
}
const globalSceneManager = new SceneManager();

/**
 * 轻量级发布订阅事件总线
 */
class EventBus {
    constructor() {
        this.events = new Map();
    }
    /**
     * 注册事件监听
     */
    on(event, handler) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push(handler);
    }
    /**
     * 注册一次性事件监听
     */
    once(event, handler) {
        const wrapper = (...args) => {
            this.off(event, wrapper);
            handler(...args);
        };
        this.on(event, wrapper);
    }
    /**
     * 注销事件监听
     */
    off(event, handler) {
        const handlers = this.events.get(event);
        if (!handlers)
            return;
        const index = handlers.indexOf(handler);
        if (index !== -1) {
            handlers.splice(index, 1);
        }
        if (handlers.length === 0) {
            this.events.delete(event);
        }
    }
    /**
     * 触发事件广播
     */
    emit(event, ...args) {
        const handlers = this.events.get(event);
        if (!handlers)
            return;
        // 浅拷贝执行，防止回调中动态增删监听器导致遍历异常
        const copy = [...handlers];
        for (const fn of copy) {
            fn(...args);
        }
    }
    /**
     * 清理所有事件
     */
    clear() {
        this.events.clear();
    }
}
// 导出全局单例，同时允许实例化私有总线
const globalEvents = new EventBus();

class InputManager {
    constructor() {
        this.scaleX = 1;
        this.scaleY = 1;
        this.onStartListeners = [];
        this.onMoveListeners = [];
        this.onEndListeners = [];
        this.active = new Map();
        this.aliases = new Map();
        this.nextId = -1;
        this.canvases = new WeakSet();
        if (typeof wx !== 'undefined') {
            wx.onTouchStart(e => this.dispatch('wx', 'start', e));
            wx.onTouchMove(e => this.dispatch('wx', 'move', e));
            wx.onTouchEnd(e => this.dispatch('wx', 'end', e));
            wx.onTouchCancel(e => this.dispatch('wx', 'end', e));
        }
        if (typeof window !== 'undefined') {
            window.addEventListener('pointerdown', e => this.dispatch('pointer', 'start', e));
            window.addEventListener('pointermove', e => this.dispatch('pointer', 'move', e));
            window.addEventListener('pointerup', e => this.dispatch('pointer', 'end', e));
            window.addEventListener('pointercancel', e => this.cancelPointer(e));
            window.addEventListener('blur', () => { if (typeof wx === 'undefined')
                this.reset(); });
            if (typeof window.PointerEvent !== 'function') {
                window.addEventListener('mousedown', e => this.dispatch('mouse', 'start', e));
                window.addEventListener('mousemove', e => this.dispatch('mouse', 'move', e));
                window.addEventListener('mouseup', e => this.dispatch('mouse', 'end', e));
            }
        }
        globalEvents.on('app:hide', () => this.reset());
        globalEvents.on('input:reset', () => this.reset());
    }
    cancelPointer(e) {
        const id = this.aliases.get('pointer:' + e.pointerId);
        // Native touch remains authoritative when the simulator cancels only its mirrored pointer.
        if (id !== undefined && [...this.aliases].some(([key, value]) => key.startsWith('wx:') && value === id))
            return;
        this.dispatch('pointer', 'end', e);
    }
    dispatch(source, phase, e) {
        // Simulator hover events are not finger releases. Only explicit up/cancel ends a gesture.
        if (phase === 'move' && (source === 'pointer' || source === 'mouse') && e.buttons === 0)
            return;
        const touches = e.changedTouches?.length ? Array.from(e.changedTouches) : phase === 'end' ? [] : e.touches?.length ? Array.from(e.touches) : ('touches' in e || 'changedTouches' in e) ? [] : [e];
        if (phase === 'end' && !touches.length && (e.pointerId !== undefined || e.identifier !== undefined))
            touches.push(e);
        if (phase === 'end' && !touches.length) {
            const remaining = new Set(Array.from(e.touches || [], (t) => t.identifier ?? t.pointerId ?? 0));
            for (const [id, p] of [...this.active])
                if ([...this.aliases].some(([key, value]) => key.startsWith(source + ':') && value === id) && !remaining.has(id))
                    this.release(p, e);
            return;
        }
        for (const t of touches) {
            const rawId = t.identifier ?? t.pointerId ?? 0;
            const key = source + ':' + rawId;
            const x = t.clientX ?? t.x ?? t.pageX, y = t.clientY ?? t.y ?? t.pageY;
            const mapped = this.transformPoint(x, y);
            let id = this.aliases.get(key);
            if (id === undefined && phase === 'end')
                continue;
            if (id === undefined) {
                const nearest = [...this.active.values()].sort((a, b) => Math.hypot(a.x - mapped.x, a.y - mapped.y) - Math.hypot(b.x - mapped.x, b.y - mapped.y))[0];
                if (phase === 'start' && nearest && Math.hypot(nearest.x - mapped.x, nearest.y - mapped.y) < 24)
                    id = nearest.identifier;
                else if (phase !== 'start' && this.active.has(rawId))
                    id = rawId;
                else if (phase !== 'start' && this.active.size === 1)
                    id = this.active.keys().next().value;
                else if (phase !== 'start' && nearest && Number.isFinite(x) && Number.isFinite(y))
                    id = nearest.identifier;
                else if (phase === 'start')
                    id = this.active.has(rawId) ? this.nextId-- : rawId;
                if (id !== undefined)
                    this.aliases.set(key, id);
            }
            if (id === undefined)
                continue;
            const old = this.active.get(id);
            const p = Number.isFinite(x) && Number.isFinite(y) ? this.transformPoint(x, y, id) : old;
            if (!p)
                continue;
            if (phase === 'end') {
                if (old)
                    this.release(p, e);
                continue;
            }
            if (phase === 'start') {
                if (old)
                    continue;
                this.active.set(id, p);
                this.onStartListeners.forEach(fn => fn(p, e));
            }
            else if (old) {
                this.active.set(id, p);
                this.onMoveListeners.forEach(fn => fn(p, e));
            }
        }
    }
    release(p, e) { this.active.delete(p.identifier); for (const [key, id] of this.aliases)
        if (id === p.identifier)
            this.aliases.delete(key); this.onEndListeners.forEach(fn => fn(p, e)); }
    reset() { for (const p of [...this.active.values()])
        this.release(p, {}); }
    setScale(x, y) { this.scaleX = x; this.scaleY = y; }
    transformPoint(x, y, identifier = 0) { return { x: x * this.scaleX, y: y * this.scaleY, identifier }; }
    bindCanvas(canvas) {
        if (!canvas?.addEventListener || this.canvases.has(canvas))
            return;
        this.canvases.add(canvas);
        if (canvas.style) {
            canvas.style.touchAction = 'none';
            canvas.style.userSelect = 'none';
        }
        canvas.addEventListener('contextmenu', (e) => e.preventDefault?.());
        for (const [event, phase] of [['touchstart', 'start'], ['touchmove', 'move'], ['touchend', 'end'], ['touchcancel', 'end'], ['pointerdown', 'start'], ['pointermove', 'move'], ['pointerup', 'end'], ['pointercancel', 'end'], ['lostpointercapture', 'end'], ['mousedown', 'start'], ['mousemove', 'move'], ['mouseup', 'end']]) {
            // In browsers use Pointer Events only; wx still gets a canvas-touch fallback.
            if (event.startsWith('mouse') && typeof window !== 'undefined' && typeof window.PointerEvent === 'function')
                continue;
            if (event.startsWith('touch') && typeof wx === 'undefined')
                continue;
            canvas.addEventListener(event, (e) => {
                if (event === 'pointercancel') {
                    this.cancelPointer(e);
                    return;
                }
                if (event === 'lostpointercapture' && typeof wx !== 'undefined')
                    return;
                if (e.cancelable)
                    e.preventDefault?.();
                if (event === 'pointerdown') {
                    try {
                        canvas.setPointerCapture?.(e.pointerId);
                    }
                    catch { }
                }
                this.dispatch(event.startsWith('touch') ? 'canvas-touch' : event.startsWith('mouse') ? 'mouse' : 'pointer', phase, e);
            });
        }
    }
    onTouchStart(cb) { this.onStartListeners.push(cb); }
    onTouchMove(cb) { this.onMoveListeners.push(cb); }
    onTouchEnd(cb) { this.onEndListeners.push(cb); }
    removeListener(cb) { this.onStartListeners = this.onStartListeners.filter(f => f !== cb); this.onMoveListeners = this.onMoveListeners.filter(f => f !== cb); this.onEndListeners = this.onEndListeners.filter(f => f !== cb); }
    clear() { this.reset(); this.onStartListeners = []; this.onMoveListeners = []; this.onEndListeners = []; }
}
const globalInput = new InputManager();

/**
 * 本地持久化存储管理器
 * 基于微信小游戏原生 Storage API 封装，提供强类型读写与容错降级
 */
class StorageManager {
    /**
     * 写入持久化数据
     * @param key 键名
     * @param value 任意可序列化对象
     */
    static set(key, value) {
        try {
            const fullKey = this.PREFIX + key;
            const data = JSON.stringify(value);
            if (typeof wx !== 'undefined' && wx.setStorageSync) {
                wx.setStorageSync(fullKey, data);
            }
            else {
                localStorage.setItem(fullKey, data);
            }
            return true;
        }
        catch (e) {
            console.error(`[StorageManager] 保存键 "${key}" 失败:`, e);
            return false;
        }
    }
    /**
     * 读取持久化数据
     * @param key 键名
     * @param defaultValue 默认值（若不存在或解析失败时返回）
     */
    static get(key, defaultValue) {
        try {
            const fullKey = this.PREFIX + key;
            let raw = null;
            if (typeof wx !== 'undefined' && wx.getStorageSync) {
                raw = wx.getStorageSync(fullKey);
            }
            else if (typeof localStorage !== 'undefined') {
                raw = localStorage.getItem(fullKey);
            }
            if (!raw) {
                return defaultValue;
            }
            return JSON.parse(raw);
        }
        catch (e) {
            console.warn(`[StorageManager] 读取键 "${key}" 异常，已回退默认值:`, e);
            return defaultValue;
        }
    }
    /**
     * 移除指定项
     */
    static remove(key) {
        const fullKey = this.PREFIX + key;
        try {
            if (typeof wx !== 'undefined' && wx.removeStorageSync) {
                wx.removeStorageSync(fullKey);
            }
            else if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(fullKey);
            }
        }
        catch (e) {
            console.error(`[StorageManager] 移除键 "${key}" 失败:`, e);
        }
    }
    /**
     * 清空所有属于当前游戏前缀的本地缓存
     */
    static clear() {
        try {
            if (typeof wx !== 'undefined' && wx.getStorageInfoSync) {
                const info = wx.getStorageInfoSync();
                for (const key of info.keys) {
                    if (key.startsWith(this.PREFIX)) {
                        wx.removeStorageSync(key);
                    }
                }
            }
        }
        catch (e) {
            console.error('[StorageManager] 清理存储失败:', e);
        }
    }
}
StorageManager.PREFIX = 'four_asleep_';

/**
 * 音频管理器
 * 统一管理背景音乐(BGM)与音效(SFX)，支持音量控制、静音设置及音效并发池
 */
class AudioManager {
    constructor() {
        this.bgmContext = null;
        this.sfxPool = new Map();
        this.maxPoolSize = 5;
        this.isBgmMuted = false;
        this.isSfxMuted = false;
        this.currentBgmUrl = '';
        this.isBgmMuted = StorageManager.get('bgm_muted', false);
        this.isSfxMuted = StorageManager.get('sfx_muted', false);
    }
    /**
     * 播放或切换背景音乐
     * @param url 音频文件路径
     * @param loop 是否循环，默认为 true
     */
    playBgm(url, loop = true) {
        this.currentBgmUrl = url;
        if (typeof wx === 'undefined' || !wx.createInnerAudioContext) {
            return;
        }
        if (!this.bgmContext) {
            this.bgmContext = wx.createInnerAudioContext();
            this.bgmContext.loop = loop;
        }
        this.bgmContext.src = url;
        this.bgmContext.loop = loop;
        this.bgmContext.volume = this.isBgmMuted ? 0 : 1;
        if (!this.isBgmMuted) {
            this.bgmContext.play();
        }
    }
    /**
     * 暂停背景音乐
     */
    pauseBgm() {
        if (this.bgmContext) {
            this.bgmContext.pause();
        }
    }
    /**
     * 恢复背景音乐
     */
    resumeBgm() {
        if (this.bgmContext && !this.isBgmMuted) {
            this.bgmContext.play();
        }
    }
    /**
     * 停止背景音乐
     */
    stopBgm() {
        if (this.bgmContext) {
            this.bgmContext.stop();
        }
    }
    /**
     * 播放短音效（从对象池获取空闲或新建 context，避免快速连续点击被截断）
     * @param url 音频路径
     */
    playSfx(url) {
        if (this.isSfxMuted || typeof wx === 'undefined' || !wx.createInnerAudioContext) {
            return;
        }
        if (!this.sfxPool.has(url)) {
            this.sfxPool.set(url, []);
        }
        const pool = this.sfxPool.get(url);
        // 寻找闲置上下文
        let ctx = pool.find((item) => item.paused || item.ended);
        if (!ctx) {
            if (pool.length < this.maxPoolSize) {
                ctx = wx.createInnerAudioContext();
                ctx.src = url;
                pool.push(ctx);
            }
            else {
                // 池满则复用第一个
                ctx = pool[0];
            }
        }
        ctx.stop();
        ctx.play();
    }
    /**
     * 切换 BGM 静音状态
     */
    toggleBgm() {
        this.isBgmMuted = !this.isBgmMuted;
        StorageManager.set('bgm_muted', this.isBgmMuted);
        if (this.bgmContext) {
            if (this.isBgmMuted) {
                this.bgmContext.pause();
            }
            else {
                this.bgmContext.play();
            }
        }
        return this.isBgmMuted;
    }
    /**
     * 切换音效静音状态
     */
    toggleSfx() {
        this.isSfxMuted = !this.isSfxMuted;
        StorageManager.set('sfx_muted', this.isSfxMuted);
        return this.isSfxMuted;
    }
    get bgmMuted() {
        return this.isBgmMuted;
    }
    get sfxMuted() {
        return this.isSfxMuted;
    }
}
const globalAudio = new AudioManager();

/**
 * 微信小游戏生态桥接层
 * 统一收敛与抹平小游戏平台专属能力（分享、触感震动、生命周期与设备信息）
 */
class WechatBridge {
    /**
     * 初始化微信专属监听与能力
     */
    static init() {
        if (this.initialized)
            return;
        if (typeof wx === 'undefined') {
            this.initialized = true;
            if (typeof document !== 'undefined')
                document.addEventListener('visibilitychange', () => globalEvents.emit(document.hidden ? 'app:hide' : 'app:show'));
            if (typeof window !== 'undefined') {
                window.addEventListener('blur', () => globalEvents.emit('app:hide'));
                window.addEventListener('focus', () => globalEvents.emit('app:show'));
            }
            return;
        }
        this.initialized = true;
        // 1. 开启小游戏右上角菜单中的转发与朋友圈分享
        if (wx.showShareMenu) {
            wx.showShareMenu({
                withShareTicket: true,
                menus: ['shareAppMessage', 'shareTimeline']
            });
        }
        // 2. 被动分享监听
        if (wx.onShareAppMessage) {
            wx.onShareAppMessage(() => ({
                title: '一起来玩疯狂妈妈MaMa！',
                imageUrl: '' // 可配置默认分享图
            }));
        }
        // 3. 监听切前后台生命周期，派发到全局事件总线
        if (wx.onShow) {
            wx.onShow((res) => {
                console.log('[WechatBridge] 游戏进入前台', res);
                globalEvents.emit('app:show', res);
            });
        }
        if (wx.onHide) {
            wx.onHide(() => {
                console.log('[WechatBridge] 游戏进入后台');
                globalEvents.emit('app:hide');
            });
        }
    }
    /**
     * 触发设备短震动触觉反馈
     */
    static vibrateShort(type = 'light') {
        // Vibration disabled by user preference, including legacy callers.
    }
    /**
     * 触发设备长震动反馈
     */
    static vibrateLong() {
        // Vibration disabled by user preference, including legacy callers.
    }
    /**
     * 主动拉起分享面板
     */
    static shareAppMessage(title, imageUrl, query) {
        if (typeof wx !== 'undefined' && wx.shareAppMessage) {
            wx.shareAppMessage({
                title,
                imageUrl,
                query
            });
        }
    }
    /**
     * 获取系统与屏幕基础信息
     */
    static invalidateSystemInfo() { this.cachedSystemInfo = null; }
    static getSystemInfo() {
        if (this.cachedSystemInfo) {
            return this.cachedSystemInfo;
        }
        if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
            try {
                const info = wx.getSystemInfoSync();
                const statusBarHeight = info.statusBarHeight || 20;
                let safeAreaTop = statusBarHeight;
                if (wx.getMenuButtonBoundingClientRect) {
                    try {
                        const menu = wx.getMenuButtonBoundingClientRect();
                        if (menu && menu.bottom) {
                            safeAreaTop = Math.max(safeAreaTop, menu.bottom);
                        }
                    }
                    catch (e) {
                        // ignore
                    }
                }
                this.cachedSystemInfo = {
                    screenWidth: info.screenWidth,
                    screenHeight: info.screenHeight,
                    windowWidth: info.windowWidth,
                    windowHeight: info.windowHeight,
                    pixelRatio: info.pixelRatio || 1,
                    statusBarHeight,
                    safeAreaTop, safeAreaLeft: info.safeArea?.left || 0, safeAreaRight: Math.max(0, info.windowWidth - (info.safeArea?.right || info.windowWidth)),
                    platform: info.platform || 'unknown',
                    brand: info.brand || '',
                    model: info.model || ''
                };
                return this.cachedSystemInfo;
            }
            catch (e) {
                console.error('[WechatBridge] 获取系统信息失败:', e);
            }
        }
        // Web 开发环境降级信息
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        const w = typeof window !== 'undefined' ? window.innerWidth : 375;
        const h = typeof window !== 'undefined' ? window.innerHeight : 667;
        return {
            screenWidth: w,
            screenHeight: h,
            windowWidth: w,
            windowHeight: h,
            pixelRatio: dpr,
            statusBarHeight: 20,
            safeAreaTop: 44, safeAreaLeft: 0, safeAreaRight: 0,
            platform: 'devtools',
            brand: 'pc',
            model: 'browser'
        };
    }
}
WechatBridge.initialized = false;
WechatBridge.cachedSystemInfo = null;

/**
 * 游戏核心驱动引擎
 * 职责：Canvas 画布初始化与高分屏适配、主循环管理(Tick/DeltaTime)、生命周期调度与状态统计
 */
class Engine {
    now() {
        const nativePerformance = typeof wx !== 'undefined' && wx.getPerformance ? wx.getPerformance() : undefined;
        if (nativePerformance?.now)
            return nativePerformance.now();
        if (typeof performance !== 'undefined' && performance.now)
            return performance.now();
        return Date.now();
    }
    requestFrame(callback) {
        if (this.canvas?.requestAnimationFrame)
            return this.canvas.requestAnimationFrame(callback);
        if (typeof requestAnimationFrame !== 'undefined')
            return requestAnimationFrame(callback);
        return setTimeout(() => callback(this.now()), 16);
    }
    constructor(config) {
        this.logicalWidth = 0;
        this.logicalHeight = 0;
        this.dpr = 1;
        this.isRunning = false;
        this.isPaused = false;
        this.lastTime = 0;
        this.animFrameId = 0;
        // 性能统计
        this.fps = 60;
        this.frameCount = 0;
        this.fpsTimer = 0;
        this.showStats = true;
        if (config?.showStats !== undefined) {
            this.showStats = config.showStats;
        }
        // 1. 初始化平台桥接
        WechatBridge.init();
        // 2. 初始化画布与上下文
        const { canvas, ctx } = this.initCanvas();
        this.canvas = canvas;
        this.ctx = ctx;
        // 3. 绑定触控事件至场景
        this.bindInput();
        globalInput.bindCanvas(this.canvas);
        // 4. 监听前后台生命周期
        this.bindLifecycle();
        const resize = () => {
            WechatBridge.invalidateSystemInfo();
            const sys = WechatBridge.getSystemInfo();
            if (this.logicalWidth === sys.windowWidth && this.logicalHeight === sys.windowHeight)
                return;
            this.logicalWidth = sys.windowWidth;
            this.logicalHeight = sys.windowHeight;
            this.dpr = Math.min(3, sys.pixelRatio || 1);
            // 与 initCanvas 保持统一，不再进行二次 scale(dpr)
            this.canvas.width = Math.round(this.logicalWidth * this.dpr);
            this.canvas.height = Math.round(this.logicalHeight * this.dpr);
            globalEvents.emit('input:reset');
        };
        if (typeof window !== 'undefined')
            window.addEventListener('resize', resize);
        if (typeof wx !== 'undefined' && wx.onWindowResize)
            wx.onWindowResize(resize);
    }
    /**
     * 初始化主画布，并应用高清视网膜屏(Retina/DPR)坐标映射
     */
    initCanvas() {
        let canvas;
        if (typeof wx !== 'undefined' && wx.createCanvas) {
            canvas = wx.createCanvas();
        }
        else if (typeof window !== 'undefined' && window.canvas) {
            canvas = window.canvas;
        }
        else {
            canvas = document.createElement('canvas');
            document.body.appendChild(canvas);
        }
        const sys = WechatBridge.getSystemInfo();
        this.logicalWidth = sys.windowWidth;
        this.logicalHeight = sys.windowHeight;
        this.dpr = Math.min(3, sys.pixelRatio || 1);
        // 微信小游戏主画布：全屏绘制以逻辑宽高为基础，避免双重缩放导致画面被放大数倍
        canvas.width = Math.round(this.logicalWidth * this.dpr);
        canvas.height = Math.round(this.logicalHeight * this.dpr);
        if (canvas.style) {
            canvas.style.width = `${this.logicalWidth}px`;
            canvas.style.height = `${this.logicalHeight}px`;
        }
        const ctx = canvas.getContext('2d');
        // 微信环境中底层已做适配，无需二次 scale(dpr)
        // 触控映射：微信返回 client 坐标，逻辑比保持 1:1
        globalInput.setScale(1, 1);
        console.log(`[Engine] 画布初始化完成: 逻辑分辨率=${this.logicalWidth}x${this.logicalHeight}, DPR=${this.dpr}`);
        return { canvas, ctx };
    }
    bindInput() {
        globalInput.onTouchStart((p) => globalSceneManager.handleTouchStart(p));
        globalInput.onTouchMove((p) => globalSceneManager.handleTouchMove(p));
        globalInput.onTouchEnd((p) => globalSceneManager.handleTouchEnd(p));
    }
    bindLifecycle() {
        globalEvents.on('app:hide', () => {
            this.pause();
            globalAudio.pauseBgm();
        });
        globalEvents.on('app:show', () => {
            this.resume();
            globalAudio.resumeBgm();
        });
    }
    /**
     * 启动游戏主循环
     */
    start() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        this.isPaused = false;
        this.lastTime = NaN;
        this.loop = this.loop.bind(this);
        this.animFrameId = this.requestFrame(this.loop);
        console.log('[Engine] 游戏主循环已启动');
    }
    /**
     * 暂停游戏
     */
    pause() {
        this.isPaused = true;
    }
    /**
     * 恢复游戏
     */
    resume() {
        if (!this.isPaused)
            return;
        this.isPaused = false;
        this.lastTime = NaN; // First resumed frame establishes the RAF clock origin.
    }
    /**
     * 每一帧的主调度循环
     */
    loop(currentTime) {
        if (!this.isRunning)
            return;
        this.animFrameId = this.requestFrame(this.loop);
        if (this.isPaused) {
            return;
        }
        // 计算帧时间步长（秒）
        // RAF timestamps and wx performance may use different origins/units.
        // Establish both endpoints from the same frame clock; never mix them.
        const frameTime = Number.isFinite(currentTime) ? currentTime : Date.now();
        const elapsed = Number.isFinite(this.lastTime) ? Math.max(0, (frameTime - this.lastTime) / 1000) : 0;
        this.lastTime = frameTime;
        // 限制最大 dt 防止切前台或微卡顿时物理穿越
        const dt = Math.min(elapsed, 0.1);
        // 计算实时 FPS
        this.calcFps(elapsed);
        // 1. 逻辑更新
        globalSceneManager.update(dt);
        // 2. 清屏与画面渲染
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        globalSceneManager.render(this.ctx);
        // 3. 绘制统计面板（可选）
        if (this.showStats) {
            this.renderStats(this.ctx);
        }
    }
    calcFps(elapsed) {
        this.frameCount++;
        this.fpsTimer += elapsed;
        if (this.fpsTimer >= 0.5) {
            this.fps = Math.round(this.frameCount / this.fpsTimer);
            this.frameCount = 0;
            this.fpsTimer = 0;
        }
    }
    /**
     * 绘制轻量级实时性能与环境诊断面板
     */
    renderStats(ctx) {
        const sys = WechatBridge.getSystemInfo();
        const topY = Math.max(sys.statusBarHeight, 10);
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(10, topY, 115, 34);
        ctx.fillStyle = this.fps >= 50 ? '#00e676' : this.fps >= 30 ? '#ffb300' : '#ff5252';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`FPS: ${this.fps}`, 16, topY + 14);
        ctx.fillStyle = '#b0bec5';
        ctx.font = '10px monospace';
        ctx.fillText(`${this.logicalWidth}x${this.logicalHeight} (DPR:${this.dpr.toFixed(1)})`, 16, topY + 26);
        ctx.restore();
    }
    getContext() {
        return this.ctx;
    }
    getCanvas() {
        return this.canvas;
    }
}

/**
 * 场景抽象基类
 * 定义游戏场景标准生命周期与渲染交互接口
 */
class Scene {
    constructor(name) {
        this.name = name;
    }
}

class BootScene extends Scene {
    constructor() { super('BootScene'); }
    onEnter() { }
    onUpdate() { globalSceneManager.switchScene('MainGameScene'); }
    onRender() { }
    onExit() { }
}

/**
 * 资源加载与缓存管理器
 * 负责小游戏图片、纹理等资源的统一异步预加载与运行时存取
 */
class ResourceManager {
    constructor() {
        this.images = new Map();
    }
    /**
     * 单张图片异步加载
     */
    loadImage(key, url) {
        if (this.images.has(key)) {
            return Promise.resolve(this.images.get(key));
        }
        return new Promise((resolve, reject) => {
            let img;
            if (typeof wx !== 'undefined' && wx.createImage) {
                img = wx.createImage();
            }
            else {
                img = new Image();
            }
            img.onload = () => {
                this.images.set(key, img);
                resolve(img);
            };
            img.onerror = (err) => {
                console.error(`[ResourceManager] 加载图片失败: key=${key}, url=${url}`, err);
                reject(err);
            };
            img.src = url;
        });
    }
    /**
     * 批量加载图片队列，支持进度回调
     */
    async loadImages(items, onProgress) {
        const total = items.length;
        if (total === 0) {
            onProgress?.(0, 0);
            return;
        }
        let loaded = 0;
        const promises = items.map(async (item) => {
            try {
                await this.loadImage(item.key, item.url);
            }
            catch (e) {
                console.warn(`[ResourceManager] 资源跳过或加载异常: ${item.key}`);
            }
            finally {
                loaded++;
                onProgress?.(loaded, total);
            }
        });
        await Promise.all(promises);
    }
    /**
     * 获取已缓存的图片
     */
    getImage(key) {
        return this.images.get(key);
    }
    /**
     * 检查是否已缓存
     */
    hasImage(key) {
        return this.images.has(key);
    }
    /**
     * 释放并清空资源
     */
    clear() {
        this.images.clear();
    }
}
const globalResources = new ResourceManager();

var collisionData = {
  "shapes": [
    {
      "id": "e97b0817-10db-41de-a8a9-40a7b27fb2ca",
      "kind": "wall",
      "points": [
        {
          "x": 269,
          "y": 540
        },
        {
          "x": 263,
          "y": 606
        },
        {
          "x": 179,
          "y": 606
        },
        {
          "x": 170,
          "y": 556
        },
        {
          "x": 138,
          "y": 554
        },
        {
          "x": 138,
          "y": 567
        },
        {
          "x": 158,
          "y": 589
        },
        {
          "x": 161,
          "y": 612
        },
        {
          "x": 155,
          "y": 616
        },
        {
          "x": 157,
          "y": 640
        },
        {
          "x": 147,
          "y": 643
        },
        {
          "x": 130,
          "y": 642
        },
        {
          "x": 119,
          "y": 631
        },
        {
          "x": 97,
          "y": 606
        },
        {
          "x": 91,
          "y": 579
        },
        {
          "x": 63,
          "y": 580
        },
        {
          "x": 62,
          "y": 628
        },
        {
          "x": 98,
          "y": 630
        },
        {
          "x": 102,
          "y": 653
        },
        {
          "x": 99,
          "y": 696
        },
        {
          "x": 153,
          "y": 697
        },
        {
          "x": 158,
          "y": 741
        },
        {
          "x": 24,
          "y": 741
        },
        {
          "x": 17,
          "y": 711
        },
        {
          "x": 32,
          "y": 478
        },
        {
          "x": 270,
          "y": 477
        }
      ]
    },
    {
      "id": "7fd8eb23-f6fe-4faa-bc17-69236c912386",
      "kind": "wall",
      "points": [
        {
          "x": 150,
          "y": 695
        },
        {
          "x": 422,
          "y": 695
        },
        {
          "x": 426,
          "y": 613
        },
        {
          "x": 444,
          "y": 614
        },
        {
          "x": 450,
          "y": 636
        },
        {
          "x": 446,
          "y": 738
        },
        {
          "x": 156,
          "y": 738
        }
      ]
    },
    {
      "id": "c5ff09ab-09c8-4b25-b479-14cc9eeeeed4",
      "kind": "wall",
      "points": [
        {
          "x": 267,
          "y": 537
        },
        {
          "x": 277,
          "y": 537
        },
        {
          "x": 278,
          "y": 566
        },
        {
          "x": 303,
          "y": 563
        },
        {
          "x": 311,
          "y": 563
        },
        {
          "x": 314,
          "y": 582
        },
        {
          "x": 373,
          "y": 580
        },
        {
          "x": 379,
          "y": 539
        },
        {
          "x": 423,
          "y": 538
        },
        {
          "x": 425,
          "y": 575
        },
        {
          "x": 447,
          "y": 575
        },
        {
          "x": 448,
          "y": 574
        },
        {
          "x": 449,
          "y": 574
        },
        {
          "x": 451,
          "y": 574
        },
        {
          "x": 449,
          "y": 476
        },
        {
          "x": 266,
          "y": 474
        },
        {
          "x": 263,
          "y": 534
        }
      ]
    },
    {
      "id": "bd1a0bdb-7d22-48fe-abd4-ff67eb4b61c3",
      "kind": "wall",
      "points": [
        {
          "x": 106,
          "y": 475
        },
        {
          "x": 109,
          "y": 382
        },
        {
          "x": 77,
          "y": 380
        },
        {
          "x": 82,
          "y": 346
        },
        {
          "x": 121,
          "y": 344
        },
        {
          "x": 123,
          "y": 362
        },
        {
          "x": 152,
          "y": 362
        },
        {
          "x": 155,
          "y": 348
        },
        {
          "x": 180,
          "y": 350
        },
        {
          "x": 182,
          "y": 328
        },
        {
          "x": 201,
          "y": 327
        },
        {
          "x": 200,
          "y": 444
        },
        {
          "x": 286,
          "y": 442
        },
        {
          "x": 292,
          "y": 303
        },
        {
          "x": 289,
          "y": 249
        },
        {
          "x": 50,
          "y": 247
        },
        {
          "x": 31,
          "y": 476
        }
      ]
    },
    {
      "id": "643e74a5-7bd9-47fd-8da0-fca1b89c90d7",
      "kind": "wall",
      "points": [
        {
          "x": 290,
          "y": 308
        },
        {
          "x": 353,
          "y": 307
        },
        {
          "x": 352,
          "y": 350
        },
        {
          "x": 398,
          "y": 349
        },
        {
          "x": 399,
          "y": 313
        },
        {
          "x": 429,
          "y": 312
        },
        {
          "x": 430,
          "y": 309
        },
        {
          "x": 432,
          "y": 382
        },
        {
          "x": 455,
          "y": 382
        },
        {
          "x": 456,
          "y": 252
        },
        {
          "x": 287,
          "y": 250
        }
      ]
    },
    {
      "id": "3957ea6a-f16f-4ae9-9495-f5903ee34520",
      "kind": "wall",
      "points": [
        {
          "x": 315,
          "y": 398
        },
        {
          "x": 311,
          "y": 423
        },
        {
          "x": 312,
          "y": 445
        },
        {
          "x": 363,
          "y": 444
        },
        {
          "x": 362,
          "y": 400
        }
      ]
    },
    {
      "id": "d86bad4d-fd64-48d3-b334-25949d91a599",
      "kind": "wall",
      "points": [
        {
          "x": 429,
          "y": 413
        },
        {
          "x": 428,
          "y": 483
        },
        {
          "x": 432,
          "y": 561
        },
        {
          "x": 451,
          "y": 571
        },
        {
          "x": 455,
          "y": 423
        },
        {
          "x": 452,
          "y": 413
        }
      ]
    },
    {
      "id": "ec98b09f-0ba7-4410-af5e-05e17c48739e",
      "kind": "wall",
      "points": [
        {
          "x": 539,
          "y": 409
        },
        {
          "x": 539,
          "y": 498
        },
        {
          "x": 562,
          "y": 498
        },
        {
          "x": 565,
          "y": 578
        },
        {
          "x": 585,
          "y": 579
        },
        {
          "x": 587,
          "y": 577
        },
        {
          "x": 589,
          "y": 432
        },
        {
          "x": 581,
          "y": 374
        },
        {
          "x": 563,
          "y": 373
        },
        {
          "x": 561,
          "y": 406
        }
      ]
    },
    {
      "id": "8e2a701d-b2c4-4ab8-bb83-ec235474b56b",
      "kind": "wall",
      "points": [
        {
          "x": 83,
          "y": 247
        },
        {
          "x": 85,
          "y": 219
        },
        {
          "x": 121,
          "y": 218
        },
        {
          "x": 127,
          "y": 149
        },
        {
          "x": 124,
          "y": 120
        },
        {
          "x": 129,
          "y": 80
        },
        {
          "x": 127,
          "y": 20
        },
        {
          "x": 64,
          "y": 19
        },
        {
          "x": 48,
          "y": 246
        }
      ]
    },
    {
      "id": "e66bc22e-51d2-4da4-9aab-c8d1bf89eb0f",
      "kind": "wall",
      "points": [
        {
          "x": 163,
          "y": 109
        },
        {
          "x": 198,
          "y": 108
        },
        {
          "x": 196,
          "y": 221
        },
        {
          "x": 320,
          "y": 219
        },
        {
          "x": 323,
          "y": 107
        },
        {
          "x": 358,
          "y": 108
        },
        {
          "x": 360,
          "y": 108
        },
        {
          "x": 361,
          "y": 81
        },
        {
          "x": 362,
          "y": 20
        },
        {
          "x": 125,
          "y": 18
        },
        {
          "x": 128,
          "y": 79
        },
        {
          "x": 160,
          "y": 83
        }
      ]
    },
    {
      "id": "786e0382-eecb-49e9-bebb-e9f20c4b43ce",
      "kind": "wall",
      "points": [
        {
          "x": 360,
          "y": 84
        },
        {
          "x": 403,
          "y": 83
        },
        {
          "x": 406,
          "y": 207
        },
        {
          "x": 436,
          "y": 208
        },
        {
          "x": 435,
          "y": 216
        },
        {
          "x": 507,
          "y": 217
        },
        {
          "x": 507,
          "y": 194
        },
        {
          "x": 494,
          "y": 180
        },
        {
          "x": 496,
          "y": 143
        },
        {
          "x": 503,
          "y": 135
        },
        {
          "x": 507,
          "y": 108
        },
        {
          "x": 570,
          "y": 106
        },
        {
          "x": 566,
          "y": 19
        },
        {
          "x": 359,
          "y": 17
        },
        {
          "x": 357,
          "y": 81
        }
      ]
    },
    {
      "id": "de382f0a-31c3-4846-a813-183542b24824",
      "kind": "wall",
      "points": [
        {
          "x": 559,
          "y": 199
        },
        {
          "x": 562,
          "y": 331
        },
        {
          "x": 583,
          "y": 331
        },
        {
          "x": 585,
          "y": 331
        },
        {
          "x": 586,
          "y": 247
        },
        {
          "x": 623,
          "y": 247
        },
        {
          "x": 621,
          "y": 19
        },
        {
          "x": 563,
          "y": 18
        },
        {
          "x": 568,
          "y": 106
        },
        {
          "x": 562,
          "y": 195
        }
      ]
    },
    {
      "id": "4d0930dd-d84c-43d2-91c5-5f4a0fb359ae",
      "kind": "wall",
      "points": [
        {
          "x": 622,
          "y": 164
        },
        {
          "x": 693,
          "y": 165
        },
        {
          "x": 693,
          "y": 211
        },
        {
          "x": 910,
          "y": 211
        },
        {
          "x": 910,
          "y": 120
        },
        {
          "x": 966,
          "y": 120
        },
        {
          "x": 967,
          "y": 258
        },
        {
          "x": 1023,
          "y": 260
        },
        {
          "x": 1021,
          "y": 208
        },
        {
          "x": 989,
          "y": 207
        },
        {
          "x": 983,
          "y": 64
        },
        {
          "x": 892,
          "y": 63
        },
        {
          "x": 891,
          "y": 85
        },
        {
          "x": 697,
          "y": 86
        },
        {
          "x": 696,
          "y": 65
        },
        {
          "x": 618,
          "y": 64
        }
      ]
    },
    {
      "id": "bb686bbc-96c3-4d4c-98c1-d5e22ba7e20a",
      "kind": "wall",
      "points": [
        {
          "x": 708,
          "y": 472
        },
        {
          "x": 707,
          "y": 528
        },
        {
          "x": 717,
          "y": 529
        },
        {
          "x": 718,
          "y": 520
        },
        {
          "x": 861,
          "y": 519
        },
        {
          "x": 864,
          "y": 529
        },
        {
          "x": 876,
          "y": 529
        },
        {
          "x": 873,
          "y": 470
        }
      ]
    },
    {
      "id": "29b89d0d-2676-4098-b7e9-f6b4d2812d75",
      "kind": "wall",
      "points": [
        {
          "x": 655,
          "y": 365
        },
        {
          "x": 658,
          "y": 446
        },
        {
          "x": 709,
          "y": 445
        },
        {
          "x": 708,
          "y": 373
        },
        {
          "x": 685,
          "y": 365
        }
      ]
    },
    {
      "id": "82fbcb1c-005e-4f43-a76e-528f7bc1a29d",
      "kind": "wall",
      "points": [
        {
          "x": 746,
          "y": 379
        },
        {
          "x": 749,
          "y": 449
        },
        {
          "x": 754,
          "y": 448
        },
        {
          "x": 756,
          "y": 440
        },
        {
          "x": 835,
          "y": 439
        },
        {
          "x": 842,
          "y": 450
        },
        {
          "x": 845,
          "y": 450
        },
        {
          "x": 847,
          "y": 379
        }
      ]
    },
    {
      "id": "0ad042de-8db9-45a4-ad88-56d7aaf5bea1",
      "kind": "wall",
      "points": [
        {
          "x": 889,
          "y": 441
        },
        {
          "x": 885,
          "y": 369
        },
        {
          "x": 707,
          "y": 371
        },
        {
          "x": 695,
          "y": 348
        },
        {
          "x": 695,
          "y": 295
        },
        {
          "x": 714,
          "y": 283
        },
        {
          "x": 882,
          "y": 284
        },
        {
          "x": 917,
          "y": 289
        },
        {
          "x": 930,
          "y": 300
        },
        {
          "x": 932,
          "y": 320
        },
        {
          "x": 935,
          "y": 358
        },
        {
          "x": 939,
          "y": 371
        },
        {
          "x": 938,
          "y": 444
        }
      ]
    },
    {
      "id": "acbf8524-ba42-4db1-a5b3-6b471b65a36b",
      "kind": "wall",
      "points": [
        {
          "x": 1073,
          "y": 345
        },
        {
          "x": 1072,
          "y": 370
        },
        {
          "x": 1056,
          "y": 370
        },
        {
          "x": 1060,
          "y": 469
        },
        {
          "x": 1097,
          "y": 505
        },
        {
          "x": 1139,
          "y": 507
        },
        {
          "x": 1192,
          "y": 507
        },
        {
          "x": 1219,
          "y": 464
        },
        {
          "x": 1225,
          "y": 381
        },
        {
          "x": 1250,
          "y": 381
        },
        {
          "x": 1254,
          "y": 381
        },
        {
          "x": 1252,
          "y": 350
        },
        {
          "x": 1251,
          "y": 323
        },
        {
          "x": 1159,
          "y": 320
        },
        {
          "x": 1083,
          "y": 322
        }
      ]
    },
    {
      "id": "f0add549-20cb-478e-ae53-18de877824b6",
      "kind": "wall",
      "points": [
        {
          "x": 837,
          "y": 727
        },
        {
          "x": 842,
          "y": 811
        },
        {
          "x": 881,
          "y": 812
        },
        {
          "x": 883,
          "y": 774
        },
        {
          "x": 972,
          "y": 773
        },
        {
          "x": 979,
          "y": 810
        },
        {
          "x": 1023,
          "y": 809
        },
        {
          "x": 1037,
          "y": 812
        },
        {
          "x": 1045,
          "y": 884
        },
        {
          "x": 1042,
          "y": 899
        },
        {
          "x": 1120,
          "y": 899
        },
        {
          "x": 1114,
          "y": 610
        },
        {
          "x": 1014,
          "y": 609
        },
        {
          "x": 1014,
          "y": 629
        },
        {
          "x": 936,
          "y": 628
        },
        {
          "x": 933,
          "y": 610
        },
        {
          "x": 808,
          "y": 609
        },
        {
          "x": 806,
          "y": 661
        },
        {
          "x": 851,
          "y": 662
        },
        {
          "x": 855,
          "y": 692
        },
        {
          "x": 1043,
          "y": 686
        },
        {
          "x": 1043,
          "y": 725
        },
        {
          "x": 1022,
          "y": 723
        }
      ]
    },
    {
      "id": "fc35e598-e3a8-44ea-a8f4-a9f2517e510f",
      "kind": "furniture",
      "points": [
        {
          "x": 1027,
          "y": 42
        },
        {
          "x": 1030,
          "y": 128
        },
        {
          "x": 1074,
          "y": 128
        },
        {
          "x": 1074,
          "y": 42
        }
      ]
    }
  ],
  "doors": [
    {
      "id": "parents",
      "x": 442,
      "y": 230.5,
      "w": 30,
      "h": 53
    },
    {
      "id": "player",
      "x": 442.5,
      "y": 401.5,
      "w": 29,
      "h": 61
    },
    {
      "id": "nursery",
      "x": 438,
      "y": 599.5,
      "w": 30,
      "h": 55
    },
    {
      "id": "bathroom",
      "x": 533,
      "y": 207.5,
      "w": 48,
      "h": 29
    },
    {
      "id": "computer",
      "x": 781,
      "y": 642.5,
      "w": 50,
      "h": 21
    }
  ]
};

const rooms = [
    { id: 'parents', name: '父母卧室', x: 70, y: 35, w: 380, h: 215 },
    { id: 'player', name: '你的卧室', x: 55, y: 265, w: 390, h: 210 },
    { id: 'nursery', name: '婴儿房', x: 40, y: 495, w: 400, h: 205 },
    { id: 'bathroom', name: '卫生间', x: 470, y: 35, w: 135, h: 180 },
    { id: 'living', name: '客厅', x: 590, y: 105, w: 375, h: 505 },
    { id: 'kitchen', name: '厨房', x: 985, y: 35, w: 345, h: 215 },
    { id: 'dining', name: '餐厅', x: 975, y: 260, w: 320, h: 350 },
    { id: 'computer', name: '电脑房', x: 590, y: 665, w: 495, h: 215 },
    { id: 'foyer', name: '玄关', x: 1320, y: 275, w: 170, h: 275 },
];
const floors = [...rooms,
    { x: 455, y: 215, w: 115, h: 505 },
    { x: 400, y: 215, w: 210, h: 40 }, { x: 420, y: 375, w: 185, h: 60 },
    { x: 420, y: 557, w: 150, h: 59 }, { x: 490, y: 180, w: 65, h: 100 },
    { x: 550, y: 270, w: 490, h: 345 },
    { x: 920, y: 160, w: 115, h: 435 },
    { x: 985, y: 220, w: 310, h: 80 },
    { x: 760, y: 590, w: 60, h: 100 },
    { x: 1270, y: 375, w: 80, h: 65 },
];
const walls = [
    // Nursery artwork has thick wall faces. Reserve them explicitly so the
    // broad room/doorway floor rectangles cannot make the walls walkable.
    { x: 18, y: 490, w: 47, h: 220 },
    { x: 40, y: 490, w: 415, h: 55 },
    // Actor positions are body centers; feet are drawn 23px lower. Shift the
    // jamb collision up by that offset so visible feet can cross the opening.
    { x: 430, y: 495, w: 25, h: 62 },
    { x: 430, y: 593, w: 25, h: 147 },
    { x: 18, y: 680, w: 437, h: 60 },
    // Bathroom south wall follows the marked correction; doorway x=510..565.
    { x: 440, y: 195, w: 70, h: 25 }, { x: 565, y: 195, w: 40, h: 50 },
    // Solid partitions must override the broad floor unions.
    { x: 440, y: 30, w: 22, h: 177 },
    { x: 430, y: 265, w: 25, h: 110 },
    { x: 430, y: 435, w: 25, h: 55 },
    { x: 55, y: 245, w: 350, h: 20 },
    { x: 565, y: 245, w: 22, h: 80 },
    { x: 565, y: 385, w: 22, h: 195 },
    { x: 635, y: 615, w: 114, h: 44 },
    { x: 816, y: 615, w: 284, h: 44 },
    { x: 1295, y: 280, w: 23, h: 95 },
    { x: 1295, y: 455, w: 23, h: 155 },
];
const furniture = [
    { x: 195, y: 50, w: 125, h: 163 }, { x: 396, y: 45, w: 40, h: 145 },
    { x: 193, y: 285, w: 95, h: 140 }, { x: 87, y: 285, w: 85, h: 58 },
    { x: 172, y: 515, w: 83, h: 85 }, { x: 55, y: 540, w: 82, h: 90 },
    { x: 465, y: 45, w: 110, h: 61 }, { x: 565, y: 130, w: 37, h: 46 },
    { x: 685, y: 145, w: 220, h: 63 },
    { x: 687, y: 287, w: 240, h: 74 }, { x: 656, y: 368, w: 52, h: 78 },
    { x: 876, y: 368, w: 66, h: 78 }, { x: 744, y: 382, w: 111, h: 55 },
    { x: 715, y: 474, w: 180, h: 48 },
    { x: 1005, y: 40, w: 296, h: 82 }, { x: 1100, y: 150, w: 131, h: 58 },
    { x: 1074, y: 342, w: 130, h: 160 },
    { x: 840, y: 725, w: 190, h: 82 }, { x: 662, y: 742, w: 85, h: 91 },
    { x: 1360, y: 300, w: 102, h: 47 },
];
const doorDefinitions = collisionData.doors ?? [
    { id: 'parents', x: 440, y: 230, w: 18, h: 46 },
    { id: 'player', x: 437, y: 404, w: 18, h: 58 },
    { id: 'nursery', x: 442, y: 598, w: 25, h: 36 },
    { id: 'bathroom', x: 537.5, y: 215, w: 55, h: 14 },
    { id: 'computer', x: 786, y: 644, w: 60, h: 14 },
];
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const collisionShapes = collisionData.shapes ??
    [...walls.map(r => ({ ...r, kind: 'wall' })), ...furniture.map(r => ({ ...r, kind: 'furniture' }))].map((r, i) => ({ id: `original-${i}`, kind: r.kind, points: [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }] }));
function inPolygon(p, points) {
    let hit = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i], b = points[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)
            hit = !hit;
    }
    return hit;
}
// Test polygon edges against the actor's square footprint, including thin walls.
function blockedByShape(p, radius, points, halfHeight = radius) {
    if (inPolygon(p, points))
        return true;
    const minX = p.x - radius, maxX = p.x + radius, minY = p.y - halfHeight, maxY = p.y + halfHeight;
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        let lo = 0, hi = 1;
        for (const [v, d, min, max] of [[a.x, b.x - a.x, minX, maxX], [a.y, b.y - a.y, minY, maxY]]) {
            if (Math.abs(d) < 1e-9) {
                if (v < min || v > max) {
                    hi = -1;
                    break;
                }
            }
            else {
                const t1 = (min - v) / d, t2 = (max - v) / d;
                lo = Math.max(lo, Math.min(t1, t2));
                hi = Math.min(hi, Math.max(t1, t2));
            }
        }
        if (lo <= hi)
            return true;
    }
    return false;
}
// Subtract the union of door rectangles from the queried footprint, not from
// the saved polygons. This retains the wall beside a doorway and supports
// concave/self-crossing polygons without rewriting the user's drawing.
function outsideDoors(p, radius) {
    let pieces = [{ x: p.x - radius, y: p.y - radius, w: radius * 2, h: radius * 2 }];
    for (const d of doorDefinitions) {
        const next = [];
        for (const r of pieces) {
            const l = Math.max(r.x, d.x - d.w / 2), t = Math.max(r.y, d.y - d.h / 2);
            const right = Math.min(r.x + r.w, d.x + d.w / 2), bottom = Math.min(r.y + r.h, d.y + d.h / 2);
            if (l >= right || t >= bottom) {
                next.push(r);
                continue;
            }
            if (t > r.y)
                next.push({ x: r.x, y: r.y, w: r.w, h: t - r.y });
            if (bottom < r.y + r.h)
                next.push({ x: r.x, y: bottom, w: r.w, h: r.y + r.h - bottom });
            if (l > r.x)
                next.push({ x: r.x, y: t, w: l - r.x, h: bottom - t });
            if (right < r.x + r.w)
                next.push({ x: right, y: t, w: r.x + r.w - right, h: bottom - t });
        }
        pieces = next;
    }
    return pieces;
}
function walkable(p, closed = new Set(), radius = 10) {
    const corners = [{ x: p.x - radius, y: p.y - radius }, { x: p.x + radius, y: p.y - radius }, { x: p.x - radius, y: p.y + radius }, { x: p.x + radius, y: p.y + radius }];
    const pieces = outsideDoors(p, radius);
    return corners.every(c => inside(c, { x: 0, y: 0, w: 1580, h: 996 })) && !collisionShapes.some(s => pieces.some(r => blockedByShape({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, r.w / 2, s.points, r.h / 2))) && !doorDefinitions.some(d => closed.has(d.id) && Math.abs(p.x - d.x) < d.w / 2 + radius && Math.abs(p.y - d.y) < d.h / 2 + radius);
}
function move(p, dx, dy, closed = new Set()) {
    // FOOT_Y: collision check offset below character center (where feet actually are).
    // FOOT_R: normal footprint half-size. SLIP_R: smaller half-size used when the normal
    // footprint catches on an irregular polygon vertex — allows the character to slide past
    // sharp corners at reduced speed rather than getting stuck completely.
    const FOOT_Y = 20, FOOT_R = 7, SLIP_R = 3;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 5));
    for (let i = 0; i < steps; i++) {
        const sx = dx / steps, sy = dy / steps;
        if (walkable({ x: p.x + sx, y: p.y + FOOT_Y }, closed, FOOT_R)) {
            p.x += sx;
        }
        else if (Math.abs(sx) > 0.01 && walkable({ x: p.x + sx, y: p.y + FOOT_Y }, closed, SLIP_R)) {
            p.x += sx; // 取消减速，贴墙原速滑动
        }
        if (walkable({ x: p.x, y: p.y + sy + FOOT_Y }, closed, FOOT_R)) {
            p.y += sy;
        }
        else if (Math.abs(sy) > 0.01 && walkable({ x: p.x, y: p.y + sy + FOOT_Y }, closed, SLIP_R)) {
            p.y += sy; // 取消减速，贴墙原速滑动
        }
    }
}
// Shared navigation grid; actors and seed validation use exactly the same collision geometry.
const navCells = new Map();
const navLinks = new Map();
function route(from, to) {
    const cell = 10, cols = 160, rows = 100;
    const key = (p) => Math.round(p.y / cell) * cols + Math.round(p.x / cell);
    const point = (k) => ({ x: (k % cols) * cell, y: Math.floor(k / cols) * cell });
    // Use the same foot-position check as move() so planned paths are always followable.
    const footOk = (p) => walkable({ x: p.x, y: p.y + 20 }, new Set(), 7);
    if (!navCells.size)
        for (let y = 1; y < rows; y++)
            for (let x = 1; x < cols; x++) {
                const p = { x: x * cell, y: y * cell };
                if (footOk(p))
                    navCells.set(key(p), p);
            }
    if (!navLinks.size)
        for (const [k, p] of navCells) {
            navLinks.set(k, [-1, 1, -cols, cols].map(step => k + step).filter(n => {
                const q = navCells.get(n);
                return q && distance(p, q) <= cell + 1 && footOk({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
            }));
        }
    const nearest = (p) => {
        let best = -1, min = Infinity;
        for (const [k, q] of navCells) {
            const d = distance(p, q);
            if (d < min) {
                best = k;
                min = d;
            }
        }
        return best;
    };
    const start = nearest(from), end = nearest(to), queue = [start], prev = new Map([[start, -1]]);
    for (let i = 0; i < queue.length && !prev.has(end); i++) {
        for (const next of navLinks.get(queue[i]) || []) {
            if (prev.has(next))
                continue;
            prev.set(next, queue[i]);
            queue.push(next);
        }
    }
    if (!prev.has(end))
        return [];
    const path = [];
    for (let k = end; k !== start && k !== -1; k = prev.get(k))
        path.unshift(point(k));
    return path;
}

// Small, pre-rendered original cues; bounded handles and no catch-up playback after resume.
class SoundService {
    constructor() {
        this.handles = new Map();
        this.volume = .55;
    }
    play(cue, source, listener) {
        if (!this.volume)
            return;
        try {
            let handle = this.handles.get(cue);
            if (!handle) {
                handle = typeof wx !== 'undefined' ? wx.createInnerAudioContext() : typeof Audio !== 'undefined' ? new Audio() : null;
                if (!handle)
                    return;
                handle.src = `assets/audio/${cue}.wav`;
                this.handles.set(cue, handle);
            }
            handle.volume = Math.min(1, this.volume * (source && listener ? 180 / (180 + distance(source, listener)) : 1));
            if (handle.stop)
                handle.stop();
            else {
                handle.pause();
                handle.currentTime = 0;
            }
            const promise = handle.play();
            if (promise?.catch)
                promise.catch(() => { });
        }
        catch { /* Missing/disabled audio must never interrupt gameplay. */ }
    }
    stop() { for (const h of this.handles.values()) {
        if (h.stop)
            h.stop();
        else
            h.pause();
    } }
    dispose() { this.stop(); for (const h of this.handles.values())
        h.destroy?.(); this.handles.clear(); }
}

// Generated by scripts/pack-characters.mjs
const characterFrames = { "girl-idle-0": { "x": 0, "y": 0, "w": 96, "h": 128 }, "girl-idle-1": { "x": 96, "y": 0, "w": 96, "h": 128 }, "girl-idle-2": { "x": 192, "y": 0, "w": 96, "h": 128 }, "father-idle-0": { "x": 288, "y": 0, "w": 96, "h": 128 }, "father-idle-1": { "x": 384, "y": 0, "w": 96, "h": 128 }, "father-idle-2": { "x": 480, "y": 0, "w": 96, "h": 128 }, "father-angry-0": { "x": 576, "y": 0, "w": 96, "h": 128 }, "father-angry-1": { "x": 672, "y": 0, "w": 96, "h": 128 }, "father-angry-2": { "x": 768, "y": 0, "w": 96, "h": 128 }, "mother-idle-0": { "x": 864, "y": 0, "w": 96, "h": 128 }, "mother-idle-1": { "x": 0, "y": 128, "w": 96, "h": 128 }, "mother-idle-2": { "x": 96, "y": 128, "w": 96, "h": 128 }, "mother-angry-0": { "x": 192, "y": 128, "w": 96, "h": 128 }, "mother-angry-1": { "x": 288, "y": 128, "w": 96, "h": 128 }, "mother-angry-2": { "x": 384, "y": 128, "w": 96, "h": 128 }, "baby-idle-0": { "x": 480, "y": 128, "w": 96, "h": 128 }, "baby-idle-1": { "x": 576, "y": 128, "w": 96, "h": 128 }, "baby-idle-2": { "x": 672, "y": 128, "w": 96, "h": 128 }, "girl-walk-0-0": { "x": 768, "y": 128, "w": 96, "h": 128 }, "girl-walk-0-1": { "x": 864, "y": 128, "w": 96, "h": 128 }, "girl-walk-1-0": { "x": 0, "y": 256, "w": 96, "h": 128 }, "girl-walk-1-1": { "x": 96, "y": 256, "w": 96, "h": 128 }, "girl-walk-2-0": { "x": 192, "y": 256, "w": 96, "h": 128 }, "girl-walk-2-1": { "x": 288, "y": 256, "w": 96, "h": 128 }, "father-walk-0-0": { "x": 384, "y": 256, "w": 96, "h": 128 }, "father-walk-0-1": { "x": 480, "y": 256, "w": 96, "h": 128 }, "father-walk-1-0": { "x": 576, "y": 256, "w": 96, "h": 128 }, "father-walk-1-1": { "x": 672, "y": 256, "w": 96, "h": 128 }, "father-walk-2-0": { "x": 768, "y": 256, "w": 96, "h": 128 }, "father-walk-2-1": { "x": 864, "y": 256, "w": 96, "h": 128 }, "father-angrywalk-0-0": { "x": 0, "y": 384, "w": 96, "h": 128 }, "father-angrywalk-0-1": { "x": 96, "y": 384, "w": 96, "h": 128 }, "father-angrywalk-1-0": { "x": 192, "y": 384, "w": 96, "h": 128 }, "father-angrywalk-1-1": { "x": 288, "y": 384, "w": 96, "h": 128 }, "father-angrywalk-2-0": { "x": 384, "y": 384, "w": 96, "h": 128 }, "father-angrywalk-2-1": { "x": 480, "y": 384, "w": 96, "h": 128 }, "mother-walk-0-0": { "x": 576, "y": 384, "w": 96, "h": 128 }, "mother-walk-0-1": { "x": 672, "y": 384, "w": 96, "h": 128 }, "mother-walk-1-0": { "x": 768, "y": 384, "w": 96, "h": 128 }, "mother-walk-1-1": { "x": 864, "y": 384, "w": 96, "h": 128 }, "mother-walk-2-0": { "x": 0, "y": 512, "w": 96, "h": 128 }, "mother-walk-2-1": { "x": 96, "y": 512, "w": 96, "h": 128 }, "mother-angrywalk-0-0": { "x": 192, "y": 512, "w": 96, "h": 128 }, "mother-angrywalk-0-1": { "x": 288, "y": 512, "w": 96, "h": 128 }, "mother-angrywalk-1-0": { "x": 384, "y": 512, "w": 96, "h": 128 }, "mother-angrywalk-1-1": { "x": 480, "y": 512, "w": 96, "h": 128 }, "mother-angrywalk-2-0": { "x": 576, "y": 512, "w": 96, "h": 128 }, "mother-angrywalk-2-1": { "x": 672, "y": 512, "w": 96, "h": 128 } };

class CharacterSprites {
    constructor() {
        this.motion = new Map();
    }
    load() {
        return Promise.all([
            globalResources.loadImage('parents', 'assets/images/parents-runtime.png'),
            globalResources.loadImage('characters', 'assets/images/characters-runtime.png'),
            globalResources.loadImage('girl-front', 'assets/images/girl-front.png'),
            globalResources.loadImage('girl-side', 'assets/images/girl-side.png'),
            globalResources.loadImage('girl-back', 'assets/images/girl-back.png'),
            globalResources.loadImage('girl-eat-front', 'assets/images/girl-eat-front.png'),
            globalResources.loadImage('girl-eat-side', 'assets/images/girl-eat-side.png'),
            globalResources.loadImage('girl-eat-back', 'assets/images/girl-eat-back.png'),
            globalResources.loadImage('girl-stun-front', 'assets/images/girl-stun-front.png'),
            globalResources.loadImage('girl-stun-side', 'assets/images/girl-stun-side.png'),
            globalResources.loadImage('girl-stun-back', 'assets/images/girl-stun-back.png'),
        ]);
    }
    reset() { this.motion.clear(); }
    track(id, p, dt = 1 / 60, inputDir) {
        const old = this.motion.get(id), dx = old ? p.x - old.x : 0, dy = old ? p.y - old.y : 0, travel = Math.hypot(dx, dy);
        const moving = travel > .02 && travel < 30, speed = moving ? travel / Math.max(.001, dt) : 0;
        const blend = 1 - Math.exp(-18 * dt);
        // 如果有输入方向，优先使用输入方向判定朝向
        const refX = inputDir ? inputDir.x : dx;
        const refY = inputDir ? inputDir.y : dy;
        const turning = Math.hypot(refX, refY) > 0.05;
        this.motion.set(id, {
            x: p.x, y: p.y,
            direction: turning ? (Math.abs(refX) > Math.abs(refY) ? 2 : refY < 0 ? 1 : 0) : old?.direction ?? 0,
            left: turning && Math.abs(refX) > Math.abs(refY) ? refX < 0 : old?.left ?? false,
            stride: (old?.stride ?? 0) + (moving ? travel : 0), moving,
            amount: (old?.amount ?? 0) + ((moving ? 1 : 0) - (old?.amount ?? 0)) * blend,
            running: (old?.running ?? 0) + (Math.max(0, Math.min(1, (speed - 65) / 75)) - (old?.running ?? 0)) * blend
        });
    }
    draw(ctx, id, kind, p, angry = false, alpha = 1, pose = 'default') {
        if (kind === 'father' || kind === 'mother') {
            const img = globalResources.getImage('parents');
            if (img) {
                const state = this.motion.get(id), direction = state?.direction ?? 0;
                const col = direction === 1 ? 2 : direction === 2 ? 1 : 0, row = (kind === 'father' ? 0 : 2) + (angry ? 1 : 0);
                const moving = state?.moving ?? false, stride = state?.stride ?? 0;
                const stepFreq = angry ? 22 : 26;
                const phase = moving ? Math.sin(stride / stepFreq * Math.PI) : 0;
                const bob = moving ? Math.abs(phase) * (angry ? 2.8 : 1.8) : 0;
                const sway = moving ? phase * (angry ? 1.5 : 1.0) : 0;
                const tilt = moving ? phase * (angry ? 0.03 : 0.018) : 0;
                // 脚底动态接地阴影（双层立体柔化接地阴影）
                const shadowX = direction === 2 ? (state?.left ? 3.5 : -3.5) : 0;
                ctx.save();
                ctx.translate(p.x + shadowX, p.y + 23);
                // 外层柔和羽化环境光遮蔽阴影
                const outerRx = (angry ? 27 : 24) - bob * 0.4;
                const outerRy = 7.5 - bob * 0.2;
                const outerGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, outerRx);
                outerGrad.addColorStop(0, `rgba(0, 0, 0, ${(alpha * 0.45).toFixed(2)})`);
                outerGrad.addColorStop(0.65, `rgba(0, 0, 0, ${(alpha * 0.22).toFixed(2)})`);
                outerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = outerGrad;
                ctx.beginPath();
                ctx.ellipse(0, 0, outerRx, outerRy, 0, 0, Math.PI * 2);
                ctx.fill();
                // 内层浓实紧贴鞋底接触阴影
                const innerRx = (angry ? 18 : 16) - bob * 0.3;
                const innerRy = 4.2 - bob * 0.15;
                const innerGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, innerRx);
                innerGrad.addColorStop(0, `rgba(0, 0, 0, ${(alpha * 0.72).toFixed(2)})`);
                innerGrad.addColorStop(0.7, `rgba(0, 0, 0, ${(alpha * 0.35).toFixed(2)})`);
                innerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = innerGrad;
                ctx.beginPath();
                ctx.ellipse(0, 0, innerRx, innerRy, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                // 身体：应用 sway 左右重心晃动 + tilt 走姿微倾角 + bob 颠簸起伏
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.translate(p.x + sway, p.y + 23);
                if (direction === 2 && !state?.left)
                    ctx.scale(-1, 1);
                ctx.rotate(tilt);
                ctx.drawImage(img, col * 128, row * 128, 128, 128, -38, -71 + bob, 76, 76);
                ctx.restore();
                return true;
            }
        }
        if (kind === 'girl') {
            const state = this.motion.get(id), direction = state?.direction ?? 0;
            const isStun = pose === 'stun';
            const isEatOrCarry = pose === 'eat';
            const key = isStun
                ? (direction === 1 ? 'girl-stun-back' : direction === 2 ? 'girl-stun-side' : 'girl-stun-front')
                : isEatOrCarry
                    ? (direction === 1 ? 'girl-eat-back' : direction === 2 ? 'girl-eat-side' : 'girl-eat-front')
                    : (direction === 1 ? 'girl-back' : direction === 2 ? 'girl-side' : 'girl-front');
            const img = globalResources.getImage(key) || globalResources.getImage(direction === 1 ? 'girl-back' : direction === 2 ? 'girl-side' : 'girl-front');
            if (img) {
                const h = 70, w = 70;
                const stride = state?.stride ?? 0, moving = state?.moving ?? false;
                const phase = moving ? Math.sin(stride / 20 * Math.PI) : 0;
                const bob = moving ? Math.abs(phase) * 2.5 : 0;
                const sway = moving ? phase * 1.2 : 0;
                const tilt = moving ? phase * 0.025 : 0;
                // 定身被吓呆时的受惊微颤
                const shiver = isStun ? Math.sin(Date.now() * 0.045) * 1.0 : 0;
                // 脚底动态接地阴影（双层柔和渐变）
                const shadowX = direction === 2 ? (state?.left ? 3 : -3) : 0;
                ctx.save();
                ctx.translate(p.x + shadowX, p.y + 23 - 10);
                const gOuterRx = 18 - bob * 0.3;
                const gOuterRy = 5.5 - bob * 0.15;
                const gOuterGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, gOuterRx);
                gOuterGrad.addColorStop(0, `rgba(0, 0, 0, ${(alpha * 0.42).toFixed(2)})`);
                gOuterGrad.addColorStop(0.65, `rgba(0, 0, 0, ${(alpha * 0.18).toFixed(2)})`);
                gOuterGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = gOuterGrad;
                ctx.beginPath();
                ctx.ellipse(0, 0, gOuterRx, gOuterRy, 0, 0, Math.PI * 2);
                ctx.fill();
                const gInnerRx = 12 - bob * 0.25;
                const gInnerRy = 3.2 - bob * 0.1;
                const gInnerGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, gInnerRx);
                gInnerGrad.addColorStop(0, `rgba(0, 0, 0, ${(alpha * 0.68).toFixed(2)})`);
                gInnerGrad.addColorStop(0.7, `rgba(0, 0, 0, ${(alpha * 0.30).toFixed(2)})`);
                gInnerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = gInnerGrad;
                ctx.beginPath();
                ctx.ellipse(0, 0, gInnerRx, gInnerRy, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                // 身体：含 sway + tilt + shiver
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.translate(p.x + sway + shiver, p.y + 23);
                const flip = isEatOrCarry ? Boolean(state?.left) : !state?.left;
                if (direction === 2 && flip)
                    ctx.scale(-1, 1);
                ctx.rotate(tilt);
                ctx.drawImage(img, -w / 2, -h + bob, w, h);
                ctx.restore();
                return true;
            }
        }
        const image = globalResources.getImage('characters');
        if (!image)
            return false;
        const state = this.motion.get(id), direction = state?.direction ?? 0;
        const mode = state?.moving ? (angry ? 'angrywalk' : 'walk') : (angry ? 'angry' : 'idle');
        const index = Math.floor((state?.stride ?? 0) / 25) % 2;
        const frame = characterFrames[`${kind}-${mode}-${direction}${state?.moving ? '-' + index : ''}`] ?? characterFrames[`${kind}-idle-${direction}`];
        if (!frame)
            return false;
        const h = kind === 'girl' ? 60 : 66, w = h * .75;
        ctx.save();
        ctx.translate(p.x, p.y + 23);
        const fbGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, 18);
        fbGrad.addColorStop(0, `rgba(0, 0, 0, ${(alpha * 0.55).toFixed(2)})`);
        fbGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = fbGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, 18, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y + 23);
        if (direction === 2 && !!state?.left)
            ctx.scale(-1, 1);
        ctx.drawImage(image, frame.x, frame.y, 96, 128, -w / 2, -h * 120 / 128, w, h);
        ctx.restore();
        return true;
    }
    head(ctx, kind, x, y, angry, baby) {
        if (kind === 'father' || kind === 'mother') {
            const img = globalResources.getImage('parents');
            if (img) {
                const row = kind === 'father' ? 0 : 2;
                ctx.drawImage(img, 0, row * 128, 128, 86, x - 23, y - 26, 46, 31);
                return true;
            }
        }
        const img = globalResources.getImage('characters'), f = characterFrames[`${kind}-${angry && kind !== 'girl' && kind !== 'baby' ? 'angry' : 'idle'}-0`];
        if (!img || !f)
            return false;
        const w = baby ? 28 : 38;
        ctx.drawImage(img, f.x, f.y, f.w, 70, x - w / 2, y - 23, w, w * 70 / 96);
        return true;
    }
}

const TOY_PICKUP_CHATTER = {
    bear: [
        '哇，小熊身上还是暖呼呼的。',
        '抓到你了！走，带你去大冒险。',
        '小熊，今晚你来当我的侦察兵！',
    ],
    rabbit: [
        '长耳朵小兔，嘘，小点声哦。',
        '轻一点，别把兔兔的长耳朵压皱啦。',
        '抓住一只偷偷起夜不睡觉的小兔子！',
    ],
    dino: [
        '嗷呜——！暴龙小分队出击！',
        '哎呀，这只恐龙怎么这么沉呀！',
        '大恐龙，今晚命你负责保护我！',
    ],
};
const TOY_CARRY_CHATTER = {
    bear: [
        '毛茸茸的，抱起来真舒服……',
        '嘘，小熊别怕，妈妈睡得正香呢。',
        '小熊抱紧我，我们要悄悄走。',
        '要不要把你悄悄塞给妈妈当抱枕呢……',
    ],
    rabbit: [
        '你的长耳朵怎么一直在晃呀？',
        '走慢一点点，小兔胆子最小了。',
        '跟紧我，我们正在进行特工潜行！',
        '好乖好乖，马上就带你回小窝。',
    ],
    dino: [
        '尾巴硬邦邦的，大恐龙你是不是又长胖了？',
        '千万别掉地上了，塑料摔一下可响了……',
        '恐龙大哥，你的尖角差点戳到我下巴！',
        '呼……胳膊都快酸了，你快走几步呀。',
    ],
};
const CARRY_TIRED_CHATTER = [
    '呼……手有一点点酸了，坚持住。',
    '脚步好沉，慢一点别踩响地板。',
    '快到了快到了，马上就到房间了……',
];
class Run {
    sayChatter(line, duration = 2.6) { this.taskLine = line; this.taskLineTime = duration; this.taskLineDuration = duration; }
    get completed() { return Number(this.cakeProgress >= 1) + Number(this.tvProgress >= 1) + Number(this.delivered > 0); }
    get canFinish() { return this.sleepProgress >= 80 || this.completed >= 2; }
    get moveSpeed() { return (this.carrying || this.activity === 'cake') ? 102 : 120; }
    get actionProgress() { return this.activity === 'cake' ? this.cakeProgress : this.tvProgress; }
    get sleepDrainRate() {
        if (this.hidden || this.sleeping || this.phase === 'result')
            return 0;
        const activeChasers = this.family.filter(f => f.state === 'active' && !f.returning);
        if (activeChasers.length === 0)
            return 0;
        const closest = activeChasers.reduce((min, f) => Math.min(min, distance(f, this.player)), 999);
        if (closest < 120)
            return 9.5;
        if (closest < 280)
            return 6.0;
        return 0;
    }
    get familyQuiet() { return this.cry < 40 && this.family.every(f => f.state === 'sleep'); }
    constructor(seed, night = 1) {
        this.seed = seed;
        this.night = night;
        this.player = { x: 335, y: 370 };
        this.phase = 'explore';
        this.elapsed = 0;
        this.phaseTime = 0;
        this.cry = 12;
        this.noise = 0;
        this.totalNoise = 0;
        this.closed = new Set();
        this.found = new Set();
        this.delivered = 0;
        this.cakeProgress = 0;
        this.tvProgress = 0;
        this.tvOn = false;
        this.activity = null;
        this.carrying = null;
        this.carryChatterTimer = 0;
        this.taskLine = '';
        this.taskLineTime = 0;
        this.taskLineDuration = 2.6;
        this.chatter = 0;
        this.chatterIndex = 0;
        this.lullaby = null;
        this.babySleepShield = 0; // 60秒安睡护盾
        this.playerStunTimer = 0; // 吓呆定身倒计时
        this.momChaseChatterTimer = 1.0; // 妈妈追逐气泡台词计时器
        this.momCaught = false; // 是否被妈妈当场抓获
        this.momCaughtTimer = 0; // 抓获后眩晕落幕倒计时（2秒）
        this.momSpankBeat = 0; // 挨揍节拍计时器
        this.hidden = false;
        this.sleeping = false;
        this.breath = 100;
        this.caughtByFamily = 0;
        this.alerts = 0;
        this.wakes = 0;
        this.outcome = '';
        this.dadForgives = 2;
        this.message = '';
        this.messageTime = 8;
        this.sleepProgress = 15; // 初始睡意 15%
        this.inspecting = false;
        this.inspectionTimer = 0;
        this.breathPhase = 0;
        this.maxCaught = 3;
        this.family = [
            { name: '爸爸', x: 340, y: 145, sleep: 100, state: 'sleep', timer: 0, path: [] },
            { name: '妈妈', x: 360, y: 195, sleep: 100, state: 'sleep', timer: 0, path: [] },
        ];
        this.momToy = null;
        this.timeLimit = Math.max(200, 300 - (night - 1) * 20);
        this.sensitivity = Math.min(2.5, 0.8 + (night - 1) * 0.3);
        this.message = '偷偷吃蛋糕、看电视、抱玩具回房。完成任意两件，回床睡觉；多做有额外奖励。';
        this.messageTime = 8;
        this.spots = [
            ...(['小熊', '兔子', '小恐龙'].map((name, i) => ({ ...this.freePosition([{ x: 1030, y: 540 }, { x: 740, y: 800 }, { x: 1160, y: 270 }][i]), id: `toy${i}`, name, toy: ['bear', 'rabbit', 'dino'][i], kind: 'toy' }))),
            { id: 'cake', name: '偷吃蛋糕', kind: 'cake', x: 1050, y: 155 },
            { id: 'tv', name: '偷看电视', kind: 'tv', ...this.freePosition({ x: 805, y: 230 }) },
            { id: 'storage', name: '玩具收纳处', kind: 'storage', ...this.freePosition({ x: 375, y: 440 }) },
            { id: 'bed', name: '回床装睡', kind: 'bed', x: 325, y: 355 },
            { id: 'baby', name: '安抚婴儿', kind: 'baby', x: 280, y: 595 },
            { id: 'hide', name: '藏进衣柜', kind: 'hide', x: 365, y: 100 },
            { id: 'hide2', name: '藏在书桌下', kind: 'hide', x: 810, y: 825 },
        ];
    }
    say(text) { this.message = text; this.messageTime = 6; }
    nearest() {
        return this.spots
            .filter(s => s.kind !== 'toy' || (!this.found.has(s.id) && this.carrying?.id !== s.id))
            .filter(s => s.kind !== 'cake' || this.cakeProgress < 1)
            .filter(s => s.kind !== 'storage' || this.carrying !== null)
            .filter(s => {
            if (s.kind === 'cake') {
                // 蛋糕（冰箱）：只有身体非常靠近冰箱边缘时才触发 (冰箱实际区域约在 x:1027-1074, y: 42-128)
                return this.player.x >= 1010 && this.player.x <= 1090 && this.player.y <= 170;
            }
            return distance(s, this.player) < 78;
        })
            .sort((a, b) => distance(a, this.player) - distance(b, this.player))[0];
    }
    freePosition(preferred) {
        for (let radius = 0; radius <= 120; radius += 10)
            for (let i = 0; i < (radius ? 16 : 1); i++) {
                const p = { x: preferred.x + Math.cos(i * Math.PI / 8) * radius, y: preferred.y + Math.sin(i * Math.PI / 8) * radius };
                if (walkable({ x: p.x, y: p.y + 20 }, this.closed, 10) && route(this.player, p).length)
                    return p;
            }
        return { ...this.player };
    }
    dropToy() {
        if (!this.carrying)
            return;
        Object.assign(this.carrying, this.freePosition({ x: this.player.x, y: this.player.y + 12 }));
        this.carrying = null;
        const dropLines = ['你先在这里等我一下下哦。', '先放地上喘口气，跑得更快一点。', '小声点，在这里乖乖躲好。'];
        this.sayChatter(dropLines[Math.floor(Math.random() * dropLines.length)], 2.3);
        this.say('先放这里，跑快一点。');
    }
    canGiveMomToy() {
        if (!this.carrying || this.momToy !== null)
            return false;
        const mom = this.family[1];
        if (!mom || mom.state !== 'sleep')
            return false;
        return distance(this.player, { x: 281, y: 108 }) < 85;
    }
    get interactionLabel() {
        if (this.hidden || this.sleeping)
            return '离开 / 长按屏息';
        if (this.lullaby)
            return '轻拍 / 跟随光点点击';
        if (this.canGiveMomToy())
            return '塞给妈妈';
        const s = this.nearest();
        if (this.carrying)
            return s?.kind === 'storage' ? '放好玩具' : '放下玩具';
        if (this.activity === 'cake')
            return '停止吃蛋糕';
        if (this.activity === 'tv')
            return '关掉电视';
        if (s?.kind === 'tv')
            return this.tvOn ? (this.tvProgress >= 1 ? '关掉电视' : '继续看 / 长按关机') : '打开电视';
        if (s?.kind === 'toy')
            return '抱起' + s.name;
        if (s?.kind === 'baby')
            return '轻拍哄睡';
        if (s)
            return s.name;
        const d = doorDefinitions.filter(d => distance(d, this.player) < 80).sort((a, b) => distance(a, this.player) - distance(b, this.player))[0];
        if (d)
            return this.closed.has(d.id) ? '开门 / 长按轻开' : '关门 / 长按轻关';
        return '';
    }
    noiseAt(value, source = this.player, affectsBaby = true) {
        this.noise = Math.max(this.noise, value);
        this.totalNoise += value;
        if (this.phase !== 'explore')
            return;
        const proximity = (target) => 1.6 / (1 + Math.pow(distance(source, target) / 120, 2));
        for (const [index, f] of this.family.entries()) {
            const target = f.state === 'sleep' ? { x: index === 0 ? 229 : 281, y: 108 } : f;
            const inParents = (p) => p.x >= 70 && p.x <= 450 && p.y >= 35 && p.y <= 250;
            const blocked = this.closed.has('parents') && inParents(source) !== inParents(target) ? .35 : 1;
            const toyResistance = (index === 1 && this.momToy === 'bear') ? 0.6 : (index === 1 && this.momToy === 'rabbit') ? 0.8 : 1;
            f.sleep = Math.max(0, f.sleep - value * blocked * proximity(target) * this.sensitivity * toyResistance);
        }
        if (affectsBaby && this.babySleepShield <= 0) {
            const inNursery = source.x >= 40 && source.x <= 440 && source.y >= 495 && source.y <= 700;
            const blocked = this.closed.has('nursery') && !inNursery ? .35 : 1;
            this.cry = Math.min(100, this.cry + value * proximity({ x: 214, y: 558 }) * blocked * .55);
        }
    }
    tapBreath() {
        if (!this.inspecting)
            return;
        const inWindow = this.breathPhase >= 0.68 && this.breathPhase <= 0.95;
        if (inWindow) {
            this.say('……呼吸平稳。');
        }
        else {
            this.catchPlayerByMom();
        }
    }
    catchPlayerByMom() {
        if (this.phase !== 'explore' || this.momCaught)
            return;
        this.momCaught = true;
        this.momCaughtTimer = 5.0; // 留出 2.6 秒现场狂暴挨揍反应，0.5 秒黑幕收拢，1.9 秒纯黑剧场字幕
        this.playerStunTimer = 5.4; // 确保全程使用眩晕素材并定身
        this.momSpankBeat = 0;
        this.caughtByFamily++;
        this.lullaby = null;
        this.activity = null;
        this.taskLineTime = 0;
        if (this.carrying)
            this.dropToy();
        this.inspecting = false;
        this.sleeping = false;
        const mom = this.family[1];
        if (mom) {
            mom.path = [];
            mom.timer = 10;
            // 两人拉开清晰戏剧化站位（间隔 44px），避免身躯重叠
            let dx = this.player.x - mom.x;
            let dy = this.player.y - mom.y;
            let dist = Math.hypot(dx, dy);
            if (dist < 6) {
                dx = -1;
                dy = 0;
                dist = 1;
            }
            const nx = dx / dist;
            const ny = dy / dist;
            const gap = 44;
            const candMom = { x: this.player.x - nx * gap, y: this.player.y - ny * gap };
            const candPlayer = { x: mom.x + nx * gap, y: mom.y + ny * gap };
            if (walkable({ x: candMom.x, y: candMom.y + 20 }, this.closed)) {
                mom.x = candMom.x;
                mom.y = candMom.y;
            }
            else if (walkable({ x: candPlayer.x, y: candPlayer.y + 20 }, this.closed)) {
                this.player.x = candPlayer.x;
                this.player.y = candPlayer.y;
            }
            else {
                const sideX = (dx >= 0 ? 1 : -1) * gap;
                if (walkable({ x: this.player.x - sideX, y: this.player.y + 20 }, this.closed)) {
                    mom.x = this.player.x - sideX;
                }
                else if (walkable({ x: mom.x + sideX, y: mom.y + 20 }, this.closed)) {
                    this.player.x = mom.x + sideX;
                }
                else {
                    this.player.x = mom.x + (nx || -1) * 40;
                    this.player.y = mom.y + (ny || 0) * 40;
                }
            }
            const momAngryLines = [
                '大半夜不睡，今天非让你屁股开花不可！💢',
                '叫你不睡！抓现行了吧！吃我一记竹笋炒肉！💢',
                '翅膀硬了是不是？！我看你今晚还皮不皮！💢',
            ];
            mom.chatter = momAngryLines[Math.floor(Math.random() * momAngryLines.length)];
            mom.chatterTimer = 3.5;
        }
        this.sayChatter('嗷呜！屁股要开花啦！妈我错啦——！😭', 3.6);
        this.say('糟了！被老妈当场擒获，正在接受雷霆物理制裁！');
    }
    _caught() {
        this.lullaby = null;
        this.activity = null;
        this.taskLineTime = 0;
        if (this.carrying)
            this.dropToy();
        this.caughtByFamily++;
        this.player = { x: 335, y: 370 };
        this.sleepProgress = Math.max(0, this.sleepProgress - 25);
        if (this.caughtByFamily >= this.maxCaught) {
            this.finish('被发现了三次');
            return;
        }
        this.say(`被发现了！带回床边。睡意 -25%！还剩 ${this.maxCaught - this.caughtByFamily} 次机会。`);
        // 家人抓到主角押送回卧室后，安心回房继续睡觉
        for (let i = 0; i < this.family.length; i++) {
            const f = this.family[i];
            if (f.state === 'active') {
                const homePos = { x: 340 + i * 20, y: 145 + i * 50 };
                if (distance(f, homePos) < 55) {
                    f.state = 'sleep';
                    f.returning = false;
                    f.sleep = 80;
                    f.timer = -1;
                    f.x = homePos.x;
                    f.y = homePos.y;
                    f.path = [];
                    f.chatterTimer = 0;
                }
                else {
                    f.returning = true;
                    f.path = route(f, homePos);
                }
            }
        }
    }
    interact(held = false) {
        if (this.phase === 'result')
            return;
        if (this.playerStunTimer > 0)
            return;
        if (this.hidden || this.sleeping) {
            this.hidden = false;
            this.sleeping = false;
            this.inspecting = false;
            this.say('你轻轻离开了藏身处。');
            return;
        }
        // 哄睡小游戏节拍打击判定
        if (this.lullaby) {
            const p = this.lullaby.progress;
            const sc = this.lullaby.sweetCenter ?? 0.5;
            const sw = this.lullaby.sweetWidth ?? 0.28;
            const halfW = sw / 2;
            const minSweet = sc - halfW;
            const maxSweet = sc + halfW;
            if (p >= minSweet && p <= maxSweet) {
                // 舒适区：刚刚好！
                this.lullaby.combo = Math.min(6, this.lullaby.combo + 1);
                this.lullaby.feedback = '拍得刚刚好';
                this.lullaby.feedbackTimer = 0.8;
                this.lullaby.hitTimer = 0.45;
                this.lullaby.hitProgress = p;
                this.cry = Math.max(0, this.cry - 15);
                if (this.lullaby.combo >= 6) {
                    this.babySleepShield = 60;
                    this.cry = 0;
                    this.lullaby = null;
                    this.sleepProgress = Math.min(100, this.sleepProgress + 20); // 摇篮曲催眠自己
                    this.sayChatter('呼……小宝宝睡得好甜，自己也犯困了。', 2.8);
                    this.say('哄睡大成功！婴儿深度安睡60秒，你的睡意 +20%！');
                }
            }
            else {
                // 节奏失误（拍太轻或拍太重）
                this.lullaby.missCount = (this.lullaby.missCount || 0) + 1;
                this.lullaby.combo = 0; // 连击中断归零
                const isTooEarly = p < minSweet;
                if (this.lullaby.missCount >= 2) {
                    // 失败两次：婴儿彻底醒来大声哭！
                    this.cry = 100;
                    this.alerts++;
                    this.wakes++;
                    this.lullaby = null;
                    this.playerStunTimer = 1.5;
                    this.sleepProgress = Math.max(0, this.sleepProgress - 15); // 惊吓清醒扣除睡意
                    // 妈妈立刻被彻底唤醒并直奔主角/婴儿房
                    const mom = this.family[1];
                    mom.sleep = 0;
                    mom.state = 'active';
                    mom.returning = false;
                    mom.timer = 35;
                    mom.path = route(mom, this.player);
                    mom.chatter = '小宝宝怎么哭了？！谁在房间里？！';
                    mom.chatterTimer = 4;
                    this.sayChatter('哇！闯大祸了……！', 2.5);
                    this.say('连续失误把小宝宝弄醒大哭了！妈妈正火速冲来！快跑！');
                }
                else {
                    // 第 1 次失误：小宝宝被惊动，哭闹飙升至至少 60，警告拉满
                    this.cry = Math.max(60, this.cry + 25);
                    this.lullaby.feedback = isTooEarly ? '太轻了！小宝宝被惊动 (1/2)' : '太重了！小宝宝被惊动 (1/2)';
                    this.lullaby.feedbackTimer = 1.0;
                }
            }
            return;
        }
        const s = this.nearest();
        if (this.carrying) {
            if (this.canGiveMomToy()) {
                const toyKind = this.carrying.toy ?? 'toy';
                const toyName = this.carrying.name ?? '玩具';
                this.momToy = toyKind;
                this.carrying = null;
                const mom = this.family[1];
                if (toyKind === 'dino') {
                    this.sayChatter('恐龙大哥别乱动，千万别硌到妈妈……', 2.5);
                    mom.sleep = Math.max(0, mom.sleep - 25);
                    mom.chatterTimer = 3.5;
                    const wakeUp = mom.sleep < 35 || Math.random() < 0.6;
                    if (wakeUp) {
                        mom.state = 'alert';
                        mom.timer = 3;
                        this.alerts++;
                        mom.chatter = '嘶……什么东西硌到腰了？！';
                        this.say('恐龙太硬了！把妈妈硌醒了，快找地方躲！');
                    }
                    else {
                        mom.chatter = '哎哟……硌死我了……（翻身）';
                        this.say('恐龙太硬了！妈妈被硌得难受翻身，睡意大减！');
                    }
                }
                else if (toyKind === 'bear' || toyKind === 'rabbit') {
                    this.sayChatter(toyKind === 'bear' ? '小熊借给妈妈抱一抱，做个好梦……' : '小兔乖乖陪妈妈睡觉哦……', 2.5);
                    if (mom.sleep >= 35) {
                        const gain = toyKind === 'bear' ? 25 : 15;
                        mom.sleep = Math.min(100, mom.sleep + gain);
                        mom.chatter = toyKind === 'bear' ? '呼……好软的小熊……' : '嗯……小兔乖乖……';
                        mom.chatterTimer = 3.5;
                        this.say(`把${toyName}塞进了妈妈怀里。妈妈抱紧了它，睡得更沉了。`);
                    }
                    else {
                        mom.state = 'alert';
                        mom.timer = 3;
                        this.alerts++;
                        mom.chatter = '谁在拽被子？！（惊）';
                        mom.chatterTimer = 3.5;
                        this.say('糟了！妈妈本来就快醒了，掀被子反而惊醒了她！');
                    }
                }
                else {
                    this.say('妈妈翻了个身，对此毫无反应。');
                }
                return;
            }
            if (s?.kind === 'storage') {
                this.found.add(this.carrying.id);
                this.delivered++;
                this.carrying = null;
                this.sleepProgress = Math.min(100, this.sleepProgress + 15);
                const storeLines = ['乖乖回箱子里睡觉吧，晚安咯。', '耶！收好玩具心里踏实多啦！', '藏进箱子就不会被妈妈发现啦。'];
                this.sayChatter(storeLines[Math.floor(Math.random() * storeLines.length)], 2.5);
                this.say('玩具放好了！心里踏实多了（睡意 +15%）！' + (this.canFinish ? '随时回床入睡！' : '继续积攒睡意。'));
                return;
            }
            else {
                this.dropToy();
                return;
            }
        }
        if (s) {
            if (s.kind === 'toy') {
                this.carrying = s;
                this.activity = null;
                this.noiseAt(4);
                const toyKind = s.toy ?? 'bear';
                const pool = TOY_PICKUP_CHATTER[toyKind] || TOY_PICKUP_CHATTER.bear;
                this.sayChatter(pool[Math.floor(Math.random() * pool.length)], 2.6);
                this.carryChatterTimer = 16 + Math.random() * 8;
                this.say('抱回卧室收纳处。抱着慢一点，互动键可放下。');
                return;
            }
            if (s.kind === 'cake') {
                this.activity = this.activity === 'cake' ? null : 'cake';
                if (this.activity) {
                    this.noiseAt(12);
                    this.chatter = 1;
                    this.say('偷偷吃几口。现在可以边走边吃了。');
                }
                return;
            }
            if (s.kind === 'tv') {
                if (this.activity === 'tv' || (this.tvOn && (held || this.tvProgress >= 1))) {
                    this.tvOn = false;
                    this.activity = null;
                    this.say('电视关好了。');
                }
                else {
                    this.tvOn = true;
                    this.activity = this.tvProgress < 1 ? 'tv' : null;
                    this.chatter = 1;
                    this.noiseAt(8, s);
                    this.say('离开后电视还会响，记得回来关。');
                }
                return;
            }
            if (s.kind === 'baby') {
                // 开启轻拍哄睡微型小游戏
                this.lullaby = {
                    progress: 0.15,
                    direction: 1,
                    combo: 0,
                    maxCombo: 6,
                    feedback: '',
                    feedbackTimer: 0,
                    hitTimer: 0,
                    hitProgress: 0.5,
                    sweetCenter: 0.5,
                    sweetWidth: 0.34,
                    swayClock: 0,
                    missCount: 0,
                    maxMiss: 2,
                };
                this.say('跟着节拍轻拍，连击 6 次可让婴儿熟睡 60 秒。移动可随时退出。');
                return;
            }
            if (s.kind === 'hide') {
                this.hidden = true;
                this.say('保持安静。长按交互屏息，松手恢复。');
            }
            if (s.kind === 'bed') {
                this.sleeping = true;
                this.player = { x: 325, y: 355 };
                this.say(!this.canFinish ? '先装睡躲一躲。完成任意两个小心愿后，可以回床过关。' : '心愿完成了。等妈妈离开，安静睡着。');
            }
            return;
        }
        const d = doorDefinitions.filter(d => distance(d, this.player) < 80).sort((a, b) => distance(a, this.player) - distance(b, this.player))[0];
        if (d) {
            this.closed.has(d.id) ? this.closed.delete(d.id) : this.closed.add(d.id);
            this.noiseAt(held ? 8 : 20);
            this.say(this.closed.has(d.id) ? '房门关上了，声音被挡在另一侧。' : '门开了。');
        }
    }
    update(dt, direction, holding = false) {
        if (this.phase === 'result')
            return;
        dt = Math.min(dt, .1);
        this.elapsed += dt;
        this.phaseTime += dt;
        this.messageTime -= dt;
        this.noise = Math.max(0, this.noise - dt * 20);
        if (this.momCaught) {
            this.momCaughtTimer -= dt;
            this.playerStunTimer = Math.max(0.5, this.momCaughtTimer);
            direction = { x: 0, y: 0 };
            // 挨揍期间节拍性顿挫打击震动（前 2.6 秒击打，momCaughtTimer > 2.4）
            if (this.momCaughtTimer > 2.4) {
                this.momSpankBeat = (this.momSpankBeat || 0) + dt;
                if (this.momSpankBeat >= 0.38) {
                    this.momSpankBeat = 0;
                }
            }
            if (this.momCaughtTimer <= 0) {
                this.momCaught = false;
                this.finish('被妈妈当场抓获！惨遭竹笋炒肉物理制裁，屁股开花回房去睡了……😭');
                return;
            }
        }
        else if (this.playerStunTimer > 0) {
            this.playerStunTimer = Math.max(0, this.playerStunTimer - dt);
            direction = { x: 0, y: 0 };
        }
        const magnitude = this.playerStunTimer > 0 ? 0 : Math.min(1, Math.hypot(direction.x, direction.y));
        this.taskLineTime = Math.max(0, this.taskLineTime - dt);
        // 哄睡小游戏状态机更新
        if (this.lullaby) {
            if (magnitude > 0.15) {
                // 移动打断退出
                this.lullaby = null;
            }
            else {
                this.lullaby.swayClock = (this.lullaby.swayClock || 0) + dt;
                const combo = this.lullaby.combo;
                // 1. 速度阶梯：由慢到快，每连击加速约 11% (0.72 -> 1.18)
                const speed = 0.72 + combo * 0.092;
                // 2. 舒适区宽度收拢：从 34% 宽容收窄至 19% 精致
                this.lullaby.sweetWidth = Math.max(0.19, 0.34 - combo * 0.03);
                // 3. 摇篮舒适区动态摆动：前 2 拍静止在中央(0.5)，从第 3 拍(combo>=2)开启轻柔摇摆
                const swayAmp = combo >= 2 ? Math.min(0.14, 0.06 + (combo - 2) * 0.027) : 0;
                const swayFreq = 1.8 + combo * 0.25;
                this.lullaby.sweetCenter = 0.5 + swayAmp * Math.sin(this.lullaby.swayClock * swayFreq);
                this.lullaby.progress += this.lullaby.direction * speed * dt;
                if (this.lullaby.progress >= 0.98) {
                    this.lullaby.progress = 0.98;
                    this.lullaby.direction = -1;
                }
                else if (this.lullaby.progress <= 0.02) {
                    this.lullaby.progress = 0.02;
                    this.lullaby.direction = 1;
                }
                if (this.lullaby.feedbackTimer > 0) {
                    this.lullaby.feedbackTimer = Math.max(0, this.lullaby.feedbackTimer - dt);
                }
                if (this.lullaby.hitTimer > 0) {
                    this.lullaby.hitTimer = Math.max(0, this.lullaby.hitTimer - dt);
                }
            }
        }
        if (magnitude > .05 || this.hidden || this.sleeping) {
            if (this.activity !== 'cake') {
                if (this.activity === 'tv')
                    this.taskLineTime = 0;
                this.activity = null;
            }
        }
        if (this.carrying && !this.hidden && !this.sleeping && magnitude > 0.1) {
            this.carryChatterTimer -= dt;
            if (this.carryChatterTimer <= 0) {
                this.carryChatterTimer = 18 + Math.random() * 8;
                const toyKind = this.carrying.toy ?? 'bear';
                const pool = (Math.random() < 0.3)
                    ? CARRY_TIRED_CHATTER
                    : (TOY_CARRY_CHATTER[toyKind] || TOY_CARRY_CHATTER.bear);
                this.sayChatter(pool[Math.floor(Math.random() * pool.length)], 2.6);
            }
        }
        if (this.activity) {
            const kind = this.activity;
            const target = this.spots.find(s => s.kind === kind);
            if (kind !== 'cake' && distance(this.player, target) >= 78)
                this.activity = null;
            else {
                if (kind === 'cake') {
                    this.cakeProgress = Math.min(1, this.cakeProgress + dt / 8);
                    this.sleepProgress = Math.min(100, this.sleepProgress + dt * 2.6); // 食困效应持续犯困
                    this.noiseAt(dt * 2);
                }
                else {
                    this.tvProgress = Math.min(1, this.tvProgress + dt / 12);
                    this.sleepProgress = Math.min(100, this.sleepProgress + dt * 2.0); // 电视白噪音催眠
                }
                this.chatter -= dt;
                if (this.chatter <= 0) {
                    const lines = kind === 'cake' ? ['奶油好甜。', '再一口……', '吃饱了就犯困。', '吃完就回床睡。'] : ['看到这里就睡。', '无聊的节目好催眠……', '声音小一点。', '眼皮有点沉了。'];
                    this.sayChatter(lines[this.chatterIndex++ % lines.length], 2.4);
                    this.chatter = 6.5;
                }
                if (this.actionProgress >= 1) {
                    const isCake = kind === 'cake';
                    this.activity = null;
                    this.taskLineTime = 0;
                    this.sleepProgress = Math.min(100, this.sleepProgress + (isCake ? 10 : 8));
                    this.say((isCake ? '蛋糕吃光了，肚子饱饱好想睡（睡意大涨）！' : '电视节目看完了，离开前记得关。') + (this.canFinish ? '睡意正浓，快回床入睡！' : '继续积攒睡意。'));
                }
            }
        }
        if (this.tvOn)
            this.noiseAt(dt * 8, this.spots.find(s => s.kind === 'tv'), false);
        if (!this.hidden && !this.sleeping && magnitude > .05 && this.playerStunTimer <= 0) {
            const previous = { ...this.player };
            move(this.player, direction.x * this.moveSpeed * dt, direction.y * this.moveSpeed * dt, this.closed);
            if (distance(previous, this.player) > .001) {
                const rate = magnitude > .75 ? 12 : magnitude > .4 ? 5 : 2;
                this.noiseAt(rate * dt);
                this.noise = Math.max(this.noise, rate);
            }
        }
        this.breath = Math.max(0, Math.min(100, this.breath + (holding && (this.hidden || this.sleeping) ? -23 : 16) * dt));
        if (this.breath === 0 && holding) {
            this.noiseAt(12 * dt);
            this.say('屏息太久了，松开交互喘口气。');
        }
        // 核心机制：爸妈追逐时的惊吓削减睡意（越被追越清醒！）
        const drain = this.sleepDrainRate;
        if (drain > 0) {
            this.sleepProgress = Math.max(0, this.sleepProgress - dt * drain);
        }
        // 时间限制
        if (this.elapsed >= this.timeLimit) {
            this.finish('天快亮了，你还没有睡着');
            return;
        }
        // 婴儿哭声与安睡护盾
        if (this.babySleepShield > 0) {
            this.babySleepShield = Math.max(0, this.babySleepShield - dt);
            this.cry = 0;
        }
        else {
            this.cry = Math.min(100, Math.max(0, this.cry + dt * .35 * this.sensitivity));
        }
        if (this.cry > 75 && this.babySleepShield <= 0)
            this.noiseAt(dt * 5, { x: 214, y: 558 }, false);
        if (holding && distance(this.player, { x: 280, y: 595 }) < 78 && this.babySleepShield <= 0)
            this.cry = Math.max(0, this.cry - dt * 8);
        // 终极通关判定：睡意达到 100% 并在床上安稳沉睡
        if (this.sleepProgress >= 100 && this.sleeping && !this.inspecting) {
            const nearbyThreat = this.family.some(f => f.state === 'active' && distance(f, this.player) < 160);
            if (!nearbyThreat) {
                this.finish('心满意足，终于甜甜地睡着了');
                return;
            }
        }
        // 家人 AI
        for (let i = 0; i < this.family.length; i++) {
            const f = this.family[i];
            if (f.state === 'sleep') {
                if (this.cry >= 100)
                    f.sleep = 0;
                // 睡意为 0 时直接下床起床，不再有坐起动作
                if (f.sleep <= 0) {
                    f.sleep = 0;
                    f.state = 'active';
                    f.returning = false;
                    f.timer = 25;
                    if (i === 1) {
                        this.wakes++;
                        this.alerts++;
                        this.say('妈妈睡意全无，直接下床了！快找地方躲藏！');
                    }
                    else {
                        this.say('爸爸被吵醒了，直接下床了！');
                    }
                    if (i === 0) {
                        const r = Math.random();
                        const dest = r < 0.4 ? { x: 1050, y: 155 } : (r < 0.8 ? { x: 820, y: 680 } : { x: 800, y: 300 });
                        f.path = route(f, dest);
                    }
                    else {
                        f.path = route(f, this.sleeping ? { x: 325, y: 355 } : this.player);
                    }
                }
                else {
                    f.sleep = Math.min(100, f.sleep + dt * .35);
                }
            }
            else if (f.state === 'alert') {
                f.timer -= dt;
                if (f.timer <= 0) {
                    f.state = 'active';
                    f.returning = false;
                    f.timer = 25;
                    if (i === 1)
                        this.wakes++;
                    if (i === 0) {
                        // 爸爸随机去厨房(蛋糕)、电脑房或客厅
                        const r = Math.random();
                        const dest = r < 0.4 ? { x: 1050, y: 155 } : (r < 0.8 ? { x: 820, y: 680 } : { x: 800, y: 300 });
                        f.path = route(f, dest);
                    }
                    else {
                        f.path = route(f, this.sleeping ? { x: 325, y: 355 } : this.player);
                    }
                }
            }
            else {
                const isMom = i === 1;
                if (this.momCaught && isMom) {
                    f.path = [];
                    continue;
                }
                const momRush = isMom && (this.cry >= 75 && this.babySleepShield <= 0);
                const speed = momRush ? 145 : 82;
                f.timer -= dt;
                this.follow(f, f.path, dt * speed, true);
                if (momRush && !f.returning && f.path.length === 0) {
                    f.path = route(f, this.player);
                }
                const homePos = { x: 340 + i * 20, y: 145 + i * 50 };
                if (f.timer <= 0 && !f.returning) {
                    f.returning = true;
                    f.path = route(f, homePos);
                }
                if (f.returning) {
                    if (distance(f, homePos) < 35) {
                        f.state = 'sleep';
                        f.returning = false;
                        f.sleep = 80;
                        f.timer = -1;
                        f.x = homePos.x;
                        f.y = homePos.y;
                        f.path = [];
                        f.chatterTimer = 0;
                        if (i === 1)
                            this.closed.add('player');
                    }
                    else if (!f.path.length)
                        f.path = route(f, homePos);
                    continue;
                }
                // 爸爸怂包逻辑：如果妈妈醒了，爸爸立刻中止偷吃/打游戏，全速回房！
                if (i === 0 && this.family[1].state !== 'sleep') {
                    if (distance(f, homePos) > 60) {
                        if (f.path.length === 0 || Math.abs(f.path[f.path.length - 1].x - homePos.x) > 30) {
                            f.returning = true;
                            f.path = route(f, homePos);
                            if (f.chatterTimer === undefined || f.chatterTimer <= 0) {
                                f.chatter = "不好，老婆醒了！赶紧撤！";
                                f.chatterTimer = 3;
                            }
                        }
                    }
                    else {
                        // 如果老婆醒了且自己还在床附近，立刻倒头装睡，绝不出去
                        f.timer = 0;
                        f.path = [];
                    }
                }
                // 到达目的地后的逻辑决策
                if (f.path.length === 0) {
                    if (i === 1) {
                        // 妈妈的决策逻辑
                        if (f.returning) {
                            if (distance(f, homePos) < 50) {
                                f.state = 'sleep';
                                f.returning = false;
                                f.sleep = 80;
                                f.timer = -1;
                                f.x = homePos.x;
                                f.y = homePos.y;
                                f.path = [];
                                f.chatterTimer = 0;
                                this.closed.add('player');
                            }
                            else {
                                f.path = route(f, homePos);
                            }
                        }
                        else if (!this.sleeping && !this.hidden) {
                            // 主角在外面：不管离床远近，继续追击主角
                            f.path = route(f, this.player);
                        }
                        else {
                            // 主角已躲藏或装睡：妈妈寻找无果，心满意足回房入睡
                            f.returning = true;
                            f.path = route(f, homePos);
                        }
                    }
                    else {
                        // 爸爸的决策逻辑
                        if (distance(f, homePos) > 60) {
                            if (f.timer < 8) {
                                f.returning = true;
                                f.path = route(f, homePos);
                            }
                        }
                        else {
                            // 爸爸已经回到了床边，不用再傻站着等倒计时了，立刻闭眼睡觉！
                            f.timer = 0;
                        }
                    }
                }
                // 妈妈追逐主角时的暴怒老妈生活化抓包台词
                if (i === 1 && !f.returning && !this.sleeping && !this.hidden && distance(f, this.player) < 320) {
                    this.momChaseChatterTimer -= dt;
                    if (this.momChaseChatterTimer <= 0) {
                        this.momChaseChatterTimer = 3.8 + Math.random() * 2.0;
                        const momLines = [
                            '大半夜不睡觉，明天起得来吗？！',
                            '小兔崽子站住！看我收不收你玩具！',
                            '鞋都不穿在地上跑，脚不冰啊？！',
                            '让我看看是谁又在偷吃东西？！',
                            '我看你今晚能往哪藏！',
                            '被我逮到有你好看的！',
                        ];
                        f.chatter = momLines[Math.floor(Math.random() * momLines.length)];
                        f.chatterTimer = 2.6;
                    }
                }
                if (!f.returning && distance(f, this.player) < 40) {
                    if (i === 0) {
                        if (this.family[1].state !== 'sleep') {
                            // 妈妈醒着的时候，爸爸忙着逃命，不管玩家
                            if (f.chatterTimer === undefined || f.chatterTimer <= 0) {
                                f.chatter = "别挡道，你妈来了！快跑！";
                                f.chatterTimer = 2;
                            }
                        }
                        else if (this.dadForgives > 0) {
                            // 爸爸的放水与彩蛋逻辑 (妈妈没醒)
                            if (f.chatterTimer === undefined || f.chatterTimer <= 0) {
                                if (this.player.x > 950 && this.player.y < 300) {
                                    // 在厨房抓到
                                    const lines = ["嘘…老爸就吃一口，咱俩谁也别跟妈说。", "（嚼嚼嚼）…你怎么也来了？当没看见啊！", "半夜吃独食被逮到了…快回去睡！"];
                                    f.chatter = lines[Math.floor(Math.random() * lines.length)];
                                }
                                else if (this.player.y > 600 && this.player.x > 550) {
                                    // 在电脑房抓到
                                    const lines = ["咳，老爸在处理工作…看完这局就睡。", "嘘，这把团战关键时刻，别吵醒你妈！", "我不是打游戏，我在测试鼠标…快去睡！"];
                                    f.chatter = lines[Math.floor(Math.random() * lines.length)];
                                }
                                else {
                                    // 走廊常规抓到
                                    this.dadForgives--;
                                    if (this.dadForgives > 0) {
                                        const lines = ["又跑出来玩？下不为例，赶紧回去睡。", "怎么又起夜了？小心别吵醒你妈。", "老爸当没看见，给你三秒钟回被窝…"];
                                        f.chatter = lines[Math.floor(Math.random() * lines.length)];
                                    }
                                    else {
                                        const lines = ["还在外面晃悠？快回屋，等下你妈真醒了！", "最后一次放水了啊，再不回去保不住你了。", "赶紧回去，别逼老爸大义灭亲啊！"];
                                        f.chatter = lines[Math.floor(Math.random() * lines.length)];
                                    }
                                }
                                f.chatterTimer = 3.5;
                                f.returning = true;
                                f.path = route(f, homePos); // 碰面后心虚回房
                            }
                        }
                        else {
                            // 爸爸放水次数用完，抓人
                            if (!this.hidden && !this.sleeping && (f.chatterTimer === undefined || f.chatterTimer <= 0)) {
                                const lines = ["让你早睡不听！看你怎么跟你妈解释。", "这下老爸也救不了你了，乖乖认罚吧。", "跟你说了早点睡…完蛋，你妈真醒了！"];
                                f.chatter = lines[Math.floor(Math.random() * lines.length)];
                                f.chatterTimer = 3;
                                this.catchPlayerByMom();
                                return;
                            }
                        }
                    }
                    else {
                        // 妈妈抓人
                        if (!this.hidden && !this.sleeping) {
                            this.catchPlayerByMom();
                            return;
                        }
                        else if (this.sleeping && !this.inspecting) {
                            this.inspecting = true;
                            this.inspectionTimer = 4.5;
                            this.breathPhase = 0;
                            f.path = [];
                            this.say(`${f.name}停在了你床边……别动，放慢呼吸。`);
                        }
                    }
                }
                if (f.timer <= 0) {
                    f.state = 'sleep';
                    f.sleep = 80;
                    f.timer = -1;
                    f.x = 340 + i * 20;
                    f.y = 145 + i * 50;
                    f.chatterTimer = 0;
                    if (i === 1)
                        this.closed.add('player');
                }
            }
            if (f.chatterTimer !== undefined && f.chatterTimer > 0)
                f.chatterTimer -= dt;
        }
        // 装睡检查
        if (this.inspecting) {
            this.inspectionTimer -= dt;
            this.breathPhase = (this.breathPhase + dt / 4) % 1;
            if (magnitude > 0.15) {
                this.catchPlayerByMom();
                return;
            }
            else if (this.inspectionTimer <= 0) {
                this.inspecting = false;
                this.say('……她慢慢走开了。');
                for (let j = 0; j < this.family.length; j++) {
                    const fj = this.family[j];
                    if (fj.state === 'active') {
                        fj.returning = true;
                        fj.path = route(fj, { x: 340 + j * 20, y: 145 + j * 50 });
                        if (j === 1)
                            this.closed.add('player');
                    }
                }
            }
        }
    }
    follow(actor, path, amount, opens) {
        let remaining = amount;
        while (path.length > 0 && remaining > 0.001) {
            const p = path[0];
            const d = distance(actor, p);
            if (d < 0.6) {
                path.shift();
                continue;
            }
            const door = doorDefinitions.find(door => this.closed.has(door.id) && distance(actor, door) < 65);
            if (door && opens) {
                this.closed.delete(door.id);
                return;
            }
            const step = Math.min(remaining, d);
            move(actor, (p.x - actor.x) / d * step, (p.y - actor.y) / d * step, this.closed);
            remaining -= step;
            if (step >= d - 0.6) {
                path.shift();
            }
            else {
                break;
            }
        }
    }
    finish(outcome) { if (this.phase === 'result')
        return; this.outcome = outcome; this.phase = 'result'; }
    get escaped() { return this.outcome === '心满意足地睡着了'; }
    get breakdown() {
        return [
            this.completed * 100 + Math.max(0, this.delivered - 1) * 25,
            Math.max(0, 200 - this.alerts * 10 - this.wakes * 35 - this.caughtByFamily * 30),
            Math.max(0, Math.round(200 - this.totalNoise / 14)),
            Math.max(0, Math.round(150 - this.elapsed / 4)),
            this.escaped ? 150 : 0,
        ];
    }
    get score() { return Math.min(1000, this.breakdown.reduce((a, b) => a + b, 0)); }
}

/**
 * 跨平台安全绘制圆角矩形路径（百分百兼容各基础库版本的微信小游戏与浏览器）
 * 解决特定环境下 ctx.roundRect 传入非序列参数报错的问题
 */
function drawRoundRect(ctx, x, y, w, h, radius = 0) {
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
function drawCrescentMoon(ctx, cx, cy, r, color, dashed = false, glow = !dashed) {
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
    }
    else {
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
function drawStar(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    const inner = r * 0.36;
    for (let i = 0; i < 8; i++) {
        const rad = (i * Math.PI) / 4 - Math.PI / 2;
        const curR = i % 2 === 0 ? r : inner;
        const x = cx + Math.cos(rad) * curR;
        const y = cy + Math.sin(rad) * curR;
        if (i === 0)
            ctx.moveTo(x, y);
        else
            ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}
/**
 * 绘制漫画风晶莹水滴/慌张冷汗
 */
function drawSweatDrop(ctx, cx, cy, size, angle = 0.25) {
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

class LullabyOverlay {
    /**
     * 判断触控点是否命中哄睡小游戏操作区域
     */
    hitTest(p) {
        return p.x >= 340 && p.x <= 940 && p.y >= 120 && p.y <= 420;
    }
    /**
     * 绘制哄睡小游戏全套高保真 UI
     */
    draw(ctx, lullaby, clock, textFn) {
        if (!lullaby)
            return;
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
        trackGrad.addColorStop(0, '#1c2d46'); // 柔和微风蓝
        trackGrad.addColorStop(0.36, '#182035'); // 宁静夜空
        trackGrad.addColorStop(0.50, '#161d30'); // 摇篮星夜核心
        trackGrad.addColorStop(0.64, '#2c1e2d'); // 暖紫过渡
        trackGrad.addColorStop(1, '#46242c'); // 柔和暖珊瑚红
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
            }
            else if (i < combo) {
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
            }
            else {
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
            }
            else {
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
            }
            else if (lullaby.feedback.includes('惊动')) {
                // 醒目的红色警报
                textFn(ctx, `!  ${lullaby.feedback}  !`, cx, feedbackY - floatOffset, 19, `rgba(255, 80, 80, ${alpha.toFixed(2)})`, 'center');
            }
            else if (lullaby.feedback === '太轻了…') {
                textFn(ctx, '·  太轻了…  ·', cx, feedbackY - floatOffset, 18, `rgba(150, 195, 235, ${alpha.toFixed(2)})`, 'center');
            }
            else {
                textFn(ctx, `!  ${lullaby.feedback}  !`, cx, feedbackY - floatOffset, 19, `rgba(255, 105, 105, ${alpha.toFixed(2)})`, 'center');
            }
        }
        else {
            const hintAlpha = (0.42 + 0.22 * Math.sin(clock * 4)).toFixed(2);
            textFn(ctx, '✦  轻触交互键击打节拍  ✦', cx, feedbackY, 15, `rgba(235, 215, 150, ${hintAlpha})`, 'center');
        }
        // 7. 底部退出指引
        const exitY = topY + 252;
        textFn(ctx, '←   移动可退出   →', cx, exitY, 13, '#587082', 'center');
    }
}

class GameViews {
    static drawLandscapeHome(ctx, ui, selected, progress, actions) {
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
    static drawPortraitHome(ctx, ui, selected, progress, actions) {
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
    static drawPortraitSettings(ctx, ui, settings, onBack) {
        ui.box(ctx, 16, 87, 358, 686, '#172126', '#46514e');
        ui.text(ctx, '让夜晚适合你', 38, 135, 26);
        const toggles = ['hints'];
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
        const volumes = ['cueVolume', 'ambientVolume'];
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
    static drawSettingsPanel(ctx, ui, settings, onHome, onResume) {
        ui.panel(ctx, '让夜晚适合你', '探索时暂停；追逐过程保持连续。');
        const options = [{ key: 'hints', label: '新手提示' }];
        options.forEach((o, i) => ui.button(ctx, {
            x: 290,
            y: 232 + i * 54,
            w: 690,
            h: 46,
            label: `${o.label}    ${settings[o.key] ? '开启' : '关闭'}`,
            action: () => {
                settings[o.key] = !settings[o.key];
                StorageManager.set('settings_v1', settings);
            }
        }));
        for (const [i, key] of ['cueVolume', 'ambientVolume'].entries())
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
    static drawResult(ctx, ui, run, daily, actions) {
        ui.panel(ctx, run.escaped ? '心满意足，晚安。' : (run.outcome.includes('妈妈') || run.outcome.includes('竹笋炒肉') ? '惨遭老妈物理制裁！😭' : '今晚先到这里。'), `${run.outcome}  ·  ${Math.floor(run.elapsed)} 秒  ·  ${daily ? '每日同种子' : `第 ${run.night} 夜`}`);
        ui.text(ctx, `${run.score}`, 330, 300, 76, '#cfbb91');
        const grade = run.score >= 900 ? 'S' : run.score >= 750 ? 'A' : run.score >= 600 ? 'B' : run.score >= 400 ? 'C' : 'D';
        ui.text(ctx, `${grade}  /  1000`, 350, 363, 20, '#899f9f');
        const labels = ['小心愿与玩具', '躲过妈妈', '噪声控制', '时间效率', '安睡结果'];
        run.breakdown.forEach((v, i) => {
            ui.text(ctx, labels[i], 580, 240 + i * 37, 16, '#9daba6');
            ui.text(ctx, String(v), 950, 240 + i * 37, 19, '#ded5be', 'right');
        });
        ui.wrap(ctx, `完成 ${run.completed}/3 个小心愿，收好 ${run.delivered} 个玩具，被发现 ${run.caughtByFamily} 次。${run.escaped && run.night < 4 ? '下一夜已解锁。' : '进度中断不丢，危险时先躲好。'}`, 290, 480, 39, 15);
        ui.button(ctx, { x: 290, y: 554, w: 180, h: 45, label: '回到标题', action: actions.onHome });
        ui.button(ctx, {
            x: 505,
            y: 554,
            w: 200,
            h: 45,
            label: '分享这一夜',
            action: () => WechatBridge.shareAppMessage(`疯狂妈妈MaMa：偷偷完成 ${run.completed} 个小心愿，得到 ${run.score} 分！`, undefined, `seed=${encodeURIComponent(run.seed)}`)
        });
        ui.button(ctx, { x: 800, y: 554, w: 185, h: 45, label: '再来一夜 →', primary: true, action: actions.onRestart });
    }
}

const thoughts = {
    stir: ['……', '有动静……', '被子动了……', '翻身了……'],
    restless: ['呼吸变了……', '睡得不沉了……', '又翻身了……', '快醒了吗……'],
    awake: ['醒了。', '坐起来了。', '怎么醒了……', '这下麻烦了。', '还没睡熟……'],
    walking: ['下床了……', '脚步声……', '有人走动。', '起来了……', '听见脚步了。'],
    caught: ['糟了。', '被看见了。', '来不及了。', '还是被发现了。', '躲不过了……'],
};
class MainGameScene extends Scene {
    thought(kind, level) {
        // Escalations replace quiet observations; minor events never queue up.
        if (this.thoughtCooldown > 0 && level <= this.thoughtLevel)
            return;
        const choices = thoughts[kind];
        const previous = this.thoughtChoices[kind];
        // Pick from all alternatives except the last line heard in this category.
        const index = previous === undefined ? Math.floor(Math.random() * choices.length) : (previous + 1 + Math.floor(Math.random() * (choices.length - 1))) % choices.length;
        this.thoughtChoices[kind] = index;
        const text = choices[index];
        this.floatText = { text, age: 0, level, duration: level >= 2 ? 1.6 : 2.2 };
        this.thoughtCooldown = 7;
        this.thoughtLevel = level;
    }
    constructor() {
        super('MainGameScene');
        this.screen = 'home';
        this.sprites = new CharacterSprites();
        this.lullabyOverlay = new LullabyOverlay();
        this.back = 'home';
        this.run = new Run('first-night');
        this.progress = StorageManager.get('progress_v1', { unlocked: 1, best: 0, runs: 0 });
        this.settings = StorageManager.get('settings_v1', { hints: true, sound: true, cueVolume: .55, ambientVolume: .3 });
        this.selected = 1;
        this.buttons = [];
        this.keys = new Set();
        this.joystick = null;
        this.actionId = null;
        this.holding = false;
        this.holdTime = 0;
        this.heldAction = false;
        this.scale = 1;
        this.ox = 0;
        this.oy = 0;
        this.rotated = false;
        this.physicalWidth = 0;
        this.saved = false;
        this.daily = false;
        this.resume = 0;
        this.mapScale = 1.8;
        this.mapX = 210;
        this.mapY = 85;
        this.clock = 0;
        this.sounds = new SoundService();
        this.stepTimer = 0;
        this.ambienceTimer = 0;
        this.feedback = { found: 0, clues: 0, alerts: 0, noise: 0 };
        this.ripples = [];
        this.floatText = null;
        this.sleepDark = 0;
        this.thoughtCooldown = 0;
        this.thoughtLevel = -1;
        this.thoughtChoices = {};
        this.lastThoughtPhase = 'explore';
        this.chasePanicTimer = 0;
        this.chasePanicIndex = 0;
        this.resultFadeTimer = 0;
        this.babyCryTimer = 0;
        this.lastCryHigh = false;
        this.lullabyBtnProgress = 0;
        this.tapBtnAnim = 0;
        this.clearInput = () => { this.sounds.stop(); this.keys.clear(); this.joystick = null; this.holding = false; this.actionId = null; };
        this.onResume = () => { this.clearInput(); this.resume = 1; };
        this.keyDown = (e) => {
            const key = e.key.toLowerCase();
            if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key))
                e.preventDefault();
            this.keys.add(key);
            if (e.repeat)
                return;
            if (this.screen === 'play' && this.run.phase !== 'result') {
                if (key === 'e' || key === ' ') {
                    this.holding = true;
                    this.holdTime = 0;
                    this.heldAction = false;
                }
                if (key === 'escape' && this.run.phase === 'explore') {
                    this.back = 'play';
                    this.screen = 'settings';
                }
            }
            else if (key === 'escape') {
                this.screen = this.screen === 'settings' ? this.back : this.screen === 'home' ? 'home' : 'play';
                this.clearInput();
            }
        };
        this.keyUp = (e) => { const k = e.key.toLowerCase(); this.keys.delete(k); if (k === 'e' || k === ' ')
            this.releaseAction(); };
        this.debugTouches = [];
    }
    onEnter() {
        this.sprites.load().catch(() => this.run.say('角色图片加载失败，暂时使用简化人物。'));
        globalResources.loadImage('house', 'assets/images/house-night-merged.png').catch(() => this.run.say('场景图加载失败，已启用可玩地图。'));
        globalResources.loadImage('title', 'assets/images/title-night.jpg').catch(() => { });
        globalResources.loadImage('wish-props', 'assets/images/wish-props.png').catch(() => this.run.say('道具图片暂未加载，仍可按提示互动。'));
        if (typeof window !== 'undefined') {
            window.addEventListener('keydown', this.keyDown);
            window.addEventListener('keyup', this.keyUp);
        }
        globalEvents.on('input:reset', this.clearInput);
        globalEvents.on('app:hide', this.clearInput);
        globalEvents.on('app:show', this.onResume);
    }
    releaseAction() {
        if (this.holding && !this.heldAction && this.screen === 'play') {
            this.tapBtnAnim = 1.0;
            this.run.interact();
        }
        this.holding = false;
        this.actionId = null;
    }
    start(daily = false) {
        this.sprites.reset();
        this.daily = daily;
        const seed = daily ? `daily-v1-${new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)}` : this.selected === 1 ? 'first-night-v1' : `night-${this.selected}-${Date.now()}`;
        this.run = new Run(seed, daily ? 3 : this.selected);
        this.feedback = { found: 0, clues: 0, alerts: 0, noise: 0 };
        this.saved = false;
        this.screen = 'play';
        this.clearInput();
        this.ripples = [];
        this.floatText = null;
        this.thoughtCooldown = 0;
        this.lastThoughtPhase = 'explore';
        this.sleepDark = 0;
        this.babyCryTimer = 0;
        this.lastCryHigh = false;
        this.resultFadeTimer = 0;
        this.lullabyBtnProgress = 0;
        this.tapBtnAnim = 0;
        this.mapX = 600 - this.run.player.x * this.mapScale;
        this.mapY = 360 - this.run.player.y * this.mapScale;
    }
    onUpdate(dt) {
        this.clock += dt;
        if (this.resume > 0) {
            this.resume -= dt;
            return;
        }
        if (this.screen !== 'play') {
            this.sounds.stop();
            return;
        }
        if (this.holding) {
            this.holdTime += dt;
            if (this.holdTime >= .5 && !this.heldAction) {
                this.heldAction = true;
                if (!this.run.hidden && !this.run.sleeping)
                    this.run.interact(true);
            }
        }
        let x = Number(this.keys.has('d') || this.keys.has('arrowright')) - Number(this.keys.has('a') || this.keys.has('arrowleft'));
        let y = Number(this.keys.has('s') || this.keys.has('arrowdown')) - Number(this.keys.has('w') || this.keys.has('arrowup'));
        if (this.joystick) {
            x = (this.joystick.current.x - this.joystick.origin.x) / 60;
            y = (this.joystick.current.y - this.joystick.origin.y) / 60;
        }
        const length = Math.hypot(x, y);
        if (length > 1) {
            x /= length;
            y /= length;
        }
        if (this.keys.has('shift')) {
            x *= .35;
            y *= .35;
        }
        const familyBefore = this.run.family.map(f => ({ state: f.state, sleep: f.sleep }));
        const caughtBefore = this.run.caughtByFamily;
        this.thoughtCooldown = Math.max(0, this.thoughtCooldown - dt);
        if (this.run.phase === 'result') {
            this.resultFadeTimer = Math.min(1, this.resultFadeTimer + dt * 2.5);
        }
        else {
            this.resultFadeTimer = 0;
        }
        const targetLullabyBtn = (Boolean(this.run.lullaby) || this.run.interactionLabel.includes('轻拍') || this.run.interactionLabel.includes('哄睡')) && this.run.phase === 'explore';
        const lSpeed = targetLullabyBtn ? 4.8 : 3.6;
        if (targetLullabyBtn) {
            this.lullabyBtnProgress = Math.min(1, this.lullabyBtnProgress + dt * lSpeed);
        }
        else {
            this.lullabyBtnProgress = Math.max(0, this.lullabyBtnProgress - dt * lSpeed);
        }
        this.tapBtnAnim = Math.max(0, this.tapBtnAnim - dt * 6.0);
        if (this.floatText) {
            this.floatText.age += dt;
            if (this.floatText.age >= this.floatText.duration)
                this.floatText = null;
        }
        // Fade screen dark when sleeping (eyes closing), fade back when waking up.
        const darkTarget = (this.run.sleeping && this.run.phase !== 'result') ? 0.92 : 0;
        this.sleepDark += (darkTarget - this.sleepDark) * Math.min(1, dt * (this.run.sleeping ? 2.5 : 4));
        this.run.update(dt, { x, y }, this.holding);
        let playerDir = { x, y };
        if (this.run.momCaught) {
            const mom = this.run.family[1];
            if (mom) {
                playerDir = { x: this.run.player.x - mom.x, y: this.run.player.y - mom.y };
            }
        }
        this.sprites.track('player', this.run.player, dt, playerDir);
        this.run.family.forEach((f, i) => {
            let targetNode = f.path.length > 0 ? f.path[0] : undefined;
            if (f.path.length > 1 && Math.hypot(f.path[0].x - f.x, f.path[0].y - f.y) < 2) {
                targetNode = f.path[1];
            }
            let parentDir = targetNode ? { x: targetNode.x - f.x, y: targetNode.y - f.y } : undefined;
            if (this.run.momCaught && i === 1) {
                parentDir = { x: this.run.player.x - f.x, y: this.run.player.y - f.y };
            }
            this.sprites.track('family' + i, f, dt, parentDir);
        });
        const targetX = Math.min(150, Math.max(1280 - 150 - 1580 * this.mapScale, 560 - this.run.player.x * this.mapScale));
        const targetY = Math.min(100, Math.max(720 - 100 - 996 * this.mapScale, 360 - this.run.player.y * this.mapScale));
        // Snap camera immediately when sleeping so the player is in bed before darkness fades in.
        const camSpeed = this.run.sleeping ? 20 : 6;
        this.mapX += (targetX - this.mapX) * Math.min(1, camSpeed * dt);
        this.mapY += (targetY - this.mapY) * Math.min(1, camSpeed * dt);
        this.sounds.volume = this.settings.cueVolume ?? .55;
        if (this.run.found.size > this.feedback.found)
            this.sounds.play('found');
        if (this.run.alerts > this.feedback.alerts)
            this.sounds.play('warning');
        if (this.run.phase === 'result')
            this.floatText = null;
        else if (this.run.caughtByFamily > caughtBefore)
            this.thought('caught', 4);
        else if (this.run.family.some((f, i) => f.state === 'alert' && familyBefore[i].state === 'sleep'))
            this.thought('awake', 2);
        else if (this.run.family.some((f, i) => f.state === 'active' && familyBefore[i].state !== 'active'))
            this.thought('walking', 3);
        else if (this.run.family.some((f, i) => f.state === 'sleep' && f.sleep < 55 && familyBefore[i].sleep >= 55))
            this.thought('restless', 1);
        else if (this.run.family.some((f, i) => f.state === 'sleep' && f.sleep < 70 && familyBefore[i].sleep >= 70))
            this.thought('stir', 0);
        this.lastThoughtPhase = this.run.phase;
        const isChased = !this.run.sleeping && !this.run.hidden && this.run.family.some(f => f.state === 'active' && !f.returning && distance(f, this.run.player) < 260);
        if (isChased && this.run.phase !== 'result' && this.run.playerStunTimer <= 0) {
            this.chasePanicTimer -= dt;
            if (this.chasePanicTimer <= 0) {
                this.chasePanicTimer = 3.2 + Math.random() * 1.5;
                const line = MainGameScene.CHASE_PANIC_LINES[this.chasePanicIndex++ % MainGameScene.CHASE_PANIC_LINES.length];
                this.run.sayChatter(line, 2.2);
            }
        }
        else {
            this.chasePanicTimer = 0.5;
        }
        if (this.run.noise >= 19 && this.feedback.noise < 19)
            this.sounds.play('door');
        this.feedback = { found: this.run.found.size, clues: 0, alerts: this.run.alerts, noise: this.run.noise };
        this.ripples = this.ripples.filter(r => (r.age += dt) < 0.35);
        this.stepTimer += dt;
        this.ambienceTimer += dt;
        if (this.stepTimer > .55 && length > .05 && !this.run.hidden && !this.run.sleeping && this.run.phase !== 'result') {
            this.stepTimer = 0;
            this.sounds.volume *= .28;
            this.sounds.play('step');
            this.ripples.push({ x: this.run.player.x, y: this.run.player.y + 23, age: 0, strength: length });
        }
        if (this.ambienceTimer > 5 && this.run.phase !== 'result') {
            this.ambienceTimer = 0;
            this.sounds.volume = this.settings.ambientVolume ?? .3;
            if (this.run.cry > 40 && this.run.cry < 75)
                this.sounds.play('cry', { x: 214, y: 558 }, this.run.player);
        }
        const isBabyCrying = this.run.cry >= 75 && this.run.babySleepShield <= 0 && this.run.phase !== 'result';
        if (isBabyCrying) {
            if (!this.lastCryHigh) {
                // 瞬间爆发：失误大哭瞬间零延迟响起啼哭与警报！
                this.sounds.volume = this.settings.cueVolume ?? .65;
                this.sounds.play('cry');
                this.sounds.play('warning');
                this.babyCryTimer = 1.9;
            }
            else {
                this.babyCryTimer -= dt;
                if (this.babyCryTimer <= 0) {
                    this.babyCryTimer = 2.0 + Math.random() * 0.4;
                    this.sounds.volume = this.settings.cueVolume ?? .65;
                    this.sounds.play('cry', { x: 214, y: 558 }, this.run.player);
                }
            }
        }
        else {
            this.babyCryTimer = 0;
        }
        this.lastCryHigh = isBabyCrying;
        if (this.run.phase === 'result' && !this.saved) {
            this.saved = true;
            this.progress.runs++;
            this.progress.best = Math.max(this.progress.best, this.run.score);
            if (this.run.escaped && !this.daily)
                this.progress.unlocked = Math.min(4, Math.max(this.progress.unlocked, this.selected + 1));
            StorageManager.set('progress_v1', this.progress);
        }
    }
    text(ctx, text, x, y, size = 16, color = '#e8dfce', align = 'left') {
        ctx.fillStyle = color;
        ctx.font = `${size >= 30 ? 'bold' : 'normal'} ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
    }
    box(ctx, x, y, w, h, color, stroke) {
        ctx.fillStyle = color;
        drawRoundRect(ctx, x, y, w, h, 2);
        ctx.fill();
        if (stroke) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }
    button(ctx, b) {
        this.buttons.push(b);
        this.box(ctx, b.x, b.y, b.w, b.h, b.primary ? '#691515' : 'rgba(20,22,22,.91)', b.primary ? '#a83232' : '#454a48');
        this.text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2, 16, b.primary ? '#e8d4b3' : '#a3aca8', 'center');
    }
    wrap(ctx, text, x, y, max, size = 17, color = '#d0cbbd') {
        let line = '', row = 0;
        for (const c of text) {
            if (line.length >= max) {
                this.text(ctx, line, x, y + row++ * 28, size, color);
                line = '';
            }
            line += c;
        }
        if (line)
            this.text(ctx, line, x, y + row * 28, size, color);
    }
    get viewportBounds() {
        const sys = WechatBridge.getSystemInfo();
        const vw = this.rotated ? sys.windowHeight : sys.windowWidth;
        const vh = this.rotated ? sys.windowWidth : sys.windowHeight;
        const s = this.scale || 1;
        return {
            left: -this.ox / s,
            top: -this.oy / s,
            width: vw / s,
            height: vh / s,
        };
    }
    panel(ctx, title, sub) {
        this.buttons = [];
        const b = this.viewportBounds;
        this.box(ctx, b.left, b.top, b.width, b.height, 'rgba(5,5,5,.94)');
        this.box(ctx, 245, 100, 790, 530, '#141111', '#752424');
        this.text(ctx, title, 290, 150, 30, '#ba3434');
        this.text(ctx, sub, 290, 192, 14, '#a39b8d');
    }
    get uiHelper() {
        return {
            text: this.text.bind(this),
            box: this.box.bind(this),
            button: this.button.bind(this),
            wrap: this.wrap.bind(this),
            panel: this.panel.bind(this),
        };
    }
    onRender(ctx) {
        const sys = WechatBridge.getSystemInfo();
        const w = sys.windowWidth, h = sys.windowHeight;
        const atHome = this.screen === 'home' || (this.screen === 'settings' && this.back === 'home');
        const landscapeHome = atHome && w >= h;
        this.rotated = !atHome && h > w;
        this.physicalWidth = w;
        const vw = this.rotated ? h : w, vh = this.rotated ? w : h;
        const dw = atHome && !landscapeHome ? 390 : 1280, dh = atHome && !landscapeHome ? 844 : 720;
        const left = this.rotated ? 0 : sys.safeAreaLeft, right = this.rotated ? 0 : sys.safeAreaRight;
        this.scale = Math.min((vw - left - right) / dw, vh / dh);
        this.ox = left + (vw - left - right - dw * this.scale) / 2;
        this.oy = (vh - dh * this.scale) / 2;
        ctx.fillStyle = '#090f14';
        ctx.fillRect(0, 0, w, h);
        if (atHome) {
            const image = globalResources.getImage('title');
            if (image) {
                const cover = Math.max(w / image.width, h / image.height);
                ctx.drawImage(image, (w - image.width * cover) / 2, (h - image.height * cover) / 2, image.width * cover, image.height * cover);
            }
            const shade = ctx.createLinearGradient(0, 0, w, 0);
            shade.addColorStop(0, 'rgba(15,4,4,.9)');
            shade.addColorStop(.65, 'rgba(15,4,4,.4)');
            shade.addColorStop(1, 'rgba(15,4,4,.15)');
            ctx.fillStyle = shade;
            ctx.fillRect(0, 0, w, h);
        }
        ctx.save();
        if (this.rotated) {
            ctx.translate(w, 0);
            ctx.rotate(Math.PI / 2);
        }
        ctx.translate(this.ox, this.oy);
        ctx.scale(this.scale, this.scale);
        this.buttons = [];
        if (atHome) {
            if (landscapeHome) {
                GameViews.drawLandscapeHome(ctx, this.uiHelper, this.selected, this.progress, {
                    start: (daily) => this.start(daily),
                    switchNight: () => { this.selected = this.selected % this.progress.unlocked + 1; },
                    openSettings: () => { this.back = 'home'; this.screen = 'settings'; }
                });
                if (this.screen === 'settings') {
                    GameViews.drawSettingsPanel(ctx, this.uiHelper, this.settings, () => { this.screen = 'home'; this.clearInput(); }, () => { this.screen = this.back; this.clearInput(); });
                }
            }
            else {
                GameViews.drawPortraitHome(ctx, this.uiHelper, this.selected, this.progress, {
                    start: (daily) => this.start(daily),
                    switchNight: () => { this.selected = this.selected % this.progress.unlocked + 1; },
                    openSettings: () => { this.back = 'home'; this.screen = 'settings'; }
                });
                if (this.screen === 'settings') {
                    GameViews.drawPortraitSettings(ctx, this.uiHelper, this.settings, () => { this.screen = 'home'; this.clearInput(); });
                }
            }
        }
        else {
            this.game(ctx);
            if (this.run.phase === 'result') {
                const resultAlpha = Math.min(1, Math.max(0, this.resultFadeTimer));
                ctx.save();
                ctx.globalAlpha = resultAlpha;
                GameViews.drawResult(ctx, this.uiHelper, this.run, this.daily, {
                    onHome: () => { this.screen = 'home'; },
                    onRestart: () => this.start(this.daily)
                });
                ctx.restore();
            }
            if (this.screen === 'settings') {
                GameViews.drawSettingsPanel(ctx, this.uiHelper, this.settings, () => { this.screen = 'home'; this.clearInput(); }, () => { this.screen = this.back; this.clearInput(); });
            }
            if (this.resume > 0) {
                this.box(ctx, 450, 290, 380, 95, '#111a20');
                this.text(ctx, '正在回到这个夜晚…', 640, 337, 24, '#ece3d2', 'center');
            }
        }
        ctx.restore();
    }
    game(ctx) {
        const r = this.run, img = globalResources.getImage('house');
        this.box(ctx, 0, 0, 1280, 720, '#0b1219');
        ctx.save();
        ctx.translate(this.mapX, this.mapY);
        ctx.scale(this.mapScale, this.mapScale);
        if (img)
            ctx.drawImage(img, 0, 0, 1580, 996);
        else {
            for (const f of floors)
                this.box(ctx, f.x, f.y, f.w, f.h, '#665442');
            for (const f of furniture)
                this.box(ctx, f.x, f.y, f.w, f.h, '#292a29');
        }
        // this.drawCollisionDebug(ctx);
        for (const d of doorDefinitions) {
            ctx.strokeStyle = r.closed.has(d.id) ? '#d9ba84' : '#617e78';
            ctx.lineWidth = 7;
            ctx.beginPath();
            if (d.h > d.w) {
                ctx.moveTo(d.x, d.y - d.h / 2);
                ctx.lineTo(d.x + (r.closed.has(d.id) ? 0 : 24), d.y + d.h / 2);
            }
            else {
                ctx.moveTo(d.x - d.w / 2, d.y);
                ctx.lineTo(d.x + d.w / 2, d.y + (r.closed.has(d.id) ? 0 : 20));
            }
            ctx.stroke();
        }
        for (const s of r.spots) {
            if (s.kind === 'toy' && (r.found.has(s.id) || r.carrying?.id === s.id))
                continue;
            if (s.kind === 'toy')
                this.prop(ctx, s.toy, s.x, s.y + 12, 34);
        }
        r.family.forEach((f, i) => {
            if (f.state === 'sleep' || f.state === 'alert') {
                f.sleep < 70;
                const posX = i === 0 ? 229 : 281;
                const posY = 108;
                this.sleeper(ctx, posX, posY, f.name, i === 0 ? '#758998' : '#ac8493', false, f.state === 'alert');
                if (i === 1 && r.momToy && f.state === 'sleep') {
                    ctx.save();
                    ctx.translate(posX + 14, posY + 10);
                    ctx.rotate(0.2);
                    this.prop(ctx, r.momToy, 0, 0, 22);
                    ctx.restore();
                }
                if (f.state === 'alert') {
                    const alertColor = i === 1 ? '#ff6464' : '#e6be8a';
                    const alertText = i === 1 ? `揉眼中 · ${Math.ceil(f.timer)}秒 💢` : `揉眼中 · ${Math.ceil(f.timer)}秒`;
                    const alertX = i === 0 ? 218 : 292;
                    this.text(ctx, alertText, alertX, 68, 12, alertColor, 'center');
                }
                if (f.chatter && f.chatterTimer && f.chatterTimer > 0) {
                    this.text(ctx, f.chatter, i === 0 ? 229 : 281, 52, 13, '#ffffff', 'center');
                }
            }
        });
        const babyLabel = r.babySleepShield > 0 ? `婴儿 · 安睡 ${Math.ceil(r.babySleepShield)}s` : (r.cry > 75 ? '婴儿 · 哭闹' : '婴儿');
        this.sleeper(ctx, 214, 558, babyLabel, r.babySleepShield > 0 ? '#78b598' : '#b9b093', true, r.cry > 75 && r.babySleepShield <= 0);
        r.family.forEach((f, i) => {
            if (f.state === 'active') {
                const isMom = i === 1;
                const isAngry = !f.returning && (isMom || (r.dadForgives <= 0 && r.family[1].state === 'sleep'));
                if (!this.sprites.draw(ctx, 'family' + i, isMom ? 'mother' : 'father', f, isAngry))
                    this.actor(ctx, f, '#c09f7a', .9);
                const nameColor = (isMom && isAngry) ? '#ff5454' : '#ecd4ac';
                const displayName = (isMom && isAngry) ? `${f.name} 💢` : f.name;
                this.text(ctx, displayName, f.x, f.y - 45, 15, nameColor, 'center');
                // 碎碎念文字（无背景纯文字，带阴影提升辨识度）
                if (f.chatter && f.chatterTimer && f.chatterTimer > 0) {
                    ctx.save();
                    ctx.shadowColor = '#000000';
                    ctx.shadowBlur = 4;
                    this.text(ctx, f.chatter, f.x, f.y - 68, 13, isMom && isAngry ? '#ffe2e2' : '#ffffff', 'center');
                    ctx.restore();
                }
            }
        });
        const glow = ctx.createRadialGradient(r.player.x, r.player.y, 4, r.player.x, r.player.y, 92);
        glow.addColorStop(0, 'rgba(229,219,169,.18)');
        glow.addColorStop(1, 'rgba(229,219,169,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(r.player.x - 95, r.player.y - 95, 190, 190);
        // 绘制脚底声音涟漪
        ctx.save();
        ctx.lineWidth = 1.5;
        for (const ripple of this.ripples) {
            const progress = ripple.age / 0.35;
            const radius = 6 + progress * (ripple.strength * 10);
            const alpha = Math.pow(1 - progress, 2) * (0.15 + ripple.strength * 0.35);
            ctx.strokeStyle = `rgba(210, 217, 204, ${alpha.toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
        // Keep the reachable bedside anchor for inspection; draw the sleeper on the pillow.
        const isEatingOrCarrying = Boolean(r.carrying || r.activity === 'cake');
        const playerPose = r.playerStunTimer > 0 ? 'stun' : (isEatingOrCarrying ? 'eat' : 'default');
        const hopY = r.momCaught ? -Math.abs(Math.sin(this.clock * 22)) * 10 : 0;
        const shakeX = r.momCaught ? Math.sin(this.clock * 32) * 2 : 0;
        const drawPlayerPos = { x: r.player.x + shakeX, y: r.player.y + hopY };
        if (r.sleeping)
            this.sleeper(ctx, 240, 315, '装睡', '#526b87');
        else if (!this.sprites.draw(ctx, 'player', 'girl', drawPlayerPos, false, r.hidden ? .4 : 1, playerPose))
            this.actor(ctx, drawPlayerPos, r.hidden ? '#7b8e9a' : '#d1d8ca', r.hidden ? .4 : 1);
        if (r.playerStunTimer > 0) {
            const shake = Math.sin(this.clock * 45) * 2;
            ctx.save();
            ctx.font = 'bold 24px sans-serif';
            ctx.fillStyle = '#ff3b3b';
            ctx.shadowColor = '#000';
            ctx.shadowBlur = 4;
            ctx.textAlign = 'center';
            ctx.fillText('！', r.player.x + shake, r.player.y + hopY - 48);
            ctx.restore();
        }
        if (r.momCaught) {
            ctx.save();
            // 1. 头顶三颗旋转眩晕小星星
            for (let s = 0; s < 3; s++) {
                const starAngle = this.clock * 7 + s * (Math.PI * 2 / 3);
                const starX = r.player.x + Math.cos(starAngle) * 20;
                const starY = r.player.y + hopY - 48 + Math.sin(starAngle) * 7;
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('💫', starX, starY);
            }
            // 2. 经典漫画击打爆星与“啪！”拟声词（精准在妈妈与主角屁股/后背交界处爆发）
            const mom = r.family[1];
            const spankPhase = (this.clock * 3.8) % 1;
            const spankSide = Math.sin(this.clock * 8) > 0 ? 1 : -1;
            let hitX = r.player.x + spankSide * 12;
            let hitY = r.player.y + 6;
            if (mom) {
                const dx = mom.x - r.player.x;
                const dy = mom.y - r.player.y;
                const d = Math.hypot(dx, dy) || 1;
                // 靠近老妈一侧的后背/屁股
                hitX = r.player.x + (dx / d) * 14 + spankSide * 4;
                hitY = r.player.y + (dy / d) * 14 + hopY + 6;
            }
            if (spankPhase < 0.65) {
                ctx.save();
                const pop = 1.0 + 0.35 * Math.sin(spankPhase / 0.65 * Math.PI);
                ctx.translate(hitX, hitY);
                ctx.scale(pop, pop);
                ctx.font = 'bold 22px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = '#ffe27a';
                ctx.shadowBlur = 6;
                ctx.fillText('💥', 0, 0);
                // 拟声词飘起
                ctx.font = 'bold 13px sans-serif';
                ctx.fillStyle = '#ffdf4a';
                ctx.shadowColor = '#000000';
                ctx.shadowBlur = 3;
                const words = ['啪！', '嗷！', '啪啪！'];
                const word = words[Math.floor((this.clock * 2.5) % words.length)];
                ctx.fillText(word, 0, -18);
                ctx.restore();
            }
            // 3. 喷涌飞出的滑稽宽面条眼泪粒子
            for (const dir of [-1, 1]) {
                for (let p = 0; p < 3; p++) {
                    const tearPhase = (this.clock * 3.0 + p * 0.33) % 1;
                    const tX = r.player.x + dir * (10 + tearPhase * 18);
                    const tY = r.player.y - 28 - Math.sin(tearPhase * Math.PI) * 12 + tearPhase * 8;
                    const alpha = (1 - tearPhase) * 0.95;
                    ctx.fillStyle = `rgba(100, 200, 255, ${alpha.toFixed(2)})`;
                    ctx.beginPath();
                    ctx.arc(tX, tY, 2.2 * (1 - tearPhase * 0.4), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            // 4. 妈妈头顶伴随挥掌怒气「💢」
            if (mom) {
                const angryScale = 1.0 + Math.sin(this.clock * 12) * 0.2;
                ctx.save();
                ctx.translate(mom.x, mom.y - 50);
                ctx.scale(angryScale, angryScale);
                ctx.font = 'bold 18px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('💢', 0, 0);
                ctx.restore();
            }
            ctx.restore();
        }
        // 选项C：双向受惊呼应系统（冷汗水滴）
        const beingChased = !r.sleeping && !r.hidden && r.family.some(f => f.state === 'active' && !f.returning && distance(f, r.player) < 260);
        if (r.playerStunTimer > 0) {
            const sweatBob = Math.sin(this.clock * 22) * 1.5;
            drawSweatDrop(ctx, r.player.x + 18, r.player.y - 34 + sweatBob, 5.5, 0.3);
            drawSweatDrop(ctx, r.player.x - 18, r.player.y - 34 + sweatBob, 5.5, -0.3);
        }
        else if (beingChased) {
            const sweatBob = Math.sin(this.clock * 16) * 2.0;
            drawSweatDrop(ctx, r.player.x + 14, r.player.y - 35 + sweatBob, 6.0, 0.28);
            drawSweatDrop(ctx, r.player.x + 21, r.player.y - 42 + sweatBob * 0.8, 3.8, 0.38);
        }
        if (r.carrying && !r.sleeping && !r.hidden) {
            this.prop(ctx, r.carrying.toy, r.player.x, r.player.y + 1, 31);
        }
        if (r.tvOn) {
            this.box(ctx, 746, 148, 100, 39, '#628b9c');
            this.text(ctx, '♪', 797, 167, 22, '#d5edb2', 'center');
        }
        if (r.activity) {
            const px = r.player.x, py = r.player.y - 67; // 进度条依然在头顶
            // 蛋糕图标移动到人物嘴巴位置 (y-18 左右)
            if (r.activity === 'cake') {
                const mouthY = r.player.y - 18;
                // 每 0.4 秒交替旋转一下 (-5度到5度)，并且随着进度缩小
                const eatingAngle = (Math.floor(this.clock * 2.5) % 2 === 0) ? -0.1 : 0.1;
                const currentScale = 1 - r.actionProgress; // 进度越满，蛋糕越小
                if (currentScale > 0.05) {
                    ctx.save();
                    ctx.translate(r.player.x, mouthY);
                    ctx.rotate(eatingAngle);
                    ctx.scale(currentScale, currentScale);
                    this.prop(ctx, 'cake', 0, 0, 18);
                    ctx.restore();
                }
            }
            else {
                // 电视图标还是在进度条旁边
                this.prop(ctx, r.activity, px - 37, py, 18);
            }
            // 进度槽底色和进度色
            this.box(ctx, px - 23, py - 3, 58, 6, '#283138');
            this.box(ctx, px - 23, py - 3, 58 * r.actionProgress, 6, '#e7b18c');
        }
        // 主角碎碎念气泡（含平滑淡入淡出与轻柔上浮动画）
        if (r.taskLineTime > 0 && !this.floatText && !r.sleeping && !r.hidden) {
            const dur = r.taskLineDuration || 2.6;
            const elapsed = dur - r.taskLineTime;
            const fadeIn = Math.min(1, elapsed / 0.3);
            const fadeOut = Math.min(1, r.taskLineTime / 0.35);
            const alpha = Math.max(0, Math.min(1, fadeIn * fadeOut));
            const floatY = (1 - fadeIn) * 4 + (elapsed / dur) * 3;
            const px = r.player.x;
            const py = r.activity ? (r.player.y - 67 - 20 - floatY) : (r.player.y - 48 - floatY);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.shadowColor = '#000000';
            ctx.shadowBlur = 4;
            this.text(ctx, r.taskLine, px, py + 3.5, 12, '#f6e7d0', 'center');
            ctx.restore();
        }
        if (this.floatText) {
            const progress = this.floatText.age / this.floatText.duration;
            ctx.save();
            ctx.globalAlpha = progress < 0.1 ? progress / 0.1 : progress > 0.8 ? (1 - progress) / 0.2 : 1;
            const emphasis = this.floatText.level >= 2 ? 1 + .08 * Math.max(0, 1 - this.floatText.age / .18) : 1;
            ctx.translate(r.sleeping ? 252 : r.player.x + 12, r.sleeping ? 275 : r.player.y - (r.activity ? 95 : 53));
            ctx.scale(emphasis, emphasis);
            ctx.shadowColor = '#080b10';
            ctx.shadowBlur = 3;
            this.text(ctx, this.floatText.text, 0, 0, this.floatText.level === 0 ? 12 : 14, this.floatText.level >= 2 ? '#c77b73' : this.floatText.level === 1 ? '#d2c7b4' : '#a6ada9', 'center');
            ctx.restore();
        }
        if (r.hidden && this.sleepDark < 0.3)
            this.text(ctx, '躲藏', r.player.x, r.player.y - 34, 16, '#fff0cd', 'center');
        ctx.restore();
        // The world extends outside the centered 1280x720 HUD on wide phones.
        // Convert the full viewport into HUD coordinates, including safe-area margins.
        const bounds = this.viewportBounds;
        const viewLeft = bounds.left;
        const viewTop = bounds.top;
        const viewWidth = bounds.width;
        const viewHeight = bounds.height;
        // Sleep darkness overlay — simulates eyes closing.
        if (this.sleepDark > 0.01) {
            ctx.fillStyle = `rgba(0,0,0,${this.sleepDark.toFixed(3)})`;
            ctx.fillRect(viewLeft, viewTop, viewWidth, viewHeight);
            if (this.sleepDark > 0.6) {
                const inspecting = r.inspecting;
                const nearbyParent = r.sleeping && (inspecting || r.family.some(f => f.state === 'active' && distance(f, r.player) < 320));
                const alpha = Math.min(1, (this.sleepDark - 0.6) / 0.32).toFixed(3);
                let hint;
                if (inspecting)
                    hint = `别……动……  ${Math.ceil(r.inspectionTimer)}`;
                else if (nearbyParent)
                    hint = '有脚步声……别动';
                else
                    hint = '交互键 · 起身';
                this.text(ctx, hint, 640, 680, 14, `rgba(180,160,130,${alpha})`, 'center');
                // Breathing guide circle — only visible during inspection.
                if (inspecting) {
                    const bPhase = r.breathPhase;
                    // Triangle wave: inhale 0→0.5 (expand), exhale 0.5→1 (contract)
                    const breathT = bPhase < 0.5 ? bPhase * 2 : (1 - bPhase) * 2;
                    const radius = 22 + 28 * breathT;
                    const inWindow = bPhase >= 0.68 && bPhase <= 0.95;
                    const circleAlpha = parseFloat(alpha) * (inWindow ? 0.75 : 0.35);
                    const cx = viewLeft + viewWidth / 2, cy = viewTop + viewHeight / 2;
                    ctx.save();
                    ctx.strokeStyle = inWindow ? `rgba(160,210,185,${circleAlpha})` : `rgba(110,150,140,${circleAlpha})`;
                    ctx.lineWidth = inWindow ? 2 : 1.5;
                    ctx.beginPath();
                    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                    ctx.stroke();
                    // Pulsing dot at center when in tap window ("breathe out now")
                    if (inWindow) {
                        const dotAlpha = circleAlpha * (0.5 + 0.5 * Math.sin(this.clock * 14));
                        ctx.fillStyle = `rgba(160,210,185,${dotAlpha.toFixed(3)})`;
                        ctx.beginPath();
                        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();
                }
            }
        }
        const topGlow = ctx.createLinearGradient(0, 0, 0, 110);
        topGlow.addColorStop(0, 'rgba(5,2,2,0.95)');
        topGlow.addColorStop(1, 'rgba(5,2,2,0)');
        ctx.fillStyle = topGlow;
        ctx.fillRect(viewLeft, viewTop, viewWidth, 110 - viewTop);
        this.text(ctx, '疯狂妈妈MaMa', 45, 36, 24, '#ba3434');
        this.text(ctx, `第 ${r.night} 夜  ·  ${Math.floor(r.elapsed / 60).toString().padStart(2, '0')}:${Math.floor(r.elapsed % 60).toString().padStart(2, '0')}`, 45, 68, 14, '#8a7d76');
        const meters = [...r.family.map(f => ({ name: f.name, value: f.sleep, sub: f.state === 'sleep' ? (f.sleep < 30 ? '快醒了' : f.sleep < 70 ? '浅睡' : '沉睡') : f.state === 'alert' ? '惊动！' : '走动中' })), { name: '婴儿', value: r.babySleepShield > 0 ? 100 : 100 - r.cry, sub: r.babySleepShield > 0 ? `安睡 ${Math.ceil(r.babySleepShield)}s` : (r.cry > 75 ? '哭闹！' : r.cry > 40 ? '躁动' : '安静') }, { name: '你的睡意', value: r.sleepProgress, sub: `${Math.floor(r.sleepProgress)}%` }];
        meters.forEach((m, i) => { const x = 280 + i * 180; this.text(ctx, m.name, x, 36, 16, '#c4b5a3'); this.text(ctx, m.sub, x + 135, 36, 13, i === 3 ? '#c44343' : '#918274', 'right'); this.box(ctx, x, 56, 135, 3, '#1a1010'); this.box(ctx, x, 56, Math.max(1, m.value * 1.35), 3, i === 3 ? '#8b1e1e' : '#736555'); });
        this.text(ctx, `机会 ${Math.max(0, 3 - r.caughtByFamily)}`, 1080, 48, 17, '#ba8d84', 'right');
        if (r.phase === 'explore')
            this.button(ctx, { x: 1115, y: 28, w: 90, h: 42, label: '暂停', action: () => { this.back = 'play'; this.screen = 'settings'; this.clearInput(); } });
        // 🚨 婴儿大哭 & 妈妈破门冲锋危机提示（纯净通透悬浮，彻底移除突兀生硬的红色背景框）
        if (r.cry >= 75 && r.babySleepShield <= 0 && r.phase === 'explore') {
            const bannerPulse = 0.85 + 0.15 * Math.sin(this.clock * 8);
            const alpha = (0.92 * bannerPulse).toFixed(2);
            ctx.save();
            ctx.shadowColor = '#000000';
            ctx.shadowBlur = 6;
            this.text(ctx, '🚨 小宝宝嚎啕大哭！妈妈被彻底吵醒，正破门冲来！！', 640, 84, 13, `rgba(255, 95, 95, ${alpha})`, 'center');
            ctx.restore();
        }
        const isDraining = r.sleepDrainRate > 0;
        let status = `剩余 ${Math.max(0, Math.ceil(r.timeLimit - r.elapsed))} 秒${r.tvOn ? ' · 电视还开着' : ''}`;
        if (isDraining) {
            status = '被爸妈追赶惊吓！肾上腺素飙升，睡意正在飞速消散！！';
        }
        else if (r.sleeping) {
            status = r.sleepProgress >= 100 ? '睡意圆满… 正在进入深度甜蜜梦乡…' : `在床上装睡避险中 · 睡意 ${Math.floor(r.sleepProgress)}%`;
        }
        else if (r.hidden) {
            status = `躲藏平复心率中 · 屏息耐力 ${Math.ceil(r.breath)}%`;
        }
        this.text(ctx, status, 640, 680, 15, isDraining ? '#ff7373' : '#c7d3c0', 'center');
        // 虚拟摇杆
        const restingX = 139, restingY = 550, origin = this.joystick ? this.joystick.origin : { x: restingX, y: restingY };
        ctx.strokeStyle = '#68858d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, 65, 0, Math.PI * 2);
        ctx.stroke();
        const joy = this.joystick;
        const delta = joy ? { x: joy.current.x - joy.origin.x, y: joy.current.y - joy.origin.y } : { x: 0, y: 0 };
        const len = Math.max(1, Math.hypot(delta.x, delta.y) / 55);
        ctx.fillStyle = '#91aab0';
        ctx.beginPath();
        ctx.arc(origin.x + delta.x / len, origin.y + delta.y / len, 43, 0, Math.PI * 2);
        ctx.fill();
        // 圆形交互按钮
        const btnCx = 1141, btnCy = 550, btnR = 80;
        const label = r.interactionLabel;
        const hasInteraction = label.length > 0;
        this.buttons.push({
            x: btnCx - btnR,
            y: btnCy - btnR,
            w: btnR * 2,
            h: btnR * 2,
            label,
            primary: hasInteraction,
            action: () => {
                if (this.lullabyBtnProgress > 0.25) {
                    this.tapBtnAnim = 1.0;
                }
                r.interact();
            }
        });
        // 底部提示文字
        this.text(ctx, 'WASD / 方向键 · Shift 慢走', restingX, 700, 11, '#72878b', 'center');
        // 普通交互/待机形态按钮（随 lullabyBtnProgress 平滑淡出）
        if (this.lullabyBtnProgress < 0.999) {
            ctx.save();
            if (this.lullabyBtnProgress > 0.001) {
                ctx.globalAlpha = 1 - this.lullabyBtnProgress;
            }
            if (hasInteraction) {
                const pulse = 0.85 + 0.15 * Math.sin(this.clock * 3.5);
                const glowR = btnR * 1.4 * pulse;
                const glow2 = ctx.createRadialGradient(btnCx, btnCy, btnR * 0.6, btnCx, btnCy, glowR);
                glow2.addColorStop(0, 'rgba(140,20,20,0.28)');
                glow2.addColorStop(1, 'rgba(140,20,20,0)');
                ctx.fillStyle = glow2;
                ctx.beginPath();
                ctx.arc(btnCx, btnCy, glowR, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(30,8,8,0.88)';
                ctx.beginPath();
                ctx.arc(btnCx, btnCy, btnR, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#a83232';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(btnCx, btnCy, btnR, 0, Math.PI * 2);
                ctx.stroke();
                const lines = label.split('/').map((s) => s.trim());
                if (lines.length > 1) {
                    this.text(ctx, lines[0], btnCx, btnCy - 11, 17, '#e8d4b3', 'center');
                    this.text(ctx, lines[1], btnCx, btnCy + 13, 14, '#a38a7a', 'center');
                }
                else
                    this.text(ctx, label, btnCx, btnCy, 17, '#e8d4b3', 'center');
            }
            else {
                ctx.fillStyle = 'rgba(20,24,28,0.35)';
                ctx.beginPath();
                ctx.arc(btnCx, btnCy, btnR, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#323c42';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(btnCx, btnCy, btnR, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        }
        // 专属轻拍哄睡金色手势按钮（图 1 风格：跟随光点点击 + 食指放射线 + 弹性弹开过渡）
        if (this.lullabyBtnProgress > 0.001) {
            this.drawLullabyActionButton(ctx, btnCx, btnCy, btnR, this.lullabyBtnProgress, this.clock, this.tapBtnAnim);
        }
        // 绘制哄睡小游戏 UI
        this.lullabyOverlay.draw(ctx, r.lullaby, this.clock, this.text.bind(this));
        // Red heartbeat vignette drawn last — on top of all HUD — so it appears on all four edges.
        if (this.sleepDark > 0.01) {
            const inspecting = r.inspecting;
            const nearbyParent = r.sleeping && (inspecting || r.family.some(f => f.state === 'active' && distance(f, r.player) < 320));
            if (nearbyParent) {
                const pulseFreq = inspecting ? 8 : 5;
                const pulseAmp = inspecting ? 0.22 : 0.12;
                const pulseBase = inspecting ? 0.30 : 0.18;
                const pulse = pulseBase + pulseAmp * Math.sin(this.clock * pulseFreq);
                const edgeAlpha = (pulse * this.sleepDark * 0.45).toFixed(3);
                const redEdge = `rgba(100,5,5,${edgeAlpha})`;
                const clear = 'rgba(0,0,0,0)';
                const ex = viewWidth * 0.38, ey = viewHeight * 0.38;
                const tg = ctx.createLinearGradient(0, viewTop, 0, viewTop + ey);
                tg.addColorStop(0, redEdge);
                tg.addColorStop(1, clear);
                ctx.fillStyle = tg;
                ctx.fillRect(viewLeft, viewTop, viewWidth, ey);
                const bg = ctx.createLinearGradient(0, viewTop + viewHeight, 0, viewTop + viewHeight - ey);
                bg.addColorStop(0, redEdge);
                bg.addColorStop(1, clear);
                ctx.fillStyle = bg;
                ctx.fillRect(viewLeft, viewTop + viewHeight - ey, viewWidth, ey);
                const lg = ctx.createLinearGradient(viewLeft, 0, viewLeft + ex, 0);
                lg.addColorStop(0, redEdge);
                lg.addColorStop(1, clear);
                ctx.fillStyle = lg;
                ctx.fillRect(viewLeft, viewTop, ex, viewHeight);
                const rg = ctx.createLinearGradient(viewLeft + viewWidth, 0, viewLeft + viewWidth - ex, 0);
                rg.addColorStop(0, redEdge);
                rg.addColorStop(1, clear);
                ctx.fillStyle = rg;
                ctx.fillRect(viewLeft + viewWidth - ex, viewTop, ex, viewHeight);
            }
        }
        // 被妈妈抓获时戏剧落幕特效（前 2.6 秒纯现场挨揍狂欢，0.5 秒黑幕收拢，后 1.9 秒纯黑剧场大字从容展示）
        if (r.momCaught) {
            const curtainStart = 2.4; // 倒数至 2.4 秒时开始收拢黑幕（前 2.6 秒为无遮挡纯现场挨揍表演）
            const textStart = 1.9; // 倒数至 1.9 秒时黑幕已完全纯黑，专场大字登场
            if (r.momCaughtTimer <= curtainStart) {
                ctx.save();
                // 黑幕淡入阶段：2.4s -> 1.9s（0.5 秒内平滑升至 1.0 纯黑）
                const fadeProgress = Math.min(1, Math.max(0, (curtainStart - r.momCaughtTimer) / (curtainStart - textStart)));
                ctx.fillStyle = `rgba(0, 0, 0, ${(fadeProgress * 0.98).toFixed(3)})`;
                ctx.fillRect(viewLeft, viewTop, viewWidth, viewHeight);
                // 专场落幕大字展示阶段：1.9s -> 0s（持续整整 1.9 秒，背景纯黑，无底层气泡重叠打架）
                if (r.momCaughtTimer <= textStart) {
                    const textElapsed = textStart - r.momCaughtTimer; // 0 -> 1.9 秒
                    const enterAnim = Math.min(1, textElapsed / 0.28); // 0.28 秒弹性缩放浮现
                    const scale = 0.92 + 0.08 * Math.sin(enterAnim * Math.PI * 0.5);
                    const alpha = Math.min(1, textElapsed / 0.18);
                    ctx.save();
                    ctx.translate(640, 345);
                    ctx.scale(scale, scale);
                    ctx.shadowColor = '#ff3344';
                    ctx.shadowBlur = 10;
                    this.text(ctx, '惨遭老妈物理制裁，屁股开花……💥', 0, 0, 28, `rgba(255, 95, 95, ${alpha.toFixed(2)})`, 'center');
                    ctx.shadowColor = '#000000';
                    ctx.shadowBlur = 6;
                    this.text(ctx, '——大半夜不睡觉，被老妈赏了一顿热气腾腾的竹笋炒肉😭——', 0, 42, 15, `rgba(245, 225, 190, ${(alpha * 0.9).toFixed(2)})`, 'center');
                    ctx.restore();
                }
                ctx.restore();
            }
        }
    }
    prop(ctx, kind, x, y, size) {
        const index = ['cake', 'tv', 'bear', 'rabbit', 'dino'].indexOf(kind), image = globalResources.getImage('wish-props');
        if (image && index >= 0)
            ctx.drawImage(image, index * 96, 0, 96, 96, x - size / 2, y - size / 2, size, size);
        else
            this.text(ctx, kind === 'cake' ? '蛋糕' : kind === 'tv' ? '电视' : '玩具', x, y, 10, '#edcaa0', 'center');
    }
    drawLullabyActionButton(ctx, cx, cy, r, progress, clock, tapAnim) {
        if (progress <= 0.001)
            return;
        ctx.save();
        // 弹簧进场与按压反馈
        const popBounce = Math.sin(progress * Math.PI) * 0.07;
        const pressScale = 1.0 - tapAnim * 0.08;
        const scale = (1.0 + popBounce) * pressScale;
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        // 1. 外部金色呼吸微光光环（Radial Halo）
        const pulse = 0.88 + 0.12 * Math.sin(clock * 3.6);
        const haloR = r * (1.32 * pulse);
        const halo = ctx.createRadialGradient(0, 0, r * 0.7, 0, 0, haloR);
        halo.addColorStop(0, `rgba(255, 215, 80, ${(0.36 * progress).toFixed(3)})`);
        halo.addColorStop(0.65, `rgba(255, 195, 50, ${(0.14 * progress).toFixed(3)})`);
        halo.addColorStop(1, 'rgba(255, 190, 40, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, haloR, 0, Math.PI * 2);
        ctx.fill();
        // 2. 按钮主体底盘（暗金琥珀渐变磨砂质感）
        const bgGrad = ctx.createRadialGradient(0, -r * 0.2, r * 0.1, 0, 0, r);
        bgGrad.addColorStop(0, `rgba(48, 34, 12, ${(0.82 * progress).toFixed(3)})`);
        bgGrad.addColorStop(1, `rgba(22, 16, 6, ${(0.92 * progress).toFixed(3)})`);
        ctx.fillStyle = bgGrad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        // 3. 亮金色发光双层外轮廓
        ctx.strokeStyle = `rgba(255, 222, 115, ${(0.95 * progress).toFixed(3)})`;
        ctx.lineWidth = 3.0;
        ctx.shadowColor = '#f5b530';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        // 4. 绘制点击手势图标（手指与 5 道放射金光）
        ctx.save();
        ctx.translate(0, -18);
        const tipX = 0, tipY = -14;
        // 4.1 五道放射光芒
        ctx.shadowColor = '#ffe27a';
        ctx.shadowBlur = 6;
        ctx.strokeStyle = `rgba(255, 228, 136, ${(progress * 0.95).toFixed(3)})`;
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        const rayAngles = [-150, -115, -80, -45, -10].map(d => d * Math.PI / 180);
        const rayPulse = 0.5 + 0.5 * Math.sin(clock * 5.5);
        for (let i = 0; i < rayAngles.length; i++) {
            const ang = rayAngles[i];
            const r1 = 14 + (i % 2 === 0 ? rayPulse * 2.5 : 0);
            const r2 = 22 + (i % 2 === 0 ? rayPulse * 2.5 : 0);
            ctx.beginPath();
            ctx.moveTo(tipX + Math.cos(ang) * r1, tipY + Math.sin(ang) * r1);
            ctx.lineTo(tipX + Math.cos(ang) * r2, tipY + Math.sin(ang) * r2);
            ctx.stroke();
        }
        // 4.2 卡通手势轮廓（食指微斜，线条饱满可爱）
        ctx.save();
        ctx.translate(tipX, tipY);
        ctx.rotate(0.24); // 向右微倾斜约 14 度
        ctx.beginPath();
        // 从食指根部左侧向上
        ctx.moveTo(-5.5, 9);
        ctx.lineTo(-5.5, -7);
        // 食指指尖圆弧
        ctx.arc(0, -7, 5.5, Math.PI, 0);
        // 食指右侧向下
        ctx.lineTo(5.5, 6);
        // 中指关节
        ctx.arc(10.5, 7.5, 4.5, -Math.PI * 0.85, 0.1);
        ctx.lineTo(15, 14);
        // 无名指关节
        ctx.arc(14, 15.5, 4.2, -Math.PI * 0.85, 0.1);
        ctx.lineTo(17.5, 21.5);
        // 小指关节
        ctx.arc(15, 22.5, 3.8, -Math.PI * 0.85, 0.3);
        // 掌缘收拢
        ctx.quadraticCurveTo(11, 34, -2, 32);
        // 手腕下沿
        ctx.lineTo(-10, 26);
        // 大拇指扣握外凸
        ctx.quadraticCurveTo(-15.5, 21, -13, 14.5);
        ctx.quadraticCurveTo(-11, 9, -5.5, 9);
        ctx.closePath();
        ctx.lineWidth = 2.8;
        ctx.strokeStyle = `rgba(255, 228, 136, ${(progress * 0.98).toFixed(3)})`;
        ctx.shadowColor = '#f5b530';
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.restore();
        ctx.restore();
        // 5. 文字排版：“轻拍” 与 “跟随光点点击”
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        // 主文字“轻拍”
        ctx.font = 'bold 21px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(255, 247, 226, ${(progress * 0.98).toFixed(3)})`;
        ctx.fillText('轻拍', 0, 26);
        // 副文字“跟随光点点击”
        ctx.font = '12px sans-serif';
        ctx.fillStyle = `rgba(228, 208, 168, ${(progress * 0.88).toFixed(3)})`;
        ctx.fillText('跟随光点点击', 0, 48);
        ctx.restore();
    }
    drawCollisionDebug(ctx) {
        ctx.save();
        ctx.lineWidth = 1;
        // Match door cutouts in movement and editor overlays.
        ctx.strokeStyle = '#ff3949';
        ctx.fillStyle = 'rgba(255,35,45,.12)';
        ctx.save();
        for (const door of doorDefinitions) {
            ctx.beginPath();
            ctx.rect(0, 0, 1580, 996);
            ctx.rect(door.x - door.w / 2, door.y - door.h / 2, door.w, door.h);
            ctx.clip('evenodd');
        }
        for (const shape of collisionShapes) {
            ctx.strokeStyle = shape.kind === 'wall' ? '#ff3949' : '#d86868';
            ctx.beginPath();
            shape.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
            ctx.closePath();
            ctx.fill('evenodd');
            ctx.stroke();
        }
        ctx.restore();
        for (const door of doorDefinitions)
            if (this.run.closed.has(door.id)) {
                ctx.strokeStyle = '#ff3949';
                ctx.strokeRect(door.x - door.w / 2, door.y - door.h / 2, door.w, door.h);
            }
        ctx.strokeStyle = '#fff0ce';
        ctx.strokeRect(this.run.player.x - 10, this.run.player.y - 10, 20, 20);
        ctx.restore();
    }
    drawBabySleeper(ctx, x, y, name, awake) {
        ctx.save();
        // 呼吸或抽泣高频起伏
        const sob = awake ? Math.sin(this.clock * 28) * 1.5 : Math.sin(this.clock * 2.2) * 0.8;
        ctx.translate(x - 10, y + sob);
        // 0. 大哭时的扩散声波震荡光环（Shockwaves）
        if (awake) {
            ctx.save();
            for (let w = 0; w < 3; w++) {
                const wp = (this.clock * 1.4 + w * 0.33) % 1;
                const r = 16 + wp * 58;
                const wAlpha = (1 - wp) * 0.65;
                ctx.strokeStyle = `rgba(255, 80, 60, ${wAlpha.toFixed(2)})`;
                ctx.lineWidth = 2.0 * (1 - wp * 0.5);
                ctx.beginPath();
                ctx.arc(-16, 0, r, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        }
        // 1. 小枕头（横向枕在左侧床垫上）
        ctx.fillStyle = '#f0ebe1';
        drawRoundRect(ctx, -28, -14, 24, 28, 6);
        ctx.fill();
        ctx.strokeStyle = '#d2c8b2';
        ctx.lineWidth = 1;
        ctx.stroke();
        // 2. 完整的婴儿横躺头部（旋转 90 度横睡）
        ctx.save();
        ctx.translate(-16, 0);
        // 逆时针旋转 90 度，横躺侧卧，面朝床前，大哭时剧烈挣扎晃头
        ctx.rotate(-Math.PI / 2 + (awake ? Math.sin(this.clock * 26) * 0.14 : 0));
        const img = globalResources.getImage('characters');
        const f = characterFrames[awake ? 'baby-idle-0' : 'baby-idle-2'] || characterFrames['baby-idle-0'];
        const bw = 26, bh = 20;
        if (img && f) {
            ctx.drawImage(img, f.x, f.y, f.w, 70, -bw / 2, -bh / 2, bw, bh);
        }
        else {
            ctx.fillStyle = '#eedac3';
            ctx.beginPath();
            ctx.arc(0, 0, 10, 0, Math.PI * 2);
            ctx.fill();
        }
        // 大哭表情：痛苦紧闭双眼 + 张开嚎啕深红大嘴与粉嫩小舌头
        if (awake) {
            // 嚎啕大哭张开的深红大嘴
            ctx.fillStyle = '#8a1818';
            ctx.beginPath();
            ctx.ellipse(0, 3.2, 4.6, 3.2, 0, 0, Math.PI * 2);
            ctx.fill();
            // 哭腔粉红小舌头
            ctx.fillStyle = '#f89a9a';
            ctx.beginPath();
            ctx.ellipse(0, 4.8, 2.6, 1.6, 0, 0, Math.PI * 2);
            ctx.fill();
            // 痛苦紧闭的哭眼线（两条弯曲向上的闭眼弧线）
            ctx.strokeStyle = '#5a3d28';
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.arc(-4.6, -2.6, 3.2, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(4.6, -2.6, 3.2, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
        }
        ctx.restore();
        // 3. 婴儿小被子（从脖颈下方自然向右延展盖住身子）
        const quiltX = 0;
        const quiltY = -12;
        const quiltW = 46;
        const quiltH = 24;
        const quiltColor = awake ? '#d17979' : '#9fc3cc';
        const quiltBorder = awake ? '#a14d4d' : '#7ba2ab';
        ctx.save();
        if (awake) {
            // 大哭蹬被子微倾动效
            ctx.translate(quiltX, quiltY + quiltH / 2);
            ctx.rotate(Math.sin(this.clock * 18) * 0.06);
            ctx.translate(-quiltX, -0);
        }
        // 身体被窝底垫
        ctx.fillStyle = '#8ca8b8';
        drawRoundRect(ctx, quiltX - 2, quiltY + 2, quiltW, quiltH - 2, 8);
        ctx.fill();
        // 柔软小被子
        ctx.fillStyle = quiltColor;
        drawRoundRect(ctx, quiltX, quiltY, quiltW, quiltH, 8);
        ctx.fill();
        ctx.strokeStyle = quiltBorder;
        ctx.lineWidth = 1;
        ctx.stroke();
        // 被子领口白边
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        drawRoundRect(ctx, quiltX, quiltY, 5, quiltH, 2);
        ctx.fill();
        ctx.restore();
        // 4. 呼噜动画 vs 大哭泪花与嚎啕弹跳符号
        if (!awake) {
            for (let k = 0; k < 3; k++) {
                const progress = (this.clock * 0.75 + k * 0.33) % 1;
                const zX = -12 + progress * 8 + Math.sin(progress * Math.PI * 2) * 2;
                const zY = -16 - progress * 24;
                const zSize = Math.floor(9 + progress * 6);
                const alpha = progress < 0.2 ? (progress / 0.2) : progress > 0.65 ? (1 - progress) / 0.35 : 1;
                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
                ctx.shadowBlur = 3;
                const zChar = k === 2 ? 'Z' : 'z';
                this.text(ctx, zChar, zX, zY, zSize, `rgba(224, 226, 215, ${alpha.toFixed(2)})`);
                ctx.restore();
            }
        }
        else {
            // 双向喷射抛物线高光晶莹蓝泪滴
            for (let t = 0; t < 4; t++) {
                const progress = (this.clock * 2.5 + t * 0.25) % 1;
                // 左侧泪花抛物线向左上飞溅
                const t1X = -20 - progress * 16;
                const t1Y = -8 - Math.sin(progress * Math.PI) * 14 + progress * 8;
                // 右侧泪花抛物线向右上飞溅
                const t2X = -12 + progress * 14;
                const t2Y = -12 - Math.sin(progress * Math.PI) * 12 + progress * 9;
                const tAlpha = (1 - progress) * 0.95;
                ctx.fillStyle = `rgba(110, 205, 255, ${tAlpha.toFixed(2)})`;
                ctx.beginPath();
                ctx.arc(t1X, t1Y, 2.2 * (1 - progress * 0.3), 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(t2X, t2Y, 1.8 * (1 - progress * 0.3), 0, Math.PI * 2);
                ctx.fill();
            }
            // 头顶弹跳的「哇——！」血红大哭符号
            const cryScale = 1.0 + Math.sin(this.clock * 14) * 0.16;
            ctx.save();
            ctx.translate(-16, -26);
            ctx.scale(cryScale, cryScale);
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 4;
            this.text(ctx, '哇——！', 0, 0, 13, '#ff5959', 'center');
            ctx.restore();
        }
        ctx.restore();
    }
    sleeper(ctx, x, y, name, color, baby = false, awake = false) {
        if (baby) {
            this.drawBabySleeper(ctx, x, y, name, awake);
            return;
        }
        ctx.save();
        ctx.translate(x, y + Math.sin(this.clock * 1.7) * .8);
        // 枕头受压下凹柔和投影（沉浸式贴合枕面）
        ctx.save();
        const pillowShadow = ctx.createRadialGradient(0, 1, 2, 0, 1, 20);
        pillowShadow.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
        pillowShadow.addColorStop(0.65, 'rgba(0, 0, 0, 0.18)');
        pillowShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = pillowShadow;
        ctx.beginPath();
        ctx.ellipse(0, 1, 20, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        const w = baby ? 25 : 36;
        const drawn = this.sprites.head(ctx, baby ? 'baby' : name === '爸爸' ? 'father' : name === '妈妈' ? 'mother' : 'girl', 0, 0, awake, baby);
        if (!drawn) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(0, -7, baby ? 9 : 12, 0, Math.PI * 2);
            ctx.fill();
        }
        if (!awake) {
            // 经典动漫呼吸飘浮 Zzz 连环动画
            for (let k = 0; k < 3; k++) {
                const progress = (this.clock * 0.75 + k * 0.33) % 1;
                const zX = w / 2 + 6 + progress * 10 + Math.sin(progress * Math.PI * 2) * 2;
                const zY = -6 - progress * 26;
                const zSize = Math.floor(9 + progress * 7);
                const alpha = progress < 0.2 ? (progress / 0.2) : progress > 0.65 ? (1 - progress) / 0.35 : 1;
                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
                ctx.shadowBlur = 3;
                const zChar = k === 2 ? 'Z' : 'z';
                this.text(ctx, zChar, zX, zY, zSize, `rgba(224, 226, 215, ${alpha.toFixed(2)})`);
                ctx.restore();
            }
        }
        ctx.restore();
    }
    actor(ctx, p, color, alpha) { ctx.save(); ctx.globalAlpha = alpha; const shadow = ctx.createRadialGradient(p.x, p.y + 23, 1, p.x, p.y + 23, 15); shadow.addColorStop(0, 'rgba(0,0,0,.38)'); shadow.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = shadow; ctx.save(); ctx.translate(p.x, p.y + 23); ctx.scale(1, .4); ctx.translate(-p.x, -p.y - 23); ctx.beginPath(); ctx.arc(p.x, p.y + 23, 15, 0, Math.PI * 2); ctx.fill(); ctx.restore(); this.box(ctx, p.x - 11, p.y - 4, 22, 27, color); ctx.fillStyle = '#d8c3a3'; ctx.beginPath(); ctx.arc(p.x, p.y - 12, 11, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#2b2c2d'; ctx.beginPath(); ctx.arc(p.x, p.y - 16, 10, Math.PI, Math.PI * 2); ctx.fill(); ctx.restore(); }
    point(p) { const x = this.rotated ? p.y : p.x, y = this.rotated ? this.physicalWidth - p.x : p.y; return { x: (x - this.ox) / this.scale, y: (y - this.oy) / this.scale, identifier: p.identifier }; }
    onTouchStart(raw) {
        const p = this.point(raw);
        this.debugTouches.push({ rawX: raw.x, rawY: raw.y, pX: p.x, pY: p.y, time: Date.now() });
        console.log('[Touch] raw:', raw.x, raw.y, 'mapped:', p.x.toFixed(1), p.y.toFixed(1), 'buttons:', this.buttons.length);
        if (this.screen === 'play' && this.run.inspecting) {
            this.run.tapBreath();
            return;
        }
        // 哄睡小游戏期间：点击屏幕上方小游戏区域直接击打节拍
        if (this.screen === 'play' && this.run.lullaby && this.lullabyOverlay.hitTest(p)) {
            this.run.interact();
            return;
        }
        if (this.screen === 'play' && this.run.phase !== 'result' && p.x >= 1045 && p.x <= 1238 && p.y >= 566 && p.y <= 627) {
            this.actionId = p.identifier;
            this.holding = true;
            this.holdTime = 0;
            this.heldAction = false;
            return;
        }
        const b = [...this.buttons].reverse().find(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
        if (b) {
            b.action();
            return;
        }
        if (this.screen === 'play' && p.x < 280 && p.y > 465 && this.run.phase !== 'result' && !this.joystick)
            this.joystick = { id: p.identifier, origin: p, current: p };
    }
    onTouchMove(raw) { const p = this.point(raw); if (this.joystick?.id === p.identifier)
        this.joystick.current = p; }
    onTouchEnd(raw) { if (this.joystick?.id === raw.identifier)
        this.joystick = null; if (this.actionId === raw.identifier)
        this.releaseAction(); }
    onExit() { this.clearInput(); this.sounds.dispose(); if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', this.keyDown);
        window.removeEventListener('keyup', this.keyUp);
    } globalEvents.off('input:reset', this.clearInput); globalEvents.off('app:hide', this.clearInput); globalEvents.off('app:show', this.onResume); }
}
MainGameScene.CHASE_PANIC_LINES = [
    '糟糕糟糕……！',
    '哇！快溜快溜！',
    '要被抓住了……！',
    '别看这边别看这边……',
    '脚步好快，救命呀！',
];

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
}
catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error('[App] 启动失败', error);
    if (typeof wx !== 'undefined' && wx.showModal) {
        wx.showModal({ title: '游戏启动失败', content: message.slice(0, 500), showCancel: false });
    }
}
