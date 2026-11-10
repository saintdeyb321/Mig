import { toDateSafe } from '../../../core/dates/dateValues.js';
import { reportDay, visibleDay, reportTime } from '../domain/reportPeriod.js';

const monetaryValue = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const eventTitles = { opening: 'APERTURA', closing: 'CIERRE MANUAL', expiry: 'VENCIMIENTO SIN ARQUEO' };

export function cashAuditEvents(sessions, scope) {
  const events = [];
  for (const session of sessions) {
    if (scope.businessId && session.businessId !== scope.businessId) continue;
    if (scope.branchId !== 'global' && session.branchId !== scope.branchId) continue;
    const add = (value, kind, details) => {
      const date = toDateSafe(value);
      if (!date) return;
      const day = reportDay(date);
      if (day < scope.period.start || day > scope.period.end) return;
      events.push({ kind, date, day, branchId: session.branchId, cashier: session.cashierName || session.userId || '',
        opening: monetaryValue(session.openingAmount), reference: null, counted: null, difference: null, actor: '', ...details });
    };
    add(session.openedAt, 'opening', { actor: session.cashierName || session.userId || '', state: 'Fondo registrado', note: session.openingNote ?? '' });
    if (session.status === 'expired_unreconciled') {
      const recovered = toDateSafe(session.recoveredAt);
      add(session.expiredAt, 'expiry', { actor: session.recoveredBy ?? '', state: 'Pendiente de arqueo',
        note: 'Límite de 10 horas desde apertura.' + (recovered ? ` Recuperado el ${visibleDay(reportDay(recovered))} ${reportTime(recovered)} (Lima).` : '') });
    }
    if (['closed', 'closed_with_discrepancy'].includes(session.status)) {
      const counted = monetaryValue(session.declaredAmount);
      const reference = monetaryValue(session.closeEstimate?.expectedCash ?? session.expectedCash ?? session.expectedAmount);
      const estimated = !!(session.reconciliationPending || session.requiresFinancialReview || session.closeEstimate?.authority === 'client-estimate');
      const difference = counted === null ? null : monetaryValue(session.closeEstimate?.difference ?? session.difference ?? session.discrepancy);
      const state = estimated ? 'Conciliación pendiente' : difference === null ? 'Pendiente de revisión'
        : difference === 0 ? 'Coincide' : difference > 0 ? 'Sobrante registrado' : 'Faltante registrado';
      add(session.closedAt, 'closing', { actor: session.closedBy ?? '', counted, reference, difference, estimated, state, note: session.closingNote ?? '' });
    }
  }
  return events.sort((a, b) => a.date - b.date);
}

export function cashAuditRows(events, branchesMap) {
  return events.map(event => ({
    'Fecha y hora del movimiento (Lima)': `${visibleDay(event.day)} ${reportTime(event.date)}`,
    Turno: eventTitles[event.kind],
    Sede: branchesMap[event.branchId] ?? event.branchId,
    Responsable: event.cashier,
    'Registrado por': event.actor,
    'Fondo inicial (S/)': event.opening ?? 'No registrado',
    'Referencia calculada (S/)': event.reference ?? (event.kind === 'opening' ? 'No aplica' : 'Sin referencia'),
    'Contado Real (S/)': event.counted ?? (event.kind === 'opening' ? 'No aplica' : 'No declarado'),
    'Diferencia (S/)': event.difference ?? (event.kind === 'opening' ? 'No aplica' : 'No calculable'),
    Estado: event.state,
    Observación: (event.estimated ? 'Referencia y diferencia disponibles son provisionales. ' : '') + event.note,
  }));
}
