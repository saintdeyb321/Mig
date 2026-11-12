import { toDateSafe } from '../../../core/dates/dateValues.js';
import { calculateCashTotals } from '../../../../../functions/src/cash-register/domain/cashTotals.js';
import { money } from '../../sales/domain/saleModel.js';
import { materializedCashExpiry } from '../domain/cashExpiry.js';

// Preserve Firestore microseconds at the end of a turn, even when UI dates use milliseconds.
const micros = value => Number.isInteger(value?.seconds) && Number.isInteger(value?.nanoseconds)
  ? value.seconds * 1000000 + Math.floor(value.nanoseconds / 1000) : (toDateSafe(value)?.getTime() ?? NaN) * 1000;

export function cashExpiryTotals(session, sales, payments) {
  const window = materializedCashExpiry(session);
  if (!window || !Number.isFinite(session.openingAmount)) throw new Error('Turno vencido sin evidencia verificable.');
  const start = micros(session.openedAt), end = start + window.duration * 3600000000;
  const inTurn = (row, value) => {
    const time = micros(value);
    return row.businessId === session.businessId && row.branchId === session.branchId && row.sessionId === session.id
      && time >= start && time < end;
  };
  if (sales.some(row => row.status !== 'confirmed' || row.voided || !inTurn(row, row.confirmedAt))
    || payments.some(row => row.runtime !== 'spark' || !inTurn(row, row.occurredAt))) {
    throw new Error('Hay movimientos sin evidencia suficiente para este turno.');
  }
  const totals = calculateCashTotals(session, sales, payments);
  return { ...totals, posCashNet: money(totals.posCash + totals.posCompensationCash) };
}
