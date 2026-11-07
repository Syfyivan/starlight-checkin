// Schedule on the audio clock so a background tab's delayed UI tick does not
// delay the chime. Only one sound-enabled tab owns the alarm at a time.
export function createBell(lockName, onStateChange) {
  let context, releaseLock, lockPending = false, leader = false;
  let deadline = null, scheduled = null;

  function chime(start) {
    return [784, 988].map((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = start + index * 0.17;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.17, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.52);
      oscillator.connect(gain).connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(at);
      oscillator.stop(at + 0.55);
      return oscillator;
    });
  }
  function cancel(force = true) {
    // At a natural transition the audio device can be a few milliseconds
    // behind the wall clock. Let that bell finish while arming the next one.
    if (scheduled && (force || scheduled.end > Date.now() || scheduled.start > context.currentTime + 0.25)) {
      for (const note of scheduled.notes) note.stop();
    }
    scheduled = null;
  }
  function schedule() {
    if (!leader || context?.state !== 'running' || !deadline) return;
    const delay = (deadline - Date.now()) / 1000;
    if (delay <= 0) return;
    const start = context.currentTime + delay;
    if (scheduled?.end === deadline) {
      if (Math.abs(start - scheduled.start) < 0.35) return;
      cancel(); // The wall and audio clocks may advance differently during sleep.
    }
    scheduled = { end: deadline, start, notes: chime(start) };
  }
  function claim() {
    if (leader || lockPending || context?.state !== 'running') return;
    if (!navigator.locks) { leader = true; schedule(); return; }
    lockPending = true;
    navigator.locks.request(lockName, async () => {
      if (context.state !== 'running') return;
      leader = true;
      schedule();
      await new Promise(resolve => { releaseLock = resolve; });
      leader = false;
      releaseLock = null;
    }).catch(() => {}).finally(() => { lockPending = false; });
  }
  async function unlock() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return false;
    try {
      if (!context) {
        context = new Audio();
        context.addEventListener('statechange', () => {
          if (context.state === 'running') claim();
          else { cancel(); releaseLock?.(); }
          onStateChange();
        });
      }
      if (context.state !== 'running') await context.resume();
      claim();
      return context.state === 'running';
    } catch { return false; }
  }
  window.addEventListener('pagehide', () => { cancel(); releaseLock?.(); });
  window.addEventListener('pageshow', claim);
  return {
    unlock,
    available: () => context?.state === 'running',
    async preview() { if (!await unlock()) return false; chime(context.currentTime + 0.02); return true; },
    arm(end) {
      if (end !== deadline) { cancel(false); deadline = end; }
      schedule();
    }
  };
}
