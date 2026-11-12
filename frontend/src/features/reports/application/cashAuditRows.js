import { toDateSafe } from '../../../core/dates/dateValues.js';
import { reportDay, visibleDay, reportTime } from '../domain/reportPeriod.js';
import { branchReportName, employeeReportName, reportNote } from './reportNames.js';

const monetaryValue = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const eventTitles = { opening: 'APERTURA', closing: 'CIERRE MANUAL', expiry: 'VENCIMIENTO SIN ARQUEO' };

export function cashAuditEvents(sessions, scope, { branchesMap = {}, people } = {}) {
  const events = [];
  for (const session of sessions) {
    if (scope.businessId && session.businessId !== scope.businessId) continue;
    if (scope.branchId !== 'global' && session.branchId !== scope.branchId) continue;
    const add = (value, kind, details) => {
      const date = toDateSafe(value);
      if (!date) return;
      const day = reportDay(date);
      if (day < scope.period.start || day > scope.period.end) return;
      events.push({ kind, date, day, branch: branchReportName(branchesMap, session.branchId),
        cashier: employeeReportName(people, session.userId, session.cashierName),
        opening: monetaryValue(session.openingAmount), reference: null, counted: null, difference: null, ...details });
    };
    add(session.openedAt, 'opening', { actor: employeeReportName(people, session.userId, session.cashierName),
      state: 'Fondo registrado', note: reportNote(session.openingNote, session.id, session.userId) });
    if (session.status === 'expired_unreconciled') {
      const finalizedAt = toDateSafe(session.recoveredAt);
      add(session.expiredAt, 'expiry', { actor: employeeReportName(people, session.recoveredBy, session.recoveredByName), state: 'Finalizado por vencimiento · sin arqueo',
        finalizedAt, note: 'Venció 10 horas después de la apertura.' + (finalizedAt ? ` Finalización confirmada el ${visibleDay(reportDay(finalizedAt))} ${reportTime(finalizedAt)} (Lima).` : ' Hora de finalización no registrada.') });
    }
    if (['closed', 'closed_with_discrepancy'].includes(session.status)) {
      const counted = monetaryValue(session.declaredAmount);
      const reference = monetaryValue(session.closeEstimate?.expectedCash ?? session.expectedCash ?? session.expectedAmount);
      const estimated = !!(session.reconciliationPending || session.requiresFinancialReview || session.closeEstimate?.authority === 'client-estimate');
      const difference = counted === null ? null : monetaryValue(session.closeEstimate?.difference ?? session.difference ?? session.discrepancy);
      const state = estimated ? 'Conciliación pendiente' : difference === null ? 'Pendiente de revisión'
        : difference === 0 ? 'Coincide' : difference > 0 ? 'Sobrante registrado' : 'Faltante registrado';
      add(session.closedAt, 'closing', { actor: employeeReportName(people, session.closedBy, session.closedByName),
        counted, reference, difference, estimated, state, note: reportNote(session.closingNote, session.id, session.closedBy, session.userId) });
    }
  }
  return events.sort((a, b) => a.date - b.date);
}

export function cashAuditRows(events) {
  return events.map(event => ({
    'Fecha y hora del movimiento': `${visibleDay(event.day)} ${reportTime(event.date)}`,
    Turno: eventTitles[event.kind],
    Sede: event.branch,
    Responsable: event.cashier,
    'Registrado por': event.actor,
    'Fondo inicial (S/)': event.opening ?? 'No registrado',
    'Referencia calculada (S/)': event.reference ?? (event.kind === 'opening' ? 'No aplica' : 'Sin referencia'),
    'Efectivo declarado (S/)': event.counted ?? (event.kind === 'opening' ? 'No aplica' : 'No declarado'),
    'Diferencia (S/)': event.difference ?? (event.kind === 'opening' ? 'No aplica' : 'No calculable'),
    Estado: event.state,
    Observación: (event.estimated ? 'Referencia y diferencia disponibles son provisionales. ' : '') + event.note,
  }));
}
