const minutes = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
export function limaTime(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}
// Shared by the UI and server; only server time authorizes new operations.
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

// Server-issued offline grants never extend beyond the issuing cashier's shift.
export function shiftEndMillis(user, at) {
  if (user?.role !== 'cajero' || !user.shiftStart || !user.shiftEnd || user.shiftStart === user.shiftEnd) return Infinity;
  const current = minutes(limaTime(new Date(at))), end = minutes(user.shiftEnd);
  if (current === null || end === null || !isWithinShift(user, new Date(at))) return at;
  const seconds = Math.floor(at / 1000) % 60;
  const remainder = at % 1000;
  let delta = (end - current + 1440) % 1440;
  if (delta === 0) delta = 1440;
  return at + delta * 60000 - seconds * 1000 - remainder;
}
