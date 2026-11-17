import { cashExpiryTotals } from '../../cash-register/application/cashExpiryTotals.js';
import { cashExpiryWindow, materializedCashExpiry } from '../../cash-register/domain/cashExpiry.js';
import { voidCashPayments } from '../../sales/infrastructure/posVoidQueryRepository.js';
import { toDateSafe } from '../../../core/dates/dateValues.js';
import { reportDay, visibleDay, reportTime } from '../domain/reportPeriod.js';
import { branchReportName, employeeReportName, reportNote } from './reportNames.js';

const monetaryValue = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const eventTitles = { opening: 'APERTURA', closing: 'CIERRE MANUAL', expiry: 'VENCIMIENTO' };

export function classifyCashEvent(event) {
  if (event.kind === 'opening') return { state: 'Fondo registrado' };
  if (event.kind === 'expiry') return { state: 'Vencido sin conteo', incident: 'expiry' };
  if (![event.counted, event.reference, event.difference].every(Number.isFinite)) {
    return { state: 'Faltan datos para revisar el cierre', incident: 'missing' };
  }
  if (event.difference === 0) return { state: event.estimated ? 'Sin diferencia registrada · por verificar' : 'Cuadrado' };
  const shortage = event.difference < 0;
  return { state: `${shortage ? 'Faltante' : 'Sobrante'}${event.estimated ? ' por revisar' : ''}`, incident: shortage ? 'short' : 'extra' };
}

export function cashClosingTimes(events) {
  const minutes = new Map(), seconds = new Map();
  for (const event of events) {
    if (event.kind !== 'closing') continue;
    const time = +event.date;
    const minute = Math.floor(time / 60000), second = Math.floor(time / 1000);
    minutes.set(minute, (minutes.get(minute) ?? 0) + 1);
    seconds.set(second, (seconds.get(second) ?? 0) + 1);
  }
  return event => {
    const time = +event.date;
    const withSeconds = event.kind === 'closing' && minutes.get(Math.floor(time / 60000)) > 1;
    return { time: reportTime(event.date) + (withSeconds ? `:${String(event.date.getUTCSeconds()).padStart(2, '0')}` : ''),
      withSeconds, reference: withSeconds && seconds.get(Math.floor(time / 1000)) > 1 ? event._sessionId?.slice(-8) : undefined };
  };
}

export const verifiedCashDifference = event => event.kind === 'closing' && !event.estimated
  && Number.isFinite(event.counted) && Number.isFinite(event.difference);

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

  for (const [index, session] of sessions.entries()) {
    if (scope.businessId && session.businessId !== scope.businessId) continue;
    if (scope.branchId !== 'global' && session.branchId !== scope.branchId) continue;
    const sessionKey = session.id ? JSON.stringify([session.businessId, session.branchId, session.id]) : Symbol();
    const openedAt = toDateSafe(session.openedAt);
    const add = (value, kind, details) => {
      const date = toDateSafe(value);
      if (!date) return;
      const day = reportDay(date);
      if (day < scope.period.start || day > scope.period.end) return;
      events.push({ kind, date, day, branchId: session.branchId, branch: branchReportName(branchesMap, session.branchId),
        _sessionKey: sessionKey, _sessionId: session.id, _openedAt: openedAt ? +openedAt : Infinity, _sessionIndex: index,
        cashier: employeeReportName(people, session.userId, session.cashierName),
        opening: monetaryValue(session.openingAmount), reference: null, counted: null, difference: null, ...details });
    };
    const window = cashExpiryWindow(session);
    const materialized = session.status === 'expired_unreconciled';
    const expired = materialized || (session.status === 'open' && window?.expiresAt <= snapshotAt);
    add(session.openedAt, 'opening', { actor: employeeReportName(people, session.userId, session.cashierName),
      inProgress: session.status === 'open' && !expired, note: reportNote(session.openingNote, session.id, session.userId).trim() });
    if (expired) {
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
        duration: window?.duration, materialized, finalizedAt, reference: totals?.expectedCash ?? null, digital: totals?.digitalTotal ?? null,
      });
    }
    if (['closed', 'closed_with_discrepancy'].includes(session.status)) {
      const counted = monetaryValue(session.declaredAmount);
      const reference = monetaryValue(session.closeEstimate?.expectedCash ?? session.expectedCash ?? session.expectedAmount);
      const estimated = !!(session.reconciliationPending || session.requiresFinancialReview || session.closeEstimate?.authority === 'client-estimate');
      const difference = counted === null ? null : monetaryValue(session.closeEstimate?.difference ?? session.difference ?? session.discrepancy);
      add(session.closedAt, 'closing', { actor: employeeReportName(people, session.closedBy, session.closedByName),
        counted, reference, difference, estimated, note: reportNote(session.closingNote, session.id, session.closedBy, session.userId).trim() });
    }
  }
  return events.sort((a, b) => a.date - b.date);
}

export function cashAuditRows(events) {
  const clock = cashClosingTimes(events), groups = new Map();
  for (const event of events) {
    if (!groups.has(event._sessionKey)) groups.set(event._sessionKey, []);
    groups.get(event._sessionKey).push(event);
  }
  const ordered = [...groups.values()].sort(([a], [b]) => a.branch.localeCompare(b.branch, 'es')
    || String(a.branchId).localeCompare(String(b.branchId)) || a._openedAt - b._openedAt
    || String(a._sessionId ?? '').localeCompare(b._sessionId ?? '') || a._sessionIndex - b._sessionIndex);
  const row = event => {
    const { time, withSeconds } = clock(event);
    return {
      Fecha: visibleDay(event.day),
      Turno: eventTitles[event.kind],
      Hora: time,
      Sede: event.branch,
      Cajero: event.cashier,
      'Registrado por': event.actor,
      'Fondo inicial (S/)': event.opening ?? 'No registrado',
      'Efectivo esperado (S/)': event.reference ?? (event.kind === 'opening' ? 'No aplica' : event.kind === 'expiry' ? 'No verificable' : 'Sin referencia'),
      'Yape/Plin registrado (S/)': event.digital ?? (event.kind === 'expiry' ? 'Pendiente de verificar' : 'No aplica'),
      'Efectivo contado (S/)': event.counted ?? 'No declarado',
      'Diferencia (S/)': event.difference ?? 'No calculable',
      Estado: classifyCashEvent(event).state,
      Observación: event.note ? `Mensaje adjunto: ${event.note}` : '',
      _timeWithSeconds: withSeconds,
      _verifiedDifference: verifiedCashDifference(event),
    };
  };
  return ordered.flatMap((group, index) => [
    ...(index ? [{ _kind: 'group-spacer' }] : []),
    ...group.sort((a, b) => Number(b.kind === 'opening') - Number(a.kind === 'opening')).map(row),
  ]);
}
