import { toDateSafe } from '../core/dates/dateValues.js';

export function printDate(value, options) {
  if (typeof value === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2}))?$/.test(value)) return 'Fecha no disponible';
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    const calendar = new Date(Date.UTC(year, month - 1, day));
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return 'Fecha no disponible';
  } else if (!(value instanceof Date) && typeof value?.toDate !== 'function') return 'Fecha no disponible';
  const date = toDateSafe(value);
  return date ? new Intl.DateTimeFormat('es-PE', { ...options, timeZone: 'America/Lima' }).format(date) : 'Fecha no disponible';
}
export const paymentDate = (payment, options) => printDate(payment.occurredAt ?? payment.date, options);

// Presentation only: cancelled debt is zero; net paid comes from signed ledger entries.
export function printFinancials(contract) {
  const total = Number(contract.total) || 0;
  const ledger = contract.payments;
  // A cashier's ledger query may be branch-scoped; the server projection includes all branches.
  const paid = Number.isFinite(contract.paidTotal) ? contract.paidTotal
    : Array.isArray(ledger) && (ledger.length || contract.paymentsMigrated)
      ? ledger.reduce((sum, payment) => sum + Number(payment.amount), 0)
      : contract.status === 'cancelado' ? 0 : total - (Number(contract.balance) || 0);
  return { paidTotal: Number.isFinite(paid) ? Math.round(paid * 100) / 100 : null,
    balance: contract.status === 'cancelado' ? 0 : Number(contract.balance) || 0,
    settledLabel: contract.status === 'cancelado' ? 'CANCELADO · SIN DEUDA' : 'TOTALMENTE PAGADO ✅' };
}
