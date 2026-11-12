import { toDateSafe } from '../../../core/dates/dateValues.js';

export const NEW_CASH_DURATION_HOURS = 14;
export const MIN_CASH_DURATION_HOURS = 10;
export const CASH_EXPIRY_LABEL = 'Cierre por vencimiento · sin arqueo';

export function cashExpiryWindow(session) {
  const duration = session?.durationHours;
  if (session?.runtime !== 'spark' || ![MIN_CASH_DURATION_HOURS, NEW_CASH_DURATION_HOURS].includes(duration)) return null;
  const openedAt = toDateSafe(session.openedAt);
  return openedAt && { openedAt, expiresAt: new Date(openedAt.getTime() + duration * 3600000), duration };
}

export function materializedCashExpiry(session) {
  const window = cashExpiryWindow(session);
  const finalizedAt = toDateSafe(session?.recoveredAt);
  if (!window || session.status !== 'expired_unreconciled' || !finalizedAt || !session.recoveredBy
    || toDateSafe(session.expiredAt)?.getTime() !== window.expiresAt.getTime() || finalizedAt < window.expiresAt
    || session.declaredAmount !== null || session.difference !== null) return null;
  return { ...window, finalizedAt };
}
