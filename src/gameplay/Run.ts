import { Point, distance, move, route, doorDefinitions, walkable } from './House';
import { WechatBridge } from '../platform/WechatBridge';
export type Phase = 'explore' | 'result';
export type ToyKind = 'bear' | 'rabbit' | 'dino';
export interface Spot extends Point { id: string; name: string; kind: 'toy' | 'cake' | 'tv' | 'storage' | 'bed' | 'baby' | 'hide'; toy?: ToyKind; }
export interface Family extends Point { name: string; sleep: number; state: 'sleep' | 'alert' | 'active'; returning?: boolean; timer: number; path: Point[]; chatter?: string; chatterTimer?: number; repathTimer?: number; }
export function seeded(seed: string): () => number {
  let n = 2166136261;
  for (const c of seed) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const TOY_PICKUP_CHATTER: Record<ToyKind, string[]> = {
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

const TOY_CARRY_CHATTER: Record<ToyKind, string[]> = {
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

const spawns: Point[] = [{ x: 340, y: 385 }, { x: 1040, y: 225 }, { x: 980, y: 835 }, { x: 350, y: 660 }, { x: 1250, y: 540 }, { x: 690, y: 245 }];
export interface LullabyState {
  progress: number; // 0 ~ 1 光标位置
  direction: number; // 1: 向右, -1: 向左
  combo: number; // 当前连击数 (0 ~ 6)
  maxCombo: number; // 6
  feedback: string; // '拍得刚刚好' / '太轻了…' / '太重了！'
  feedbackTimer: number; // 反馈显示倒计时
  hitTimer: number; // 命中反馈倒计时 (0 ~ 0.45s)
  hitProgress: number; // 命中瞬间光标精确位置 (0 ~ 1)
  sweetCenter: number; // 舒适区当前中心位置 (0 ~ 1，带轻柔摆动)
  sweetWidth: number; // 舒适区当前宽度比例 (0.19 ~ 0.34)
  swayClock: number; // 摇篮摆动时钟
  missCount: number; // 当前失误次数 (0 ~ 2)
  maxMiss: number; // 最大允许失误次数 (2)
}

export class Run {
  player: Point = { x: 335, y: 370 };
  phase: Phase = 'explore'; elapsed = 0; phaseTime = 0; cry = 12; noise = 0; totalNoise = 0;
  closed = new Set<string>(); found = new Set<string>(); delivered = 0;
  cakeProgress = 0; tvProgress = 0; tvOn = false;
  activity: 'cake' | 'tv' | null = null;
  carrying: Spot | null = null;
  carryChatterTimer = 0;
  taskLine = ''; taskLineTime = 0; taskLineDuration = 2.6; private chatter = 0; private chatterIndex = 0;
  sayChatter(line: string, duration = 2.6) { this.taskLine = line; this.taskLineTime = duration; this.taskLineDuration = duration; }
  lullaby: LullabyState | null = null;
  babySleepShield = 0; // 60秒安睡护盾
  playerStunTimer = 0; // 吓呆定身倒计时
  momChaseChatterTimer = 1.0; // 妈妈追逐气泡台词计时器
  momCaught = false; // 是否被妈妈当场抓获
  momCaughtTimer = 0; // 抓获后眩晕落幕倒计时（2秒）
  momSpankBeat = 0; // 挨揍节拍计时器
  revivesUsed = 0; // 本局已使用分享复活次数（每局限1次）
  get canRevive(): boolean { return this.revivesUsed === 0 && !this.escaped; }
  get completed() { return Number(this.cakeProgress >= 1) + Number(this.tvProgress >= 1) + Number(this.delivered > 0); }
  get canFinish() { return this.sleepProgress >= 80 || this.completed >= 2; }
  get moveSpeed() { return (this.carrying || this.activity === 'cake') ? 102 : 120; }
  get actionProgress() { return this.activity === 'cake' ? this.cakeProgress : this.tvProgress; }
  hidden = false; sleeping = false; breath = 100;
  caughtByFamily = 0; alerts = 0; wakes = 0; outcome = '';
  dadForgives = 2;
  message = ''; messageTime = 8;
  sleepProgress = 15; // 初始睡意 15%
  inspecting = false; inspectionTimer = 0; breathPhase = 0;

  get sleepDrainRate(): number {
    if (this.hidden || this.sleeping || this.phase === 'result') return 0;
    const activeChasers = this.family.filter(f => f.state === 'active' && !f.returning);
    if (activeChasers.length === 0) return 0;
    const closest = activeChasers.reduce((min, f) => Math.min(min, distance(f, this.player)), 999);
    if (closest < 120) return 9.5;
    if (closest < 280) return 6.0;
    return 0;
  }

  // 夜晚难度参数
  readonly timeLimit: number;
  readonly sensitivity: number;
  readonly maxCaught = 3;

  get familyQuiet() { return this.cry < 40 && this.family.every(f => f.state === 'sleep'); }

  family: Family[] = [
    { name: '爸爸', x: 340, y: 145, sleep: 100, state: 'sleep', timer: 0, path: [] },
    { name: '妈妈', x: 360, y: 195, sleep: 100, state: 'sleep', timer: 0, path: [] },
  ];
  spots: Spot[];

  constructor(public seed: string, public night = 1) {
    this.timeLimit = Math.max(200, 300 - (night - 1) * 20);
    this.sensitivity = Math.min(2.5, 0.8 + (night - 1) * 0.3);
    this.message = '偷偷吃蛋糕、看电视、抱玩具回房。完成任意两件，回床睡觉；多做有额外奖励。';
    this.messageTime = 8;
    this.spots = [
      ...(['小熊', '兔子', '小恐龙'].map((name, i) => ({ ...this.freePosition([{x:1030,y:540},{x:740,y:800},{x:1160,y:270}][i]), id: `toy${i}`, name, toy: (['bear','rabbit','dino'] as ToyKind[])[i], kind: 'toy' as const }))),
      {id:'cake',name:'偷吃蛋糕',kind:'cake',x:1050,y:155},
      {id:'tv',name:'偷看电视',kind:'tv',...this.freePosition({x:805,y:230})},
      {id:'storage',name:'玩具收纳处',kind:'storage',...this.freePosition({x:375,y:440})},
      { id: 'bed',   name: '回床装睡',   kind: 'bed',  x: 325, y: 355 },
      { id: 'baby',  name: '安抚婴儿',   kind: 'baby', x: 280, y: 595 },
      { id: 'hide',  name: '藏进衣柜',   kind: 'hide', x: 365, y: 100 },
      { id: 'hide2', name: '藏在书桌下', kind: 'hide', x: 810, y: 825 },
    ];
  }

  say(text: string) { this.message = text; this.messageTime = 6; }

  nearest(): Spot | undefined {
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

  private freePosition(preferred: Point): Point {
    for(let radius=0;radius<=120;radius+=10)for(let i=0;i<(radius?16:1);i++){
      const p={x:preferred.x+Math.cos(i*Math.PI/8)*radius,y:preferred.y+Math.sin(i*Math.PI/8)*radius};
      if(walkable({x:p.x,y:p.y+20},this.closed,10)&&route(this.player,p).length)return p;
    }
    return {...this.player};
  }
  dropToy() {
    if(!this.carrying)return;
    Object.assign(this.carrying,this.freePosition({x:this.player.x,y:this.player.y+12}));
    this.carrying=null;
    const dropLines = ['你先在这里等我一下下哦。', '先放地上喘口气，跑得更快一点。', '小声点，在这里乖乖躲好。'];
    this.sayChatter(dropLines[Math.floor(Math.random() * dropLines.length)], 2.3);
    this.say('先放这里，跑快一点。');
  }
  momToy: string | null = null;

  canGiveMomToy(): boolean {
    if (!this.carrying || this.momToy !== null) return false;
    const mom = this.family[1];
    if (!mom || mom.state !== 'sleep') return false;
    return distance(this.player, { x: 281, y: 108 }) < 85;
  }

  get interactionLabel() {
    if(this.hidden||this.sleeping)return '离开 / 长按屏息';
    if(this.lullaby) return '轻拍 / 跟随光点点击';
    if(this.canGiveMomToy())return '塞给妈妈';
    const s=this.nearest();
    if(this.carrying)return s?.kind==='storage'?'放好玩具':'放下玩具';
    if(this.activity==='cake')return '停止吃蛋糕';
    if(this.activity==='tv')return '关掉电视';
    if(s?.kind==='tv')return this.tvOn?(this.tvProgress>=1?'关掉电视':'继续看 / 长按关机'):'打开电视';
    if(s?.kind==='toy')return '抱起'+s.name;
    if(s?.kind==='baby') return '轻拍哄睡';
    if(s)return s.name;
    const d = doorDefinitions.filter(d => distance(d, this.player) < 80).sort((a, b) => distance(a, this.player) - distance(b, this.player))[0];
    if(d) return this.closed.has(d.id) ? '开门 / 长按轻开' : '关门 / 长按轻关';
    return '';
  }
  noiseAt(value: number, source = this.player, affectsBaby = true) {
    this.noise = Math.max(this.noise, value); this.totalNoise += value;
    if (this.phase !== 'explore') return;
    const proximity = (target: Point) => 1.6 / (1 + Math.pow(distance(source, target) / 120, 2));
    for (const [index, f] of this.family.entries()) {
      const target = f.state === 'sleep' ? { x: index === 0 ? 229 : 281, y: 108 } : f;
      const inParents = (p: Point) => p.x >= 70 && p.x <= 450 && p.y >= 35 && p.y <= 250;
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
    if (!this.inspecting) return;
    const inWindow = this.breathPhase >= 0.68 && this.breathPhase <= 0.95;
    if (inWindow) { this.say('……呼吸平稳。'); }
    else { this.catchPlayerByMom(); }
  }

  catchPlayerByMom() {
    if (this.phase !== 'explore' || this.momCaught) return;
    this.momCaught = true;
    this.momCaughtTimer = 3.6; // 前 1.8 秒现场暴打挨揍，后 1.8 秒纯黑剧场大字
    this.playerStunTimer = 4.0; // 确保全程定身与挨揍表情
    this.momSpankBeat = 0;
    this.caughtByFamily++;
    this.lullaby = null;
    this.activity = null;
    this.taskLineTime = 0;
    if (this.carrying) this.dropToy();
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
      if (dist < 6) { dx = -1; dy = 0; dist = 1; }
      const nx = dx / dist;
      const ny = dy / dist;
      const gap = 44;

      const candMom = { x: this.player.x - nx * gap, y: this.player.y - ny * gap };
      const candPlayer = { x: mom.x + nx * gap, y: mom.y + ny * gap };
      if (walkable({ x: candMom.x, y: candMom.y + 20 }, this.closed)) {
        mom.x = candMom.x;
        mom.y = candMom.y;
      } else if (walkable({ x: candPlayer.x, y: candPlayer.y + 20 }, this.closed)) {
        this.player.x = candPlayer.x;
        this.player.y = candPlayer.y;
      } else {
        const sideX = (dx >= 0 ? 1 : -1) * gap;
        if (walkable({ x: this.player.x - sideX, y: this.player.y + 20 }, this.closed)) {
          mom.x = this.player.x - sideX;
        } else if (walkable({ x: mom.x + sideX, y: mom.y + 20 }, this.closed)) {
          this.player.x = mom.x + sideX;
        } else {
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
    WechatBridge.vibrateLong();
  }

  private _caught() {
    this.lullaby = null;
    this.activity=null;this.taskLineTime=0;if(this.carrying)this.dropToy();
    this.caughtByFamily++; this.player = { x: 335, y: 370 };
    this.sleepProgress = Math.max(0, this.sleepProgress - 25);
    if (this.caughtByFamily >= this.maxCaught) { this.finish('被发现了三次'); return; }
    this.say(`被发现了！带回床边。睡意 -25%！还剩 ${this.maxCaught - this.caughtByFamily} 次机会。`);
    // 家人抓到主角押送回卧室后，安心回房继续睡觉
    for (let i = 0; i < this.family.length; i++) {
      const f = this.family[i];
      if (f.state === 'active') {
        const homePos = { x: 340 + i * 20, y: 145 + i * 50 };
        if (distance(f, homePos) < 55) {
          f.state = 'sleep'; f.returning = false; f.sleep = 80; f.timer = -1; f.x = homePos.x; f.y = homePos.y; f.path = []; f.chatterTimer = 0;
        } else {
          f.returning = true;
          f.path = route(f, homePos);
        }
      }
    }
  }

  interact(held = false) {
    if (this.phase === 'result') return;
    if (this.playerStunTimer > 0) return;
    if (this.hidden || this.sleeping) { this.hidden = false; this.sleeping = false; this.inspecting = false; this.say('你轻轻离开了藏身处。'); return; }

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
        WechatBridge.vibrateShort('light');
        if (this.lullaby.combo >= 6) {
          this.babySleepShield = 60;
          this.cry = 0;
          this.lullaby = null;
          this.sleepProgress = Math.min(100, this.sleepProgress + 20); // 摇篮曲催眠自己
          this.sayChatter('呼……小宝宝睡得好甜，自己也犯困了。', 2.8);
          this.say('哄睡大成功！婴儿深度安睡60秒，你的睡意 +20%！');
        }
      } else {
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
          WechatBridge.vibrateLong();

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
        } else {
          // 第 1 次失误：小宝宝被惊动，哭闹飙升至至少 60，警告拉满
          this.cry = Math.max(60, this.cry + 25);
          this.lullaby.feedback = isTooEarly ? '太轻了！小宝宝被惊动 (1/2)' : '太重了！小宝宝被惊动 (1/2)';
          this.lullaby.feedbackTimer = 1.0;
          WechatBridge.vibrateShort('heavy');
        }
      }
      return;
    }

    const s = this.nearest();
    if(this.carrying){
      if(this.canGiveMomToy()){
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
          } else {
            mom.chatter = '哎哟……硌死我了……（翻身）';
            this.say('恐龙太硬了！妈妈被硌得难受翻身，睡意大减！');
          }
        } else if (toyKind === 'bear' || toyKind === 'rabbit') {
          this.sayChatter(toyKind === 'bear' ? '小熊借给妈妈抱一抱，做个好梦……' : '小兔乖乖陪妈妈睡觉哦……', 2.5);
          if (mom.sleep >= 35) {
            const gain = toyKind === 'bear' ? 25 : 15;
            mom.sleep = Math.min(100, mom.sleep + gain);
            mom.chatter = toyKind === 'bear' ? '呼……好软的小熊……' : '嗯……小兔乖乖……';
            mom.chatterTimer = 3.5;
            this.say(`把${toyName}塞进了妈妈怀里。妈妈抱紧了它，睡得更沉了。`);
          } else {
            mom.state = 'alert';
            mom.timer = 3;
            this.alerts++;
            mom.chatter = '谁在拽被子？！（惊）';
            mom.chatterTimer = 3.5;
            this.say('糟了！妈妈本来就快醒了，掀被子反而惊醒了她！');
          }
        } else {
          this.say('妈妈翻了个身，对此毫无反应。');
        }
        return;
      }
      if(s?.kind==='storage'){
        this.found.add(this.carrying.id);
        this.delivered++;
        this.carrying=null;
        this.sleepProgress = Math.min(100, this.sleepProgress + 15);
        const storeLines = ['乖乖回箱子里睡觉吧，晚安咯。', '耶！收好玩具心里踏实多啦！', '藏进箱子就不会被妈妈发现啦。'];
        this.sayChatter(storeLines[Math.floor(Math.random() * storeLines.length)], 2.5);
        this.say('玩具放好了！心里踏实多了（睡意 +15%）！'+(this.canFinish?'随时回床入睡！':'继续积攒睡意。'));
        return;
      }
      else { this.dropToy(); return; }
    }
    if (s) {
      if(s.kind==='toy'){
        this.carrying=s;
        this.activity=null;
        this.noiseAt(4);
        const toyKind = s.toy ?? 'bear';
        const pool = TOY_PICKUP_CHATTER[toyKind] || TOY_PICKUP_CHATTER.bear;
        this.sayChatter(pool[Math.floor(Math.random() * pool.length)], 2.6);
        this.carryChatterTimer = 16 + Math.random() * 8;
        this.say('抱回卧室收纳处。抱着慢一点，互动键可放下。');
        return;
      }
      if(s.kind==='cake'){this.activity=this.activity==='cake'?null:'cake';if(this.activity){this.noiseAt(12);this.chatter=1;this.say('偷偷吃几口。现在可以边走边吃了。');}return;}
      if(s.kind==='tv'){
        if(this.activity==='tv'||(this.tvOn&&(held||this.tvProgress>=1))){this.tvOn=false;this.activity=null;this.say('电视关好了。');}
        else{this.tvOn=true;this.activity=this.tvProgress<1?'tv':null;this.chatter=1;this.noiseAt(8,s);this.say('离开后电视还会响，记得回来关。');}return;
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
      if (s.kind === 'hide') { this.hidden = true; this.say('保持安静。长按交互屏息，松手恢复。'); }
      if (s.kind === 'bed') {
        this.sleeping = true; this.player = { x: 325, y: 355 };
        this.say(!this.canFinish ? '先装睡躲一躲。完成任意两个小心愿后，可以回床过关。' : '心愿完成了。等妈妈离开，安静睡着。');
      }
      return;
    }
    const d = doorDefinitions.filter(d => distance(d, this.player) < 80).sort((a, b) => distance(a, this.player) - distance(b, this.player))[0];
    if (d) { this.closed.has(d.id) ? this.closed.delete(d.id) : this.closed.add(d.id); this.noiseAt(held ? 8 : 20); this.say(this.closed.has(d.id) ? '房门关上了，声音被挡在另一侧。' : '门开了。'); }
  }

  update(dt: number, direction: Point, holding = false) {
    if (this.phase === 'result') return;
    dt = Math.min(dt, .1); this.elapsed += dt; this.phaseTime += dt; this.messageTime -= dt;
    this.noise = Math.max(0, this.noise - dt * 20);
    if (this.momCaught) {
      this.momCaughtTimer -= dt;
      this.playerStunTimer = Math.max(0.5, this.momCaughtTimer);
      direction = { x: 0, y: 0 };
      // 物理制裁期间节拍性顿挫打击震动
      this.momSpankBeat = (this.momSpankBeat || 0) + dt;
      if (this.momSpankBeat >= 0.36 && this.momCaughtTimer > 0.3) {
        this.momSpankBeat = 0;
        WechatBridge.vibrateShort('heavy');
      }
      if (this.momCaughtTimer <= 0) {
        this.momCaught = false;
        this.finish('被妈妈当场抓获！惨遭竹笋炒肉物理制裁，屁股开花回房去睡了……😭');
        return;
      }
    } else if (this.playerStunTimer > 0) {
      this.playerStunTimer = Math.max(0, this.playerStunTimer - dt);
      direction = { x: 0, y: 0 };
    }
    const magnitude = this.playerStunTimer > 0 ? 0 : Math.min(1, Math.hypot(direction.x, direction.y));
    this.taskLineTime=Math.max(0,this.taskLineTime-dt);

    // 哄睡小游戏状态机更新
    if (this.lullaby) {
      if (magnitude > 0.15) {
        // 移动打断退出
        this.lullaby = null;
      } else {
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
        } else if (this.lullaby.progress <= 0.02) {
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

    if(magnitude>.05||this.hidden||this.sleeping){
      if (this.activity !== 'cake') {
        if (this.activity === 'tv') this.taskLineTime = 0;
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
    if(this.activity){
      const kind=this.activity;
      const target=this.spots.find(s=>s.kind===kind)!;
      if(kind !== 'cake' && distance(this.player,target)>=78) this.activity=null;
      else{
        if(kind==='cake'){
          this.cakeProgress=Math.min(1,this.cakeProgress+dt/8);
          this.sleepProgress=Math.min(100, this.sleepProgress + dt * 2.6); // 食困效应持续犯困
          this.noiseAt(dt*2);
        }
        else {
          this.tvProgress=Math.min(1,this.tvProgress+dt/12);
          this.sleepProgress=Math.min(100, this.sleepProgress + dt * 2.0); // 电视白噪音催眠
        }
        this.chatter-=dt;
        if(this.chatter<=0){
          const lines=kind==='cake'?['奶油好甜。','再一口……','吃饱了就犯困。','吃完就回床睡。']:['看到这里就睡。','无聊的节目好催眠……','声音小一点。','眼皮有点沉了。'];
          this.sayChatter(lines[this.chatterIndex++%lines.length], 2.4);
          this.chatter=6.5;
        }
        if(this.actionProgress>=1){
          const isCake = kind === 'cake';
          this.activity=null;this.taskLineTime=0;
          this.sleepProgress = Math.min(100, this.sleepProgress + (isCake ? 10 : 8));
          this.say((isCake?'蛋糕吃光了，肚子饱饱好想睡（睡意大涨）！':'电视节目看完了，离开前记得关。')+(this.canFinish?'睡意正浓，快回床入睡！':'继续积攒睡意。'));
        }
      }
    }
    if(this.tvOn)this.noiseAt(dt*8,this.spots.find(s=>s.kind==='tv')!,false);
    if (!this.hidden && !this.sleeping && magnitude > .05 && this.playerStunTimer <= 0) {
      const previous = { ...this.player };
      move(this.player, direction.x * this.moveSpeed * dt, direction.y * this.moveSpeed * dt, this.closed);
      if (distance(previous, this.player) > .001) { const rate = magnitude > .75 ? 12 : magnitude > .4 ? 5 : 2; this.noiseAt(rate * dt); this.noise = Math.max(this.noise, rate); }
    }
    this.breath = Math.max(0, Math.min(100, this.breath + (holding && (this.hidden || this.sleeping) ? -23 : 16) * dt));
    if (this.breath === 0 && holding) { this.noiseAt(12 * dt); this.say('屏息太久了，松开交互喘口气。'); }

    // 核心机制：爸妈追逐时的惊吓削减睡意（越被追越清醒！）
    const drain = this.sleepDrainRate;
    if (drain > 0) {
      this.sleepProgress = Math.max(0, this.sleepProgress - dt * drain);
    }

    // 时间限制
    if (this.elapsed >= this.timeLimit) { this.finish('天快亮了，你还没有睡着'); return; }

    // 婴儿哭声与安睡护盾
    if (this.babySleepShield > 0) {
      this.babySleepShield = Math.max(0, this.babySleepShield - dt);
      this.cry = 0;
    } else {
      this.cry = Math.min(100, Math.max(0, this.cry + dt * .35 * this.sensitivity));
    }
    if (this.cry > 75 && this.babySleepShield <= 0) this.noiseAt(dt * 5, { x: 214, y: 558 }, false);
    if (holding && distance(this.player, { x: 280, y: 595 }) < 78 && this.babySleepShield <= 0) this.cry = Math.max(0, this.cry - dt * 8);

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
        const babyCrying = this.cry >= 75 && this.babySleepShield <= 0;
        if (babyCrying) {
          // 婴儿嚎啕大哭时：穿透扣除睡意
          // 妈妈直觉极高，每秒扣除 50 点睡意，约 1.5 秒即彻底惊醒下床
          // 爸爸受刺耳噪音干扰，每秒扣除 22 点睡意
          const drain = i === 1 ? dt * 50 : dt * 22;
          f.sleep = Math.max(0, f.sleep - drain);
        }
        // 睡意为 0 时直接下床起床，不再有坐起动作
        if (f.sleep <= 0) {
          f.sleep = 0;
          f.state = 'active'; f.returning = false; f.timer = 25;
          if (i === 1) {
            this.wakes++; this.alerts++;
            if (babyCrying) {
              f.chatter = '小宝宝怎么哭了？！快去看看！💢';
              f.chatterTimer = 3.0;
              this.say('小宝大哭！妈妈被彻底吵醒，正破门冲来！');
            } else {
              this.say('妈妈睡意全无，直接下床了！快找地方躲藏！');
            }
            // 优先追击暴露的主角；若主角已躲藏且婴儿哭闹，则直奔婴儿床查看
            const target = (!this.sleeping && !this.hidden) ? this.player : (babyCrying ? { x: 280, y: 595 } : { x: 325, y: 355 });
            f.path = route(f, target); 
            f.repathTimer = 0.35;
          } else {
            this.say('爸爸被吵醒了，直接下床了！');
            const r = Math.random();
            const dest = r < 0.4 ? {x: 1050, y: 155} : (r < 0.8 ? {x: 820, y: 680} : {x: 800, y: 300});
            f.path = route(f, dest); 
          }
        } else if (!babyCrying) {
          // 仅在婴儿未哭闹时自然恢复睡意
          f.sleep = Math.min(100, f.sleep + dt * .35);
        }
      } else if (f.state === 'alert') {
        f.timer -= dt;
        if (f.timer <= 0) { 
          f.state = 'active'; f.returning = false; f.timer = 25; if (i === 1) this.wakes++; 
          if (i === 0) {
            // 爸爸随机去厨房(蛋糕)、电脑房或客厅
            const r = Math.random();
            const dest = r < 0.4 ? {x: 1050, y: 155} : (r < 0.8 ? {x: 820, y: 680} : {x: 800, y: 300});
            f.path = route(f, dest); 
          } else {
            const target = (!this.sleeping && !this.hidden) ? this.player : { x: 325, y: 355 };
            f.path = route(f, target); 
            f.repathTimer = 0.35;
          }
        }
      } else {
        const isMom = i === 1;
        if (this.momCaught && isMom) {
          f.path = [];
          continue;
        }
        const momRush = isMom && (this.cry >= 75 && this.babySleepShield <= 0);
        const speed = momRush ? 145 : 82;
        f.timer -= dt;

        // 妈妈高敏捷动态追击（Dynamic Repathing）：永远扑向主角最新方位，绝不跑向过时旧点
        if (isMom && !f.returning && !this.sleeping && !this.hidden) {
          f.repathTimer = (f.repathTimer || 0) - dt;
          const currentEnd = f.path.length > 0 ? f.path[f.path.length - 1] : null;
          const targetDist = currentEnd ? distance(currentEnd, this.player) : 999;
          // 只要玩家跑离旧终点超过 45px，或 0.35 秒周期到期，立刻动态重构路径紧咬玩家最新坐标
          if (targetDist > 45 || f.repathTimer <= 0) {
            f.repathTimer = 0.35;
            f.path = route(f, this.player);
          }
        }

        this.follow(f, f.path, dt * speed, true);
        if (momRush && !f.returning && f.path.length === 0) {
          f.path = route(f, this.player);
        }
        const homePos = { x: 340 + i * 20, y: 145 + i * 50 };
        if (f.timer <= 0 && !f.returning) { f.returning = true; f.path = route(f, homePos); }
        if (f.returning) {
          if (distance(f, homePos) < 35) {
            f.state = 'sleep'; f.returning = false; f.sleep = 80; f.timer = -1; f.x = homePos.x; f.y = homePos.y; f.path = []; f.chatterTimer = 0;
            if (i === 1) this.closed.add('player');
          } else if (!f.path.length) f.path = route(f, homePos);
          continue;
        }
        
        // 爸爸怂包逻辑：如果妈妈醒了，爸爸立刻中止偷吃/打游戏，全速回房！
        if (i === 0 && this.family[1].state !== 'sleep') {
          if (distance(f, homePos) > 60) {
            if (f.path.length === 0 || Math.abs(f.path[f.path.length-1].x - homePos.x) > 30) {
              f.returning = true; f.path = route(f, homePos);
              if (f.chatterTimer === undefined || f.chatterTimer <= 0) {
                f.chatter = "不好，老婆醒了！赶紧撤！";
                f.chatterTimer = 3;
              }
            }
          } else {
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
                f.state = 'sleep'; f.returning = false; f.sleep = 80; f.timer = -1; f.x = homePos.x; f.y = homePos.y; f.path = []; f.chatterTimer = 0;
                this.closed.add('player');
              } else {
                f.path = route(f, homePos);
              }
            } else if (!this.sleeping && !this.hidden) {
              // 主角在外面：不管离床远近，继续追击主角
              f.path = route(f, this.player);
            } else {
              // 主角已躲藏或装睡：妈妈寻找无果，心满意足回房入睡
              f.returning = true;
              f.path = route(f, homePos);
            }
          } else {
            // 爸爸的决策逻辑
            if (distance(f, homePos) > 60) {
              if (f.timer < 8) { f.returning = true; f.path = route(f, homePos); }
            } else {
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
            } else if (this.dadForgives > 0) {
              // 爸爸的放水与彩蛋逻辑 (妈妈没醒)
              if (f.chatterTimer === undefined || f.chatterTimer <= 0) {
                if (this.player.x > 950 && this.player.y < 300) {
                  // 在厨房抓到
                  const lines = ["嘘…老爸就吃一口，咱俩谁也别跟妈说。","（嚼嚼嚼）…你怎么也来了？当没看见啊！","半夜吃独食被逮到了…快回去睡！"];
                  f.chatter = lines[Math.floor(Math.random() * lines.length)];
                } else if (this.player.y > 600 && this.player.x > 550) {
                  // 在电脑房抓到
                  const lines = ["咳，老爸在处理工作…看完这局就睡。","嘘，这把团战关键时刻，别吵醒你妈！","我不是打游戏，我在测试鼠标…快去睡！"];
                  f.chatter = lines[Math.floor(Math.random() * lines.length)];
                } else {
                  // 走廊常规抓到
                  this.dadForgives--;
                  if (this.dadForgives > 0) {
                    const lines = ["又跑出来玩？下不为例，赶紧回去睡。","怎么又起夜了？小心别吵醒你妈。","老爸当没看见，给你三秒钟回被窝…"];
                    f.chatter = lines[Math.floor(Math.random() * lines.length)];
                  } else {
                    const lines = ["还在外面晃悠？快回屋，等下你妈真醒了！","最后一次放水了啊，再不回去保不住你了。","赶紧回去，别逼老爸大义灭亲啊！"];
                    f.chatter = lines[Math.floor(Math.random() * lines.length)];
                  }
                }
                f.chatterTimer = 3.5;
                f.returning = true; f.path = route(f, homePos); // 碰面后心虚回房
              }
            } else {
              // 爸爸放水次数用完，抓人
              if (!this.hidden && !this.sleeping && (f.chatterTimer === undefined || f.chatterTimer <= 0)) { 
                const lines = ["让你早睡不听！看你怎么跟你妈解释。","这下老爸也救不了你了，乖乖认罚吧。","跟你说了早点睡…完蛋，你妈真醒了！"];
                f.chatter = lines[Math.floor(Math.random() * lines.length)];
                f.chatterTimer = 3;
                this.catchPlayerByMom();
                return;
              }
            }
          } else {
            // 妈妈抓人
            if (!this.hidden && !this.sleeping) { this.catchPlayerByMom(); return; }
            else if (this.sleeping && !this.inspecting) { this.inspecting = true; this.inspectionTimer = 4.5; this.breathPhase = 0; f.path = []; this.say(`${f.name}停在了你床边……别动，放慢呼吸。`); }
          }
        }
        if (f.timer <= 0) { f.state = 'sleep'; f.sleep = 80; f.timer = -1; f.x = 340 + i * 20; f.y = 145 + i * 50; f.chatterTimer = 0; if (i === 1) this.closed.add('player'); }
      }
      if (f.chatterTimer !== undefined && f.chatterTimer > 0) f.chatterTimer -= dt;
    }

    // 装睡检查
    if (this.inspecting) {
      this.inspectionTimer -= dt;
      this.breathPhase = (this.breathPhase + dt / 4) % 1;
      if (magnitude > 0.15) { this.catchPlayerByMom(); return; }
      else if (this.inspectionTimer <= 0) {
        this.inspecting = false; this.say('……她慢慢走开了。');
        for (let j = 0; j < this.family.length; j++) { const fj = this.family[j]; if (fj.state === 'active') { fj.returning = true; fj.path = route(fj, { x: 340 + j * 20, y: 145 + j * 50 }); if (j === 1) this.closed.add('player'); } }
      }
    }
  }

  private follow(actor: Point, path: Point[], amount: number, opens: boolean) {
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
      } else {
        break;
      }
    }
  }

  finish(outcome: string) { if (this.phase === 'result') return; this.outcome = outcome; this.phase = 'result'; }
  revive() {
    if (this.revivesUsed > 0) return;
    this.revivesUsed++;
    this.phase = 'explore';
    this.momCaught = false;
    this.momCaughtTimer = 0;
    this.playerStunTimer = 0;
    this.player.x = 236;
    this.player.y = 396;
    this.activity = null;
    this.sleeping = false;
    this.hidden = false;
    this.family.forEach(f => {
      f.state = 'sleep';
      f.sleep = 100;
      f.path = [];
      f.returning = false;
      f.repathTimer = 0;
    });
    this.cry = 0;
    this.babySleepShield = 2.5;
    this.message = '嘘……满血复活！继续行动！';
    this.messageTime = 4;
  }
  get escaped() { return this.outcome === '心满意足，终于甜甜地睡着了' || this.outcome === '心满意足地睡着了'; }
  get breakdown() {
    return [
      this.completed * 100 + Math.max(0,this.delivered-1)*25,
      Math.max(0, 200 - this.alerts * 10 - this.wakes * 35 - this.caughtByFamily * 30),
      Math.max(0, Math.round(200 - this.totalNoise / 14)),
      Math.max(0, Math.round(150 - this.elapsed / 4)),
      this.escaped ? 150 : 0,
    ];
  }
  get score() { return Math.min(1000, this.breakdown.reduce((a, b) => a + b, 0)); }
}
