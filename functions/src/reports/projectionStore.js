import { hash, legacyPayments, normalizeContribution, stable } from './contributions.js';
import { blank, checkVector, collections, failReport, keyOf, maxSummaryBytes, millis, monthInLima, plus, sourceTypes } from './summaryModel.js';

export const monthState = (database, businessId, month) => database.collection(collections.state).doc(keyOf(businessId, month));
export const markerRef = (database, source, id) => database.collection(collections.contributions).doc(hash([source, id]));
export const identityOf = atom => keyOf(atom.branchId, atom.day);
const group = (map, key, make) => {
  if (!map.has(key)) map.set(key, make());
  return map.get(key);
};

export function accumulateAtom(bucket, atom, sign) {
  bucket.values = plus(bucket.values, atom.values, sign);
  const products = new Map(bucket.products.map(row => [row.id, row]));
  for (const item of atom.products) {
    const prior = products.get(item.id) ?? { id: item.id, qty: 0, cents: 0, events: 0 };
    const [qty, cents, events] = plus([prior.qty, prior.cents, prior.events], [item.qty, item.cents, 1], sign);
    if (events < 0 || (!events && (qty || cents))) throw failReport('report-evidence', 'Marcador de producto inconsistente.');
    if (events) products.set(item.id, { id: item.id, qty, cents, events });
    else products.delete(item.id);
  }
  bucket.products = [...products.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
export const blankDay = (businessId, atom) => ({ businessId, branchId: atom.branchId, day: atom.day,
  periodKey: atom.day.slice(0, 7), values: blank(), products: [] });
export const activeBucket = row => row.values.some(Boolean) || row.products.length > 0;

export async function sourceRecord(database, tx, source, id, scope, through) {
  const snap = await tx.get(database.collection(source).doc(id)), row = snap.data();
  if (!row) return null;
  if (scope && row.businessId !== scope) throw failReport('report-evidence', 'Cambio fuera del negocio pedido.');
  const related = {};
  if (source === 'sales' && row.voided) related.void = (await tx.get(database.collection('pos_voids').doc(id))).data();
  if (source === 'pos_voids') related.sale = (await tx.get(database.collection('sales').doc(id))).data();
  if (source === 'contracts') {
    const legacy = legacyPayments(id, row);
    if (legacy.length > 160) throw failReport('report-evidence', 'Demasiadas divisiones de un pedido histórico.');
    const matches = legacy.length ? await tx.getAll(...legacy.map(payment => database.collection('payments').doc(payment.id))) : [];
    related.legacy = legacy.filter((payment, i) => {
      const existing = matches[i].data();
      if (existing && (existing.businessId !== row.businessId || existing.sourceId !== id)) {
        throw failReport('report-evidence', 'Un ID de ledger histórico pertenece a otro pedido.');
      }
      return !existing && millis(payment.occurredAt) <= through;
    });
  }
  const atoms = normalizeContribution(source, id, row, through, related);
  const sourceTime = snap.updateTime;
  return { businessId: row.businessId, revision: sourceTime ? [sourceTime.seconds, sourceTime.nanoseconds] : [0, 0], atoms, row };
}

export function createProjectionStore(database, { clock = Date.now } = {}) {
  async function sync(source, id, { businessId, month, observedAt } = {}) {
    if (!sourceTypes.includes(source) || typeof id !== 'string' || !id || id.includes('/')) throw failReport('report-evidence', 'Fuente inválida.');
    const through = observedAt ?? clock();
    let attempts = 0, pointReads = 0;
    const result = await database.runTransaction(async raw => {
      attempts++;
      const tx = {
        get(ref) { pointReads++; return raw.get(ref); },
        getAll(...refs) { pointReads += refs.length; return raw.getAll(...refs); },
      };
      const entries = [];
      const primary = await sourceRecord(database, tx, source, id, businessId, through);
      if (!primary) {
        const previous = (await tx.get(markerRef(database, source, id))).data();
        if (!previous) return { writes: 0, changed: false };
        throw failReport('report-source-deleted', 'Falta un movimiento ya acreditado.');
      }
      const tenant = primary.businessId;
      entries.push([source, id, primary]);
      // A new proof can restore a legacy original, and a migrated ledger row supersedes the embedded row.
      if (source === 'pos_voids') {
        const original = primary.row.saleId;
        const paired = await sourceRecord(database, tx, 'sales', original, tenant, through);
        if (paired?.row.voided) entries.push(['sales', original, paired]);
      } else if (source === 'payments' && id.startsWith('legacy_')) {
        const parent = await sourceRecord(database, tx, 'contracts', primary.row.sourceId, tenant, through);
        if (parent) entries.push(['contracts', primary.row.sourceId, parent]);
      }
      if (observedAt != null && entries.some(([, , value]) => value.revision[0] * 1000 + Math.floor(value.revision[1] / 1e6) > through)) {
        throw failReport('report-checkpoint-race', 'Una fuente cambió después del corte.');
      }

      const markers = entries.map(([kind, key]) => markerRef(database, kind, key));
      const previous = await tx.getAll(...markers);
      const changes = [];
      const altered = new Map();
      for (const [i, [kind, key, next]] of entries.entries()) {
        const old = previous[i].data();
        if (old && (old.source !== kind || old.sourceId !== key || old.businessId !== tenant || old.fingerprint !== hash(old.atoms))) {
          throw failReport('report-evidence', 'Marcador de proyección inconsistente.');
        }
        const keep = atom => !month || atom.day.startsWith(month + '-');
        const before = (old?.atoms ?? []).filter(keep), after = next.atoms.filter(keep);
        const all = [...(old?.atoms ?? []).filter(atom => !keep(atom)), ...after];
        if (stable(before) === stable(after)) continue;
        changes.push({ ref: markers[i], body: { businessId: tenant, source: kind, sourceId: key, revision: next.revision, atoms: all,
          months: [...new Set(all.map(atom => atom.day.slice(0, 7)))].sort(), fingerprint: hash(all) } });
        for (const [atoms, sign] of [[before, -1], [after, 1]]) for (const atom of atoms) {
          group(altered, identityOf(atom), () => ({ atom, deltas: [] })).deltas.push({ atom, sign });
        }
      }
      if (!changes.length) return { writes: 0, changed: false };
      const days = [...altered.values()];
      const months = [...new Set(days.map(({ atom }) => atom.day.slice(0, 7)))];
      const bucketRefs = days.map(({ atom }) => database.collection(collections.days).doc(keyOf(tenant, atom.branchId, atom.day)));
      const stateRefs = months.map(key => monthState(database, tenant, key));
      const documents = await tx.getAll(...bucketRefs, ...stateRefs);
      const writes = changes.length + documents.length;
      if (writes > 400) throw failReport('report-budget', 'La transacción supera el presupuesto de la proyección.');
      for (const [i, { atom, deltas }] of days.entries()) {
        const bucket = documents[i].data() ?? blankDay(tenant, atom);
        if (bucket.businessId !== tenant || identityOf(bucket) !== identityOf(atom)) throw failReport('report-evidence', 'Bucket fuera de alcance.');
        for (const delta of deltas) accumulateAtom(bucket, delta.atom, delta.sign);
        checkVector(bucket.values);
        if (Buffer.byteLength(JSON.stringify(bucket)) > maxSummaryBytes) throw failReport('report-budget', 'Bucket diario supera el tamaño permitido.');
        if (activeBucket(bucket)) raw.set(bucketRefs[i], bucket);
        else raw.delete(bucketRefs[i]);
      }
      for (const { ref, body } of changes) raw.set(ref, body);
      for (const [i, periodKey] of months.entries()) {
        const prior = documents[days.length + i].data();
        raw.set(stateRefs[i], { kind: 'month', businessId: tenant, periodKey, status: 'dirty',
          epoch: (prior?.epoch ?? 0) + 1, nextCheckAt: clock(), revision: prior?.revision ?? null,
          mode: prior?.mode ?? (month ? 'manual' : 'automatic') }, { merge: true });
      }
      return { writes, changed: true, periods: months };
    });
    return { ...result, pointReads, attempts };
  }
  // The trusted caller uses before/after only to invalidate on exceptional evidence failures.
  async function quarantine(source, snapshots) {
    const businessId = snapshots.find(Boolean)?.businessId;
    if (!businessId || snapshots.some(row => row && row.businessId !== businessId)) return;
    const fields = { sales: ['confirmedAt', 'createdAt'], pos_voids: ['occurredAt'], payments: ['occurredAt'],
      contracts: ['createdAt', 'voidedAt'], cash_sessions: ['openedAt', 'closedAt', 'expiredAt'] }[source];
    const months = new Set();
    for (const row of snapshots.filter(Boolean)) for (const field of fields) {
      try { if (row[field] != null) months.add(monthInLima(row[field])); } catch { /* Invalid evidence remains quarantined. */ }
    }
    if (source === 'contracts' || !months.size) {
      // A malformed embedded ledger or missing date can affect a month older than the document.
      await database.collection(collections.state).doc(keyOf('hold', businessId)).set({ businessId, blocked: true });
    }
    await Promise.all([...months].map(periodKey => database.runTransaction(async tx => {
      const ref = monthState(database, businessId, periodKey), old = (await tx.get(ref)).data();
      tx.set(ref, { kind: 'month', businessId, periodKey, status: 'incomplete', epoch: (old?.epoch ?? 0) + 1,
        nextCheckAt: clock() + 300000, mode: old?.mode ?? 'automatic' }, { merge: true });
    })));
  }
  return { sync, quarantine };
}
