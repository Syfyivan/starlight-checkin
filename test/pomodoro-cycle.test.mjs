import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentClock, defaults, migrateLegacy, ready, timeLeft, validClock, validSettings } from '../public/pomodoro-cycle.js';

const minute = 60_000;
const start = 1_000_000;
const begin = settings => ({ ...ready('focus', settings), endsAt: start + settings.focus * minute });
function expectPhase(saved, elapsed, phase, completed, remainingMinutes) {
  const now = start + elapsed * minute;
  const clock = currentClock(saved, now);
  assert.equal(clock.phase, phase);
  assert.equal(clock.completed, completed);
  assert.equal(timeLeft(clock, now), remainingMinutes * minute);
  assert.ok(validClock(clock));
}

test('two focus rounds earn one short and one long break, then the next cycle starts', () => {
  const saved = begin({ ...defaults, focus: 2, short: 1, long: 3, rounds: 2 });
  for (const row of [[0,'focus',0,2],[2,'short',1,1],[3,'focus',1,2],[5,'long',2,3],[7,'long',2,1],[8,'focus',0,2],[10,'short',1,1]]) {
    expectPhase(saved, ...row);
  }
  expectPhase(saved, 8 * 100_000 + 5, 'long', 2, 3);
});

test('one-round groups take a long break every time and the default group takes it after four', () => {
  expectPhase(begin({ ...defaults, rounds: 1 }), 25, 'long', 1, 15);
  expectPhase(begin(defaults), 90, 'focus', 3, 25);
  expectPhase(begin(defaults), 115, 'long', 4, 15);
  expectPhase(begin(defaults), 130, 'focus', 0, 25);
});

test('manual advance waits at the next phase, paused time and manual breaks never earn an extra round', () => {
  const manual = begin({ ...defaults, auto: false });
  const after = currentClock(manual, start + 600 * minute);
  assert.deepEqual(after, { ...ready('short', manual.settings, 1), harvested: true });
  assert.equal(ready('short').harvested, undefined);
  const paused = { ...manual, endsAt: null, remaining: 3200 };
  assert.equal(currentClock(paused, start + 99 * minute), paused);
  expectPhase({ ...ready('short'), endsAt: start + minute }, 1, 'focus', 0, 25);
  assert.deepEqual(currentClock({ ...ready('long', manual.settings, 4), endsAt: start + minute }, start + minute), ready('focus', manual.settings));
});

test('previous running and paused timers preserve the remaining time and wait at the next boundary', () => {
  const migrated = migrateLegacy({ phase: 'focus', remaining: 12 * minute, endsAt: start + 12 * minute });
  assert.equal(timeLeft(migrated, start), 12 * minute);
  assert.equal(currentClock(migrated, start + 15 * minute).endsAt, null);
  assert.equal(migrateLegacy({ phase: 'rest', remaining: 5000, endsAt: null }).phase, 'short');
  assert.deepEqual(migrateLegacy({ phase: 'focus', remaining: -1 }), ready());
});

test('settings and stored clocks reject unusable durations, counts and deadlines', () => {
  for (const patch of [{ short: 0 }, { long: 181 }, { focus: 1.5 }, { rounds: 21 }, { rounds: 0 }, { auto: 'yes' }]) {
    assert.equal(validSettings({ ...defaults, ...patch }), false);
  }
  for (const patch of [{ phase: 'rest' }, { completed: 4 }, { remaining: 0 }, { endsAt: -1 }]) {
    assert.equal(validClock({ ...ready(), ...patch }), false);
  }
});
