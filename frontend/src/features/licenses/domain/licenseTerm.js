import { toDateSafe } from '../../../core/dates/dateValues.js';

export function validateLicenseMonths(value) {
  if (!Number.isInteger(value) || value < 1 || value > 120) {
    throw Object.assign(new Error('La duración debe ser de 1 a 120 meses.'), { code: 'invalid-administration' });
  }
  return value;
}

export function addLicenseMonths(ms, count) {
  const peruOffset = 5 * 3600000;
  const date = new Date(ms - peruOffset), day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + validateLicenseMonths(count));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime() + peruOffset;
}
export const formatLicenseDate = value => toDateSafe(value)?.toLocaleDateString('es-PE', {
  timeZone: 'America/Lima', day: 'numeric', month: 'short', year: 'numeric',
}) ?? 'Sin fecha confirmada';

