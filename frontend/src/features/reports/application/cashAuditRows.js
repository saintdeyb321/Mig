import { cashExpiryTotals } from '../../cash-register/application/cashExpiryTotals.js';
import { CASH_EXPIRY_LABEL, cashExpiryWindow, materializedCashExpiry } from '../../cash-register/domain/cashExpiry.js';
import { voidCashPayments } from '../../sales/infrastructure/posVoidQueryRepository.js';
import { toDateSafe } from '../../../core/dates/dateValues.js';
import { reportDay, visibleDay, reportTime } from '../domain/reportPeriod.js';
import { branchReportName, employeeReportName, reportNote } from './reportNames.js';

const monetaryValue = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const eventTitles = { opening: 'APERTURA', closing: 'CIERRE MANUAL', expiry: CASH_EXPIRY_LABEL.toUpperCase() };

export function cashAuditEvents(sessions, scope, { branchesMap = {}, people } = {}) {
  const events = [];
  const groupBySession = rows => {
    const groups = new Map();
    for (const row of rows) {
      if (!row.sessionId) continue;
      const key = JSON.stringify([row.businessId, row.branchId, row.sessionId]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return groups;
  };
  const sales = groupBySession(scope.sales ?? []);
  const payments = groupBySession([...(scope.payments ?? []), ...voidCashPayments(scope.voids ?? [])]);
  const snapshotAt = scope.loadedAt ?? Date.now();

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
    const window = cashExpiryWindow(session);
    const materialized = session.status === 'expired_unreconciled';
    if (materialized || (session.status === 'open' && window?.expiresAt <= snapshotAt)) {
      const finalizedAt = materialized ? toDateSafe(session.recoveredAt) : null;
      const evidence = materializedCashExpiry(session);
      let totals;
      if (evidence && scope.cashReferenceAsOf >= +evidence.finalizedAt && scope.period.startDate <= evidence.openedAt
        && scope.period.endDate >= evidence.expiresAt && scope.sales && scope.payments && scope.voids) {
        const key = JSON.stringify([session.businessId, session.branchId, session.id]);
        try { totals = cashExpiryTotals(session, sales.get(key) ?? [], payments.get(key) ?? []); }
        catch { /* Keep the audit event and explicitly report that the reference could not be verified. */ }
      }
      add(materialized ? session.expiredAt : window.expiresAt, 'expiry', {
        actor: finalizedAt ? employeeReportName(people, session.recoveredBy, session.recoveredByName) : 'Pendiente de confirmación',
        state: CASH_EXPIRY_LABEL, duration: window?.duration, materialized, finalizedAt, reference: totals?.expectedCash ?? null, digital: totals?.digitalTotal ?? null,
        note: (window ? `Venció ${window.duration} horas después de la apertura. ` : '')
          + (finalizedAt ? `Finalización confirmada el ${visibleDay(reportDay(finalizedAt))} ${reportTime(finalizedAt)} (Lima).`
            : materialized ? 'Hora de confirmación no verificada.' : 'Finalización pendiente de confirmación en Firestore.')
          + (totals ? ' Referencia de movimientos registrados. Sin conteo físico.' : ' Referencia pendiente de verificar.'),
      });
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
    'Referencia calculada (S/)': event.reference ?? (event.kind === 'opening' ? 'No aplica' : event.kind === 'expiry' ? 'Pendiente de verificar' : 'Sin referencia'),
    'Yape/Plin registrado (S/)': event.digital ?? (event.kind === 'expiry' ? 'Pendiente de verificar' : 'No aplica'),
    'Efectivo declarado (S/)': event.counted ?? (event.kind === 'opening' ? 'No aplica' : 'No declarado'),
    'Diferencia (S/)': event.difference ?? (event.kind === 'opening' ? 'No aplica' : 'No calculable'),
    Estado: event.state,
    Observación: (event.estimated ? 'Referencia y diferencia disponibles son provisionales. ' : '') + event.note,
  }));
}
