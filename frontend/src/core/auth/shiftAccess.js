import { isWithinShift } from '../../../../functions/src/core/shiftSchedule.js';
export { isWithinShift, limaTime } from '../../../../functions/src/core/shiftSchedule.js';
export function watchShift(user, onExpired, { now = () => new Date(), every = setInterval, cancel = clearInterval } = {}) {
  if (user?.role !== 'cajero' || !user.shiftStart || !user.shiftEnd) return () => {};
  let active = true, expired = false;
  const check = () => { if (active && !expired && !isWithinShift(user, now())) { expired = true; onExpired(); } };
  check(); const timer = every(check, 10000);
  return () => { active = false; cancel(timer); };
}
