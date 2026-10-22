import { toDateSafe } from '../../../core/dates/dateValues.js';
import { reportDay, visibleDay, reportTime } from '../domain/reportPeriod.js';
import { amount } from '../domain/reportTotals.js';

export function cashAuditRows(sessions, branchesMap, scope) {
  const rows = [];
  const state = difference => difference === null ? 'Pendiente de revisión' : difference === 0 ? '✅ Cuadrado' : difference > 0 ? '⚠️ Sobrante' : '❌ Faltante';
  for (const session of sessions) {
    if (scope.businessId && session.businessId !== scope.businessId) continue;
    if (scope.branchId !== 'global' && session.branchId !== scope.branchId) continue;
    const open = toDateSafe(session.openedAt), close = toDateSafe(session.closedAt);
    const add = (date, opening) => {
      const day = reportDay(date);
      if (day < scope.period.start || day > scope.period.end) return;
      const raw = opening ? session.openingDiscrepancy : session.requiresFinancialReview || session.reconciliationPending ? null : session.difference ?? session.discrepancy;
      const difference = raw == null ? null : amount(raw);
      rows.push({ timestamp: date.getTime(), row: { 'Fecha Cierre': visibleDay(day), Turno: `${opening ? 'APERTURA' : 'CIERRE'}: ${reportTime(date)}`,
        Sede: branchesMap[session.branchId] ?? session.branchId, Cajero: session.cashierName ?? '',
        'Fondo+Ventas (S/)': opening ? difference === null ? 'Pendiente' : amount(session.openingAmount - difference) : session.expectedCash ?? session.expectedAmount ?? 'Pendiente',
        'Contado Real (S/)': (opening ? session.openingAmount : session.declaredAmount) ?? 'Pendiente', 'Diferencia (S/)': difference ?? 'Pendiente',
        Estado: state(difference), Justificación: (opening ? session.openingNote : session.closingNote) ?? '' } });
    };
    if (open) add(open, true);
    if (close && ['closed', 'closed_with_discrepancy'].includes(session.status)) add(close, false);
  }
  return rows.sort((a, b) => a.timestamp - b.timestamp).map(item => item.row);
}
