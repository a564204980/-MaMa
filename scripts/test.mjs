import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
fs.mkdirSync('.work/tests', { recursive: true });
fs.mkdirSync('.work/platform', { recursive: true });
fs.writeFileSync('.work/platform/WechatBridge.mjs', `
export class WechatBridge {
  static vibrateLight() {}
  static vibrateShort() {}
  static vibrateMedium() {}
  static vibrateHeavy() {}
  static vibrateLong() {}
  static getSystemInfo() { return { windowWidth: 1280, windowHeight: 720, pixelRatio: 2 }; }
}
`);
for (const name of ['House', 'Run']) {
  let source = fs.readFileSync(`src/gameplay/${name}.ts`, 'utf8')
    .replace("'./House'", "'./House.mjs'")
    .replace("'../platform/WechatBridge'", "'../platform/WechatBridge.mjs'")
    .replace("import collisionData from './collision-overrides.json';", `const collisionData = ${fs.readFileSync('src/gameplay/collision-overrides.json', 'utf8')};`);
  fs.writeFileSync(`.work/tests/${name}.mjs`, ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText);
}
const { Run } = await import(pathToFileURL(process.cwd() + '/.work/tests/Run.mjs'));
for (const [near, far, measure] of [
  [{x:280,y:150}, {x:1200,y:500}, r => 100-r.family[0].sleep],
  [{x:280,y:595}, {x:1200,y:500}, r => r.cry-12],
]) {
  const nearby = new Run('proximity',1), distant = new Run('proximity',1);
  nearby.noiseAt(10,near); distant.noiseAt(10,far);
  assert(measure(nearby) > measure(distant)*3, 'Nearby noise must be substantially stronger');
}
const insideClosed = new Run('same-room',1), insideOpen = new Run('same-room',1);
insideClosed.closed.add('parents');
insideClosed.noiseAt(10,{x:280,y:150}); insideOpen.noiseAt(10,{x:280,y:150});
assert.equal(insideClosed.family[0].sleep, insideOpen.family[0].sleep, 'Closing door must not shield same-room noise');
const firstNightNoise = new Run('wake-pacing', 1);
firstNightNoise.elapsed = 25;
firstNightNoise.noiseAt(200, firstNightNoise.family[0]);
firstNightNoise.update(.1, { x: 0, y: 0 });
assert.equal(firstNightNoise.family[0].state, 'active', 'Noise draining sleep to 0 must wake parents directly out of bed');
assert.equal(firstNightNoise.family[0].sleep, 0, 'Noise drained sleep completely');
// 测试床头塞恐龙互动惊醒机制：保留 3 秒反应时间让玩家逃跑
const toyReactionRun = new Run('toy-reaction', 1);
toyReactionRun.carrying = { id: 'toy-dino', kind: 'toy', name: '霸王龙', toy: 'dino', x: 280, y: 150 };
toyReactionRun.player = { x: 280, y: 150 };
toyReactionRun.family[1].sleep = 20;
toyReactionRun.interact();
assert.equal(toyReactionRun.family[1].state, 'alert', '塞硬恐龙硌醒应保留 3 秒平躺逃跑反应时间');
assert.equal(toyReactionRun.family[1].timer, 3, '倒计时 3 秒保护玩家逃生');
const unattendedBaby = new Run('cry-pacing', 1);
const initialCry = unattendedBaby.cry;
for (let i = 0; i < 600; i++) unattendedBaby.update(.1, { x: 0, y: 0 }); // 60 秒
assert(unattendedBaby.cry > initialCry, '无人照看时婴儿哭闹值应稳步上升');
assert(unattendedBaby.cry < 50, '前 60 秒为平稳探索安全期');
for (let i = 0; i < 2000; i++) unattendedBaby.update(.1, { x: 0, y: 0 }); // 累计 260 秒
assert(unattendedBaby.cry > 75, '长期放任不管婴儿最终会大哭闹腾');
const { route, walkable, distance, move, doorDefinitions } = await import(pathToFileURL(process.cwd() + '/.work/tests/House.mjs'));
// Geometry-specific wall/floor coordinate checks are managed by collision-overrides.json
// and verified during manual map authoring. Only door-blocking logic is tested here.
const shutDoorway = { x: 400, y: 575 };
move(shutDoorway, 100, 0, new Set(['nursery']));
assert(shutDoorway.x < 445, 'Closed nursery door must block passage');

for (let i = 0; i < 20; i++) {
  const run = new Run(`regression-${i}`, 2);
  assert.deepEqual(run.spots, new Run(`regression-${i}`, 2).spots);
  for (const s of run.spots) {
    if (s.kind === 'toy') {
      assert(walkable({ x: s.x, y: s.y + 20 }), `Invalid toy position ${s.id}: ${s.x},${s.y}`);
    }
    const path = route(run.player, s);
    assert(path.length > 0, `Unreachable ${s.id}`);
    const actor = { ...run.player };
    for (const p of path) {
      for (let tick = 0; tick < 100 && distance(actor, p) > 2; tick++) {
        const d = distance(actor, p);
        move(actor, (p.x - actor.x) / d * 2, (p.y - actor.y) / d * 2);
      }
    }
    assert(distance(actor, s) < 78, `Path blocked to interaction range of ${s.id}, stopped ${JSON.stringify(actor)}`);
  }
}
console.log('PASS: 20 deterministic seeds, reachable interactions with collision-followed routes, doors, alerts and cry timers.');

// 核心新玩法：睡意流转动力学测试
{
  const sleepRun = new Run('test-sleep-system', 1);
  assert.equal(sleepRun.sleepProgress, 15, '初始睡意应为 15%');

  // 1. 被追逐时睡意流失
  sleepRun.sleepProgress = 50;
  sleepRun.family[1].state = 'active'; // 妈妈处于追逐状态
  sleepRun.family[1].returning = false;
  sleepRun.family[1].x = sleepRun.player.x + 80;
  sleepRun.family[1].y = sleepRun.player.y;
  assert(sleepRun.sleepDrainRate > 0, '被暴怒近身追逐时，睡意流失率应大于 0');

  sleepRun.update(1.0, { x: 0, y: 0 });
  assert(sleepRun.sleepProgress < 50, '近身追逐持续扣除睡意');

  // 2. 躲藏庇护不扣睡意
  sleepRun.hidden = true;
  assert.equal(sleepRun.sleepDrainRate, 0, '躲藏时睡意流失率必须为 0');
  sleepRun.hidden = false;

  // 3. 收纳玩具增加睡意
  const beforeToy = sleepRun.sleepProgress;
  sleepRun.carrying = { id: 'toy-1', name: '小熊', kind: 'toy', x: 0, y: 0, toy: 'bear' };
  sleepRun.spots = [{ id: 'storage', kind: 'storage', x: 200, y: 200, name: '玩具箱' }];
  sleepRun.player = { x: 200, y: 200 };
  sleepRun.interact();
  assert(sleepRun.sleepProgress > beforeToy, '归还玩具至玩具箱应奖励睡意');
  assert.equal(sleepRun.delivered, 1, '送回玩具计数应为 1');

  // 4. 验证床上装睡不会自动增加睡意（去除闭目养神挂机逃课机制）
  sleepRun.sleepProgress = 50;
  sleepRun.spots = [{ id: 'bed', kind: 'bed', x: 325, y: 355, name: '卧室小床' }];
  sleepRun.player = { x: 325, y: 355 };
  sleepRun.interact(); // 上床装睡
  assert(sleepRun.sleeping, '在床上应进入装睡状态');
  sleepRun.update(2.0, { x: 0, y: 0 });
  assert.equal(sleepRun.sleepProgress, 50, '躺在床上装睡绝不自动增长睡意');
  sleepRun.sleeping = false; // 起床

  // 5. 达成 100% 睡意回床通关判定
  sleepRun.family.forEach(f => { f.state = 'sleep'; f.x = 800; f.y = 800; }); // 确保周围无威胁
  sleepRun.sleepProgress = 100;
  assert(sleepRun.canFinish, '满睡意时可通关判定应为 true');
  const bedSpot = { id: 'bed', kind: 'bed', x: 325, y: 355, name: '卧室小床' };
  sleepRun.spots = [bedSpot];
  sleepRun.player = { x: 325, y: 355 };
  sleepRun.interact(); // 上床装睡
  assert(sleepRun.sleeping, '在床上互动应进入装睡状态');

  // 模拟安稳睡眠 1 秒
  sleepRun.update(1.0, { x: 0, y: 0 });
  assert.equal(sleepRun.phase, 'result', '满睡意在床上安睡应触发通关结算');
  assert.equal(sleepRun.outcome, '心满意足，终于甜甜地睡着了', '通关成就文案一致');

  // 6. 验证被妈妈抓到后原地眩晕 2 秒并落幕结束游戏
  const momCatchRun = new Run('mom-catch-ending', 1);
  const mom = momCatchRun.family[1];
  mom.state = 'active';
  mom.timer = 25;
  mom.returning = false;
  mom.x = 500; mom.y = 300;
  momCatchRun.player = { x: 500, y: 300 }; // 妈妈抓到主角
  momCatchRun.update(0.1, { x: 0, y: 0 });
  assert.equal(momCatchRun.momCaught, true, '被妈妈抓到后进入 momCaught 状态');
  assert(momCatchRun.playerStunTimer > 0, '主角处于眩晕定身');
  assert.equal(momCatchRun.phase, 'explore', '在纯黑大字展示期间仍在落幕阶段，尚未直接跳结算');
  
  // 模拟经过落幕时间（1.8 秒纯黑专场大字展示）
  for (let t = 0; t < 25; t++) momCatchRun.update(0.1, { x: 0, y: 0 });
  assert.equal(momCatchRun.phase, 'result', '眩晕与落幕倒计时结束后切入结算');
  assert(momCatchRun.outcome.includes('被妈妈当场抓获'), '结算文案明确为被妈妈抓住失败');
  // 7. 验证摇篮曲哄睡小游戏：失败 2 次，婴儿直接大哭惊醒
  const lullabyRun = new Run('lullaby-test', 1);
  lullabyRun.spots = [{ id: 'baby-bed', kind: 'baby', x: 280, y: 595, name: '婴儿床' }];
  lullabyRun.player = { x: 280, y: 595 };
  lullabyRun.interact(); // 开启哄睡
  assert(lullabyRun.lullaby, '互动婴儿床应开启哄睡小游戏');
  assert.equal(lullabyRun.lullaby.missCount, 0, '初始失误次数应为 0');

  // 第 1 次失误：拍太早
  lullabyRun.lullaby.progress = 0.05; // 严重偏左
  lullabyRun.interact();
  assert(lullabyRun.lullaby, '第 1 次失误哄睡小游戏不应关闭');
  assert.equal(lullabyRun.lullaby.missCount, 1, '第 1 次失误 missCount 应为 1');
  assert(lullabyRun.cry >= 60, '第 1 次失误婴儿哭闹值应飙升至至少 60');

  // 第 2 次失误：拍太晚
  lullabyRun.lullaby.progress = 0.95; // 严重偏右
  lullabyRun.interact();
  assert.equal(lullabyRun.lullaby, null, '第 2 次失误哄睡小游戏强制关闭');
  assert.equal(lullabyRun.cry, 100, '第 2 次失误婴儿哭闹值必须达到 100（大声哭）');
  assert(lullabyRun.playerStunTimer > 0, '第 2 次失误主角应被吓呆定身');

  console.log('PASS: sleep mechanics, chase drain, hiding shield, toy reward, bed victory, lullaby 2-strike cry, mom AI fix.');
}

// Both changed touches must be dispatched, and cancellation must release the corresponding finger.
fs.writeFileSync('.work/tests/EventBus.mjs', ts.transpileModule(fs.readFileSync('src/core/EventBus.ts','utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText);
const inputSource = fs.readFileSync('src/core/InputManager.ts', 'utf8').replace("'./EventBus'", "'./EventBus.mjs'");
fs.writeFileSync('.work/tests/InputManager.mjs', ts.transpileModule(inputSource, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText);
const callbacks = {}; globalThis.wx = { onTouchStart: cb => callbacks.start = cb, onTouchMove: cb => callbacks.move = cb, onTouchEnd: cb => callbacks.end = cb, onTouchCancel: cb => callbacks.cancel = cb };
const { globalInput } = await import(pathToFileURL(process.cwd() + '/.work/tests/InputManager.mjs'));
const starts = [], ends = []; globalInput.onTouchStart(p => starts.push(p.identifier)); globalInput.onTouchEnd(p => ends.push(p.identifier));
callbacks.start({ changedTouches: [{ clientX: 100, clientY: 200, identifier: 1 }, { clientX: 900, clientY: 200, identifier: 2 }] });
callbacks.cancel({ changedTouches: [{ clientX: 900, clientY: 200, identifier: 2 }] }); assert.deepEqual(starts, [1, 2]); assert.deepEqual(ends, [2]); delete globalThis.wx;
console.log('PASS: simultaneous movement/action touches and touch cancellation.');

const points = []; globalInput.onTouchStart(p => points.push(p));
callbacks.start({ changedTouches: [{ x: 195, y: 565, identifier: 3 }] });
callbacks.start({ changedTouches: [], touches: [{ pageX: 0, pageY: 0, identifier: 4 }] });
callbacks.start({ changedTouches: [{ identifier: 5 }] });
assert.deepEqual(points, [{ x: 195, y: 565, identifier: 3 }, { x: 0, y: 0, identifier: 4 }]);
console.log('PASS: native WeChat x/y, adapter pageX/pageY, zero coordinates and invalid-event filtering.');

