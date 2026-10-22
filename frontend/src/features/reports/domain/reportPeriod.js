import { saleDay } from '../../sales/domain/saleModel.js';
import { toDateSafe } from '../../../core/dates/dateValues.js';

export const reportDay = value => {
  const date = toDateSafe(value);
  if (!date) throw new Error('Fecha del reporte inválida.');
  return saleDay({ createdAt: date });
};
export const dayDate = key => new Date(`${key}T00:00:00-05:00`);
const keyUTC = date => date.toISOString().slice(0, 10);
export const visibleDay = key => key.split('-').reverse().join('/');
export const reportTime = value => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(toDateSafe(value));
export function reportPeriod(filter, now = new Date()) {
  const today = reportDay(now), [year, month, day] = today.split('-').map(Number);
  let start = today, end = today;
  if (filter === 'semana') {
    const monday = new Date(Date.UTC(year, month - 1, day));
    monday.setUTCDate(day - (monday.getUTCDay() + 6) % 7);
    start = keyUTC(monday); monday.setUTCDate(monday.getUTCDate() + 6); end = keyUTC(monday);
  } else if (filter === 'mes') {
    start = `${today.slice(0, 7)}-01`; end = keyUTC(new Date(Date.UTC(year, month, 0)));
  } else if (filter === 'todo') { start = `${year}-01-01`; end = `${year}-12-31`; }
  else if (filter !== 'hoy') throw new Error('Filtro de reporte inválido.');
  return { filter, start, end, startDate: dayDate(start), endDate: new Date(dayDate(end).getTime() + 86400000 - 1), key: `${filter}:${start}:${end}` };
}
export function chartSkeleton(period) {
  const rows = [];
  for (let date = dayDate(period.start); date <= dayDate(period.end); date = new Date(date.getTime() + 86400000)) {
    const day = reportDay(date), key = period.filter === 'todo' ? day.slice(0, 7) : day;
    if (rows.at(-1)?.rawDate === key) continue;
    const label = period.filter === 'hoy' ? 'Hoy' : period.filter === 'mes' ? visibleDay(day).slice(0, 5)
      : new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', [period.filter === 'todo' ? 'month' : 'weekday']: 'short' }).format(date);
    rows.push({ rawDate: key, date: label, ventas: 0, ordenes: 0, pagos: 0 });
  }
  return rows;
}
