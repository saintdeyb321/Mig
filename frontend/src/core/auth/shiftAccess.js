const minutes = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
export function limaTime(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}
// UI schedule only. Real authorization remains in Rules and Functions.
export function isWithinShift(user, at = new Date()) {
  if (['dueño', 'superadmin'].includes(user?.role)) return true;
  if (user?.role !== 'cajero') return false;
  if (!user.shiftStart || !user.shiftEnd) return true;
  const start = minutes(user.shiftStart), end = minutes(user.shiftEnd);
  const current = minutes(at instanceof Date ? limaTime(at) : at);
  if (start === null || end === null || current === null) return false;
  // Start inclusive, end exclusive. Equal endpoints represent a full day.
  return start === end || (start < end ? current >= start && current < end : current >= start || current < end);
}
export function watchShift(user, onExpired, { now = () => new Date(), every = setInterval, cancel = clearInterval } = {}) {
  if (user?.role !== 'cajero' || !user.shiftStart || !user.shiftEnd) return () => {};
  let active = true, expired = false;
  const check = () => { if (active && !expired && !isWithinShift(user, now())) { expired = true; onExpired(); } };
  check(); const timer = every(check, 10000);
  return () => { active = false; cancel(timer); };
}
