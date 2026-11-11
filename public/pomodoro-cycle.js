export const defaults = Object.freeze({ focus: 25, short: 5, long: 15, rounds: 4, auto: true, sound: true });
export const labels = { focus: '专注', short: '短休息', long: '长休息' };
const integerIn = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;
export function validSettings(settings) {
  return settings && ['focus', 'short', 'long'].every(key => integerIn(settings[key], 1, 180))
    && integerIn(settings.rounds, 1, 20) && typeof settings.auto === 'boolean' && typeof settings.sound === 'boolean';
}
export function ready(phase = 'focus', settings = defaults, completed = 0) {
  return { phase, settings, completed, remaining: settings[phase] * 60_000, endsAt: null };
}
export function validClock(value) {
  return value && Object.hasOwn(labels, value.phase) && validSettings(value.settings)
    && integerIn(value.completed, 0, value.settings.rounds)
    && (value.phase !== 'focus' || value.completed < value.settings.rounds)
    && integerIn(value.remaining, 1, value.settings[value.phase] * 60_000)
    && (value.endsAt === null || (Number.isSafeInteger(value.endsAt) && value.endsAt > 0));
}
export function migrateLegacy(value) {
  if (!value || !['focus', 'rest'].includes(value.phase)) return ready();
  const phase = value.phase === 'rest' ? 'short' : 'focus';
  // Existing sessions originally waited for a click between phases.
  const clock = { ...ready(phase, { ...defaults, auto: false }), remaining: value.remaining, endsAt: value.endsAt };
  return validClock(clock) ? clock : ready();
}
export function timeLeft(clock, now) {
  if (clock.endsAt === null) return clock.remaining;
  return Math.min(clock.remaining, Math.max(0, clock.endsAt - now));
}
function following(clock) {
  const { phase, settings, completed } = clock;
  if (phase === 'focus') {
    const count = completed + 1;
    return { ...ready(count >= settings.rounds ? 'long' : 'short', settings, count), harvested: true };
  }
  return ready('focus', settings, phase === 'long' ? 0 : completed % settings.rounds);
}
// All tabs derive the same phase from the saved deadline. A late tick cannot
// lengthen a break or advance a round twice. Only user actions write storage.
export function currentClock(saved, now) {
  let clock = saved;
  while (clock.endsAt !== null && now >= clock.endsAt) {
    let start = clock.endsAt;
    clock = following(clock);
    const s = clock.settings;
    if (!s.auto) break;
    if (clock.phase === 'focus' && clock.completed === 0) {
      const cycleMs = (s.rounds * s.focus + (s.rounds - 1) * s.short + s.long) * 60_000;
      start += Math.floor((now - start) / cycleMs) * cycleMs;
    }
    clock.endsAt = start + clock.remaining;
  }
  return clock;
}
