import { collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, orderBy, query, startAfter, Timestamp, where } from 'firebase/firestore';
import { auth, db } from '../../../core/firebase/client.js';
import { checkedRead } from '../../../core/firebase/readDiagnostics.js';
import { classifyCashEvent } from '../application/cashAuditRows.js';
import { dayDate, reportDay, reportTime } from '../domain/reportPeriod.js';
import { toDateSafe } from '../../../core/dates/dateValues.js';

const ledgerKinds = { advance: 'Adelanto', payment: 'Abono', refund: 'Reembolso contable' };
const pageSize = 50;
const cashStreams = {
  all: [{ field: 'openedAt' }],
  closing: [{ field: 'closedAt' }],
  expired: [{ field: 'expiredAt' }],
  incidents: [{ field: 'closedAt', incident: true }, { field: 'expiredAt', incident: true }],
};
function cashEvidence(record, field) {
  if (field === 'expiredAt') return { kind: 'expiry', counted: null, reference: null, difference: null, estimated: true };
  if (field === 'openedAt') return { kind: 'opening', counted: null, reference: null, difference: null, estimated: false };
  return { kind: 'closing', counted: record.declaredAmount ?? null,
    reference: record.closeEstimate?.expectedCash ?? record.expectedCash ?? record.expectedAmount ?? null,
    difference: record.closeEstimate?.difference ?? record.difference ?? record.discrepancy ?? null,
    estimated: !!(record.reconciliationPending || record.requiresFinancialReview || record.closeEstimate?.authority === 'client-estimate') };
}
function project(record, field, orders) {
  const date = toDateSafe(record[field]);
  if (!date) return null;
  const membership = { id: record.id, branchId: record.branchId, date: reportDay(date), time: reportTime(date), when: +date };
  if (orders) return { ...membership, type: ledgerKinds[record.type] ?? 'Movimiento', payment: record.method, amount: record.amount ?? null,
    reference: record.contractNumber ?? '' };
  const evidence = cashEvidence(record, field), { incident, state } = classifyCashEvent(evidence);
  return { ...membership, type: state, incident, opening: record.openingAmount, amount: evidence.counted,
    expected: evidence.reference, difference: evidence.difference, estimated: evidence.estimated };
}

export async function readAuditPage({ uid, businessId, branchId, area, from, to, filter, lookup, cursor, signal }) {
  const current = () => {
    signal.throwIfAborted();
    if (auth.currentUser?.uid !== uid) throw new DOMException('La sesión cambió.', 'AbortError');
  };
  current();
  if (!businessId || !branchId || !['orders', 'cash'].includes(area)) throw new Error('Alcance de auditoría inválido.');
  const start = dayDate(from), end = new Date(+dayDate(to) + 86400000 - 1);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end < start || +end - +start >= 31 * 86400000) {
    throw new Error('Elige un rango de hasta 31 días.');
  }
  const orders = area === 'orders', name = orders ? 'payments' : 'cash_sessions';
  if (lookup && !/^[A-Za-z0-9_-]{1,160}$/.test(lookup)) throw new Error('Identificador inválido.');
  if (lookup && !orders) {
    const saved = await checkedRead(getDocFromServer, 'reports-audit', signal)(doc(db, name, lookup));
    current();
    if (saved.metadata?.fromCache || saved.metadata?.hasPendingWrites) throw new Error('La auditoría requiere datos confirmados.');
    if (!saved.exists()) return { rows: [], next: null };
    const record = { ...saved.data(), id: saved.id };
    if (record.businessId !== businessId || (branchId !== 'global' && record.branchId !== branchId)) return { rows: [], next: null };
    const field = orders ? 'occurredAt' : record.expiredAt ? 'expiredAt' : record.closedAt ? 'closedAt' : 'openedAt';
    return { rows: [project(record, field, orders)].filter(Boolean), next: null };
  }
  const streams = orders ? [{ field: 'occurredAt', type: Object.hasOwn(ledgerKinds, filter) ? filter : null }] : cashStreams[filter];
  if (!streams) throw new Error('Filtro de auditoría inválido.');
  const indexes = streams.flatMap(stream => [stream, ...(!orders ? [{ ...stream, iso: true }] : [])]);
  // Each stream has its own continuation. No branch, status or legacy-wide scan is used.
  const perStream = Math.floor(pageSize / indexes.length);
  const results = await Promise.all(indexes.map(async (stream, i) => {
    if (cursor?.[i] === null) return { rows: [], next: null };
    const { field, iso, type, incident } = stream;
    const read = checkedRead(getDocsFromServer, 'reports-audit', signal);
    const snapshot = await read(query(collection(db, name), where('businessId', '==', businessId),
      ...(branchId === 'global' ? [] : [where('branchId', '==', branchId)]),
      ...(orders && lookup ? [where('sourceType', '==', 'contract'), where('sourceId', '==', lookup)] : type ? [where('type', '==', type)] : []),
      where(field, '>=', iso ? start.toISOString() : Timestamp.fromDate(start)),
      where(field, '<=', iso ? end.toISOString() : Timestamp.fromDate(end)), orderBy(field), orderBy(documentId()),
      ...(cursor?.[i] ? [startAfter(cursor[i])] : []), limit(perStream)));
    current();
    if (snapshot.metadata?.fromCache || snapshot.metadata?.hasPendingWrites) throw new Error('La auditoría requiere datos confirmados.');
    const rows = snapshot.docs.map(item => project({ ...item.data(), id: item.id }, field, orders))
      .filter(row => row && (!incident || row.incident));
    return { rows, next: snapshot.size === perStream ? snapshot.docs.at(-1) : null };
  }));
  const rows = results.flatMap(page => page.rows).sort((a, b) => a.when - b.when || a.id.localeCompare(b.id));
  const next = results.map(result => result.next);
  return { rows, next: next.some(Boolean) ? next : null };
}
