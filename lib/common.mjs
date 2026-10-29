// Persist balances as integer micro-coins so later fractional amounts are exact.
export const COIN = 1_000_000;
const dayFormatter = new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'
});
export const dayAt = (time=Date.now()) => dayFormatter.format(time);
