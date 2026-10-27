import confetti from './vendor/canvas-confetti-1.9.4.js';

// One shuffled bag per browser: every line appears once before the bag refills.
const MESSAGES = [
  ['又完成一件事，给你一颗小星星。', ''],
  ['这一小步，你走得真好。', ''],
  ['今天的你，又比刚才前进了一点。', ''],
  ['小小任务，大大击掌！', ''],
  ['认真做完的感觉，真不错呀。', ''],
  ['给这份坚持，放一束小烟花。', ''],
  ['你看，努力已经留下脚印了。', ''],
  ['又一个小目标，被你拿下啦。', ''],
  ['一件一件来，你做到了。', ''],
  ['这一格勾勾，属于认真的你。', ''],
  ['今天的进度条，又亮了一小段。', ''],
  ['把掌声送给刚刚努力过的你。', ''],
  ['小星星收到你的好消息啦。', ''],
  ['这份完成，值得开心一下。', ''],
  ['先给自己一个赞，再慢慢往前。', ''],
  ['你又为心愿存下一点光。', ''],
  ['完成啦，肩膀可以放松一下。', ''],
  ['认真投入的这一刻，很闪亮。', ''],
  ['小小积累，也在悄悄长大。', ''],
  ['你把“等会儿”变成“做完啦”。', ''],
  ['又一份努力，稳稳落地。', ''],
  ['这次的坚持，我们看见啦。', ''],
  ['你的行动，让计划开了一朵花。', ''],
  ['任务小山丘，又翻过一座。', ''],
  ['今天也在一点点靠近心愿。', ''],
  ['给刚刚的专注，贴一枚小奖章。', ''],
  ['不用一下子很厉害，走完这步就很好。', ''],
  ['你认真完成的事，都算数。', ''],
  ['好耶！又收集到一次“我可以”。', ''],
  ['这一刻，值得和自己击个掌。', ''],
  ['把这份小成就，装进口袋。', ''],
  ['小气球升起来，庆祝你做到了。', ''],
  ['计划清单少一项，快乐多一点。', ''],
  ['你的小宇宙，又亮起一颗星。', ''],
  ['今天的努力，有了一个漂亮句号。', ''],
  ['完成一件，轻快一点。', ''],
  ['给愿意行动的你，一朵小红花。', ''],
  ['把想做的事做好，就是小小勇敢。', ''],
  ['又一份认真，变成了成长。', ''],
  ['你和目标之间，又少了一小段路。', ''],
  ['这一程走完了，喝口水歇歇吧。', ''],
  ['慢慢来，也能把事情做好。', ''],
  ['你的坚持，正在发芽。', ''],
  ['给今天的行动力，送一颗糖。', ''],
  ['刚刚的你，给未来送了一份小礼物。', ''],
  ['一颗小勾勾，也有大大的分量。', ''],
  ['这一页进展，是你亲手写下的。', ''],
  ['值得庆祝的事，又多了一件。', ''],
  ['纸上得来终觉浅，绝知此事要躬行。', '陆游《冬夜读书示子聿》'],
  ['欲穷千里目，更上一层楼。', '王之涣《登鹳雀楼》'],
  ['千里之行，始于足下。', '《老子》第六十四章'],
  ['不积跬步，无以至千里。', '《荀子·劝学》'],
  ['长风破浪会有时，直挂云帆济沧海。', '李白《行路难·其一》'],
  ['读书不觉已春深，一寸光阴一寸金。', '王贞白《白鹿洞二首·其一》'],
];
const STORAGE_KEY = 'starlight.task-celebration-bag.v1';
const COLORS = ['#e6b658', '#8eae91', '#d89b9e', '#a5a0d0', '#84afca'];
let bag = [], lastMessage = -1, loaded = false;
let layer, card, canvas, burst, motionQuery, motionListener;
let timers = [], lastTaskId, lastTaskAt = 0;

function nextMessage() {
  if (!loaded) {
    loaded = true;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved?.size === MESSAGES.length && Array.isArray(saved.bag) &&
          saved.bag.length <= MESSAGES.length && new Set(saved.bag).size === saved.bag.length &&
          saved.bag.every(i => Number.isInteger(i) && i >= 0 && i < MESSAGES.length)) {
        bag = saved.bag;
        lastMessage = Number.isInteger(saved.last) ? saved.last : -1;
      }
    } catch { /* Private browsing or a damaged preference must not block completion. */ }
  }
  if (!bag.length) {
    bag = MESSAGES.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (bag[bag.length - 1] === lastMessage) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
  }
  lastMessage = bag.pop();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({size: MESSAGES.length, bag, last: lastMessage})); } catch {}
  return MESSAGES[lastMessage];
}

function later(callback, delay) { timers.push(setTimeout(callback, delay)); }

/** Remove current visuals and timers. Safe to call on room changes or logout. */
export function cleanup() {
  timers.forEach(clearTimeout);
  timers = [];
  burst?.reset();
  layer?.remove();
  card?.remove();
  if (motionListener) motionQuery?.removeEventListener?.('change', motionListener);
  layer = card = canvas = burst = motionListener = null;
}

function stopMotion() {
  burst?.reset();
  layer?.remove();
  layer = canvas = burst = null;
}

function animate(kind) {
  layer = document.createElement('div');
  layer.className = 'task-celebration-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  if (kind === 2) {
    for (let i = 0; i < 6; i++) {
      const balloon = document.createElement('span');
      balloon.className = `task-celebration-balloon balloon-${i}`;
      layer.append(balloon);
    }
    return;
  }
  canvas = document.createElement('canvas');
  layer.append(canvas);
  burst = confetti.create(canvas, {resize: true, useWorker: false, disableForReducedMotion: true});
  const base = {colors: COLORS, particleCount: 30, ticks: 100, decay: 0.92, gravity: 0.7, scalar: 0.85};
  if (kind === 0) {
    burst({...base, spread: 360, startVelocity: 20, origin: {x: 0.3, y: 0.36}});
    later(() => burst?.({...base, spread: 360, startVelocity: 18, origin: {x: 0.72, y: 0.3}}), 200);
  } else {
    burst({...base, particleCount: 42, shapes: ['star'], spread: 85, startVelocity: 24,
      scalar: 1.1, gravity: 0.55, origin: {x: 0.5, y: 0.46}});
  }
}

/** Call only after a successful incomplete -> completed mutation.
 * coins is the visible learning-coin amount, not internal fixed-point units.
 * No task data is persisted; localStorage stores only shuffled message indices.
 */
export function celebrateTask({taskId, title = '', coins = 0} = {}) {
  if (typeof document === 'undefined' || !document.body || document.hidden) return;
  const now = Date.now();
  if (taskId != null && taskId === lastTaskId && now - lastTaskAt < 800) return;
  lastTaskId = taskId;
  lastTaskAt = now;
  cleanup();
  const [message, attribution] = nextMessage();
  card = document.createElement('div');
  card.className = 'task-celebration-note';
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  card.setAttribute('aria-atomic', 'true');
  const heading = document.createElement('strong');
  heading.textContent = message;
  const detail = document.createElement('span');
  const amount = Number(coins);
  const shortTitle = Array.from(String(title)).slice(0, 38).join('');
  detail.textContent = attribution ? `——${attribution}` :
    `${shortTitle ? '完成「' + shortTitle + '」' : '又完成一个小计划'}${Number.isFinite(amount) && amount > 0 ? ' · +' + new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 2}).format(amount) + ' 学习币' : ''}`;
  card.append(heading, detail);
  document.body.append(card);
  motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  if (!motionQuery?.matches) {
    try { animate(Math.floor(Math.random() * 3)); } catch { stopMotion(); }
  }
  motionListener = event => { if (event.matches) stopMotion(); };
  motionQuery?.addEventListener?.('change', motionListener);
  later(stopMotion, 2300);
  later(cleanup, 2900);
}
