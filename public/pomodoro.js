const durations = { focus: 25 * 60_000, rest: 5 * 60_000 };
const names = { focus: '专注', rest: '休息' };
const storageKey = 'starlight:pomodoro:v1:' + new URL('.', location.href).pathname;
const ready = phase => ({ phase, remaining: durations[phase], endsAt: null });
let memoryOnly = false;

function loadClock(fallback) {
  if (memoryOnly) return fallback;
  try {
    const value = JSON.parse(localStorage.getItem(storageKey));
    if (value && Object.hasOwn(durations, value.phase) &&
        Number.isSafeInteger(value.remaining) && value.remaining >= 0 && value.remaining <= durations[value.phase] &&
        (value.endsAt === null || (Number.isSafeInteger(value.endsAt) && value.endsAt > 0))) return value;
    return ready('focus');
  } catch {
    return fallback;
  }
}

let clock = loadClock(ready('focus'));
let mini = null;
let tickHost = window;
let tick;
const main = document.querySelector('.clock');
const pin = document.querySelector('#pin');
const hint = document.querySelector('#pin-hint');

function remaining() {
  if (clock.endsAt === null) return clock.remaining;
  return Math.max(0, Math.min(clock.remaining, clock.endsAt - Date.now()));
}

function save(value) {
  clock = value;
  try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { memoryOnly = true; }
  render();
}

function render() {
  tickHost.clearTimeout(tick);
  const left = remaining();
  const seconds = Math.ceil(left / 1000);
  const time = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  const running = left > 0 && clock.endsAt !== null;
  const paused = left > 0 && !running && left < durations[clock.phase];
  const label = names[clock.phase];
  let message = '准备' + label;
  let action = '开始' + label;
  if (left === 0) {
    message = label + '结束';
    action = clock.phase === 'focus' ? '开始休息' : '开始专注';
  } else if (running) {
    message = label + '中';
    action = '暂停';
  } else if (paused) {
    message = label + '已暂停';
    action = '继续' + label;
  }
  document.title = time + ' · ' + message + ' · 小小成就';
  for (const view of [main, mini?.document.querySelector('.clock')]) {
    if (!view) continue;
    view.dataset.phase = clock.phase;
    const status = view.querySelector('.status');
    if (status.textContent !== message) status.textContent = message;
    view.querySelector('.digits').textContent = time;
    const progress = view.querySelector('progress');
    progress.max = durations[clock.phase];
    progress.value = progress.max - left;
    const toggle = view.querySelector('[data-command="toggle"]');
    if (toggle.textContent !== action) toggle.textContent = action;
    view.querySelector('[data-command="reset"]').disabled = left === durations[clock.phase] && !running;
    for (const mode of view.querySelectorAll('[data-mode]')) {
      mode.setAttribute('aria-pressed', String(mode.dataset.mode === clock.phase));
      mode.disabled = running || paused;
    }
  }
  // Update only when the displayed second changes, using the visible window.
  tickHost = mini || window;
  if (running) tick = tickHost.setTimeout(render, left % 1000 || 1000);
}

function control(event) {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  clock = loadClock(clock);
  const left = remaining();
  if (button.dataset.mode) {
    if (left === 0 || (clock.endsAt === null && left === durations[clock.phase])) save(ready(button.dataset.mode));
    return;
  }
  if (button.dataset.command === 'reset') return save(ready(clock.phase));
  if (button.dataset.command !== 'toggle') return;
  if (clock.endsAt !== null && left > 0) return save({ phase: clock.phase, remaining: left, endsAt: null });
  const next = left === 0 ? ready(clock.phase === 'focus' ? 'rest' : 'focus') : clock;
  save({ ...next, endsAt: Date.now() + next.remaining });
}

main.addEventListener('click', control);
window.addEventListener('storage', event => {
  if (event.key === storageKey || event.key === null) { clock = loadClock(clock); render(); }
});
window.addEventListener('pageshow', () => { clock = loadClock(clock); render(); });
document.addEventListener('visibilitychange', render);
const pinHelp = '保留番茄钟标签页，小窗可以拖到桌面一角。';
if (!window.documentPictureInPicture?.requestWindow) {
  pin.hidden = true;
  hint.textContent = '本页可以计时。桌面置顶可用电脑版 Chrome 或 Edge 打开。';
} else {
  hint.textContent = pinHelp;
  pin.addEventListener('click', async () => {
    if (mini && !mini.closed) { mini.close(); return; }
    pin.disabled = true;
    try {
      const child = await window.documentPictureInPicture.requestWindow({ width: 266, height: 167 });
      mini = child;
      child.document.documentElement.lang = 'zh-CN';
      child.document.title = '小小成就番茄钟';
      const stylesheet = child.document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = new URL('./pomodoro.css', location.href).href;
      child.document.head.append(stylesheet);
      child.document.body.className = 'pinned-body';
      const view = main.cloneNode(true);
      view.addEventListener('click', control);
      child.document.body.append(view);
      child.addEventListener('pagehide', () => {
        mini = null;
        pin.textContent = '桌面置顶';
        hint.textContent = pinHelp;
        render();
      }, { once: true });
      pin.textContent = '收起桌面小窗';
      hint.textContent = '已置顶，可以切到其他应用继续工作。';
      render();
    } catch {
      hint.textContent = '浏览器未能打开置顶小窗。请在桌面浏览器中直接打开番茄钟后再试。';
    } finally {
      pin.disabled = false;
    }
  });
}
render();
