import { labels, ready, currentClock, validClock, validSettings, timeLeft, migrateLegacy } from './pomodoro-cycle.js';
import { createBell } from './pomodoro-bell.js';

const scope = new URL('.', location.href).pathname;
const storageKey = 'starlight:pomodoro:v2:' + scope;
const legacyKey = 'starlight:pomodoro:v1:' + scope;
let memoryOnly = false;

function loadClock(fallback) {
  if (memoryOnly) return fallback;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === null) return migrateLegacy(JSON.parse(localStorage.getItem(legacyKey)));
    const value = JSON.parse(stored);
    return validClock(value) ? value : ready();
  } catch {
    return fallback;
  }
}

let saved = loadClock(ready());
let mini = null;
let tickHost = window;
let tick;
const main = document.querySelector('.clock');
const pin = document.querySelector('#pin');
const hint = document.querySelector('#pin-hint');
const form = document.querySelector('#settings-form');
const feedback = document.querySelector('#settings-feedback');
const automatic = document.querySelector('#automatic');
const sound = document.querySelector('#sound');
const enableSound = document.querySelector('#enable-sound');
const bell = createBell(storageKey + ':bell', render);
const numberFields = ['focus', 'short', 'long', 'rounds'];
let displayedSettings = '';
const current = (now = Date.now()) => currentClock(loadClock(saved), now);

function save(clock) {
  saved = clock;
  try { localStorage.setItem(storageKey, JSON.stringify(clock)); } catch { memoryOnly = true; }
  render();
}

function updateSettings(clock, busy) {
  const settings = clock.settings;
  const signature = numberFields.map(key => settings[key]).join('/');
  if (displayedSettings !== signature) {
    for (const key of numberFields) form.elements[key].value = settings[key];
    displayedSettings = signature;
  }
  form.querySelector('fieldset').disabled = busy;
  document.querySelector('#settings-hint').textContent = busy
    ? '要调整时长或回合数，请先重置本段。'
    : '长休息结束后，从第 1 轮重新开始。';
  automatic.checked = settings.auto;
  sound.checked = settings.sound;
  enableSound.hidden = !settings.sound || clock.endsAt === null || bell.available();
}

function render() {
  tickHost.clearTimeout(tick);
  const now = Date.now();
  const clock = currentClock(saved, now);
  const left = timeLeft(clock, now);
  const total = clock.settings[clock.phase] * 60_000;
  const seconds = Math.ceil(left / 1000);
  const time = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  const running = clock.endsAt !== null;
  const paused = !running && left < total;
  const label = labels[clock.phase];
  let message = '准备' + label;
  let action = '开始' + label;
  if (running) {
    message = label + '中';
    action = '暂停';
  } else if (paused) {
    message = label + '已暂停';
    action = '继续' + label;
  }
  const position = clock.phase === 'focus'
    ? '第 ' + (clock.completed + 1) + '/' + clock.settings.rounds + ' 轮'
    : '已完成 ' + clock.completed + '/' + clock.settings.rounds + ' 轮';
  document.title = time + ' · ' + message + ' · 小小成就';
  for (const view of [main, mini?.document.querySelector('.clock')]) {
    if (!view) continue;
    view.dataset.phase = clock.phase;
    const status = view.querySelector('.status');
    const caption = message + ' · ' + position;
    if (status.textContent !== caption) status.textContent = caption;
    view.querySelector('.digits').textContent = time;
    const progress = view.querySelector('progress');
    progress.max = total;
    progress.value = total - left;
    const toggle = view.querySelector('[data-command="toggle"]');
    if (toggle.textContent !== action) toggle.textContent = action;
    view.querySelector('[data-command="reset"]').disabled = !running && !paused;
    for (const mode of view.querySelectorAll('[data-mode]')) {
      mode.setAttribute('aria-pressed', String(mode.dataset.mode === clock.phase));
      mode.disabled = running || paused;
    }
  }
  updateSettings(clock, running || paused);
  bell.arm(clock.settings.sound ? clock.endsAt : null);
  tickHost = mini || window;
  if (running) tick = tickHost.setTimeout(render, left % 1000 || 1000);
}

function control(event) {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  const now = Date.now();
  const clock = current(now);
  const left = timeLeft(clock, now);
  if (button.dataset.mode) {
    if (clock.endsAt === null && left === clock.settings[clock.phase] * 60_000) {
      const phase = button.dataset.mode;
      const completed = phase === 'focus' ? clock.completed % clock.settings.rounds : clock.completed;
      save(ready(phase, clock.settings, completed));
    }
    return;
  }
  if (button.dataset.command === 'reset') return save(ready(clock.phase, clock.settings, clock.completed));
  if (button.dataset.command !== 'toggle') return;
  if (clock.settings.sound) void bell.unlock();
  if (clock.endsAt !== null && left > 0) return save({ ...clock, remaining: left, endsAt: null });
  save({ ...clock, endsAt: now + clock.remaining });
}

main.addEventListener('click', control);
form.addEventListener('submit', event => {
  event.preventDefault();
  const clock = current();
  if (clock.endsAt !== null || clock.remaining < clock.settings[clock.phase] * 60_000) return;
  const settings = { ...clock.settings };
  for (const key of numberFields) settings[key] = form.elements[key].valueAsNumber;
  if (!validSettings(settings)) return;
  const newGroup = settings.rounds !== clock.settings.rounds;
  save(ready(newGroup ? 'focus' : clock.phase, settings, newGroup ? 0 : clock.completed));
  feedback.textContent = newGroup ? '已保存，从新一组的第 1 轮开始。' : '时长已保存。';
});
for (const [input, key] of [[automatic, 'auto'], [sound, 'sound']]) {
  input.addEventListener('change', () => {
    const clock = current();
    if (key === 'sound' && input.checked) void bell.unlock();
    save({ ...clock, settings: { ...clock.settings, [key]: input.checked } });
    feedback.textContent = '';
  });
}
enableSound.addEventListener('click', async () => {
  if (!await bell.unlock()) hint.textContent = '浏览器未能播放提示音，请检查此网站的声音权限。';
  render();
});
document.querySelector('#preview-bell').addEventListener('click', async () => {
  feedback.textContent = await bell.preview() ? '已播放提示音。' : '请检查浏览器的声音权限。';
});
window.addEventListener('storage', event => {
  if (event.key === storageKey || event.key === null) { saved = loadClock(saved); render(); }
});
window.addEventListener('pageshow', () => { saved = loadClock(saved); render(); });
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
    if (current().settings.sound) void bell.unlock();
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
