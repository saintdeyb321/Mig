import { FieldPath } from 'firebase-admin/firestore';
import { hash, stable } from './contributions.js';
import { accumulateAtom, activeBucket, blankDay, checkBackfillLease, identityOf, monthState, sourceRecord } from './projectionStore.js';
import { checkVector, collections, dayInLima, failReport, groupDays, keyOf, maxProductPages, maxSummaryBytes,
  integrityDay, mergeProducts, monthInLima, productPageSize, rankProducts, schemaVersion, sourceTypes, total, validMonth, validScopePart } from './summaryModel.js';

const PAGE = 100;
const MAX_ANNUAL_INPUT_PAGES = maxProductPages * 3;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export function monthWindow(month) {
  if (!validMonth(month)) throw failReport('report-evidence', 'Mes inválido.');
  const [year, number] = month.split('-').map(Number);
  return { start: new Date(month + '-01T00:00:00-05:00'), end: new Date(Date.UTC(year, number, 1, 5) - 1) };
}
const assertScope = (businessId, periodKey, maxDocuments) => {
  if (!validScopePart(businessId) || ['global', 'platform-admin'].includes(businessId) || !validMonth(periodKey)
    || !Number.isSafeInteger(maxDocuments) || maxDocuments < 1 || maxDocuments > 40000) {
    throw failReport('report-budget', 'Negocio, mes o presupuesto de documentos inválido.');
  }
};

export function projectionFromRecords(businessId, periodKey, entries) {
  const byDay = new Map(), productEvidence = [];
  for (const { atoms } of entries) for (const atom of atoms) {
    if (!atom.day.startsWith(periodKey + '-')) continue;
    const key = identityOf(atom);
    if (!byDay.has(key)) byDay.set(key, blankDay(businessId, atom));
    accumulateAtom(byDay.get(key), atom, 1);
    productEvidence.push(...atom.products);
  }
  return { buckets: [...byDay.values()].sort((a, b) => compare(identityOf(a), identityOf(b))), products: mergeProducts(productEvidence) };
}

export function createConsolidation(database, { documentId = () => FieldPath.documentId(), clock = Date.now } = {}) {
  async function readEvidence({ businessId, periodKey, maxDocuments }, { lease } = {}) {
    assertScope(businessId, periodKey, maxDocuments);
    const { start, end } = monthWindow(periodKey);
    return database.runTransaction(async raw => {
      const budget = { operations: 0, documents: 0, pointReads: 0, byCollection: {} };
      const count = (collection, documents, points = 0) => {
        const scope = budget.byCollection[collection] ??= { documents: 0, pointReads: 0 };
        scope.documents += documents;
        scope.pointReads += points;
        budget.documents += documents;
        budget.pointReads += points;
        if (budget.documents + budget.pointReads > maxDocuments) throw failReport('report-budget', 'Se agotó el presupuesto de origen.');
      };
      const tx = {
        async get(ref) { budget.operations++; count(ref.parent.id, 0, 1); return raw.get(ref); },
        async getAll(...refs) {
          budget.operations++;
          for (const ref of refs) count(ref.parent.id, 0, 1);
          return raw.getAll(...refs);
        },
      };
      await checkBackfillLease(tx, lease, clock);
      const state = await tx.get(monthState(database, businessId, periodKey));
      const through = state.readTime?.toMillis() ?? clock();
      if (through < +start) throw failReport('report-summary-pending', 'El mes todavía no ha comenzado.');
      const hold = await tx.get(database.collection(collections.state).doc(keyOf('hold', businessId)));
      if (hold.exists) throw failReport('report-projection-held', 'La cobertura del negocio está en revisión.');
      const scan = async (scope, query) => {
        const rows = [];
        let cursor;
        do {
          const size = Math.min(PAGE, maxDocuments - budget.documents - budget.pointReads);
          if (size < 1) throw failReport('report-budget', 'Falta una página para verificar el fin del origen.');
          budget.operations++;
          const page = await raw.get((cursor ? query.startAfter(cursor) : query).limit(size));
          count(scope, page.size);
          rows.push(...page.docs);
          if (page.size < size) return rows;
          const next = page.docs.at(-1);
          if (!next || next.id === cursor?.id) throw failReport('report-evidence', 'Cursor de origen sin avance.');
          cursor = next;
        } while (cursor);
        return rows;
      };
      const tenant = source => database.collection(source).where('businessId', '==', businessId);
      const upper = new Date(Math.min(+end, through));
      const range = (source, field, first = start, iso = false) => scan(source, tenant(source)
        .where(field, '>=', iso ? first.toISOString() : first)
        .where(field, '<=', iso ? upper.toISOString() : upper).orderBy(field).orderBy(documentId()));
      const primary = {
        sales: [await range('sales', 'confirmedAt'), await range('sales', 'createdAt'), await range('sales', 'createdAt', start, true)],
        payments: [await range('payments', 'occurredAt')], pos_voids: [await range('pos_voids', 'occurredAt')],
        // Embedded ledger dates can be more recent than their order. There is no safe date predicate on that history.
        contracts: [await scan('contracts', tenant('contracts').orderBy(documentId()))],
        cash_sessions: [],
      };
      for (const field of ['openedAt', 'closedAt']) {
        const first = field === 'openedAt' ? new Date(+start - 14 * 3600000) : start;
        primary.cash_sessions.push(await range('cash_sessions', field, first), await range('cash_sessions', field, first, true));
      }
      const old = await scan(collections.contributions, tenant(collections.contributions).where('months', 'array-contains', periodKey).orderBy(documentId()));
      const previous = new Map(old.map(snap => {
        const row = snap.data();
        return [keyOf(row.source, row.sourceId), row];
      }));
      const entries = [], candidates = [], repairs = [];
      const inMonth = atom => atom.day.startsWith(periodKey + '-');
      for (const source of sourceTypes) {
        const proposed = new Map(primary[source].flat().map(row => [row.id, row]));
        const retained = new Set([...previous.values()].filter(row => row.source === source).map(row => row.sourceId));
        const ids = [...new Set([...proposed.keys(), ...retained])].sort();
        for (const id of ids) {
          const record = await sourceRecord(database, tx, source, id, businessId, through, proposed.get(id));
          if (!record) throw failReport('report-evidence', 'Movimiento desapareció del corte.');
          const atoms = record.atoms.filter(inMonth);
          if (atoms.length) entries.push({ source, id, atoms });
          if (atoms.length || retained.has(id)) {
            candidates.push({ source, id });
            const prior = previous.get(keyOf(source, id));
            if (stable(prior?.atoms.filter(inMonth) ?? []) !== stable(atoms)) repairs.push({ source, id });
          }
        }
      }
      const stored = await scan(collections.days, tenant(collections.days).where('periodKey', '==', periodKey).orderBy(documentId()));
      const seenBranches = await scan('branches', tenant('branches').orderBy(documentId()));
      const branchIds = new Set(seenBranches.map(doc => doc.id));
      const projection = projectionFromRecords(businessId, periodKey, entries);
      if (projection.buckets.some(row => !branchIds.has(row.branchId))) throw failReport('report-evidence', 'Hay movimientos de una sede sin evidencia del negocio.');
      return { ...projection, stored: stored.map(doc => doc.data()),
        branchIds: [...branchIds].sort(), candidates, repairs, epoch: state.data()?.epoch ?? 0, state: state.data(), through,
        budget };
    }, { readOnly: true });
  }

  async function markIncomplete({ businessId, periodKey }, expected, code, lease, checkpoint) {
    return database.runTransaction(async tx => {
      checkpoint.attempts++;
      checkpoint.pointReads += lease ? 2 : 1;
      const ref = monthState(database, businessId, periodKey), current = (await tx.get(ref)).data();
      await checkBackfillLease(tx, lease, clock);
      if ((current?.epoch ?? 0) !== (expected?.epoch ?? 0) || current?.revision !== expected?.revision
        || current?.validUntil !== expected?.validUntil || current?.status !== expected?.status) return false;
      tx.set(ref, { kind: 'month', businessId, periodKey, epoch: expected?.epoch ?? 0, status: 'incomplete', issue: code,
        nextCheckAt: clock() + integrityDay, mode: current?.mode ?? 'automatic' }, { merge: true });
      return true;
    });
  }

  async function consolidate(input, { manual = false, repair = false, lease } = {}) {
    const { businessId, periodKey } = input;
    assertScope(businessId, periodKey, input.maxDocuments);
    const ref = monthState(database, businessId, periodKey);
    const checkpoint = { pointReads: 1, attempts: 0 };
    const initial = (await ref.get()).data();
    let evidence;
    try { evidence = await readEvidence(input, { lease }); }
    catch (error) {
      if (!['report-projection-held', 'report-backfill-lease'].includes(error.code)) await markIncomplete(input, initial, safeIssue(error), lease, checkpoint);
      throw error;
    }
    const { epoch, buckets, products, budget } = evidence;
    const ordered = rows => rows.filter(activeBucket).sort((a, b) => compare(identityOf(a), identityOf(b)));
    if (evidence.repairs.length || stable(ordered(evidence.stored)) !== stable(buckets)) {
      const marked = await markIncomplete(input, evidence.state, 'report-checkpoint-drift', lease, checkpoint);
      if (repair && marked) return { status: 'incomplete', budget, checkpoint, writes: 1, repairs: evidence.repairs, through: evidence.through };
      throw failReport('report-checkpoint-drift', 'La proyección no coincide con el corte de origen.');
    }
    const { end } = monthWindow(periodKey);
    const calculatedThrough = Math.min(+end, evidence.through);
    const allBranches = [...new Set([...evidence.branchIds, ...buckets.map(row => row.branchId)])].sort();
    const facts = buckets.map(({ day, branchId, values }) => ({ day, branchId, values: checkVector(values) }));
    const contentHash = hash([facts, products, allBranches]);
    const checkedAt = clock();
    const mode = manual ? 'manual' : 'automatic';
    const closed = calculatedThrough === +end;
    const sameProjection = evidence.state?.status === 'verified' && evidence.state.mode === mode
      && evidence.state.contentHash === contentHash && evidence.state.closed === closed;
    if (sameProjection && evidence.state.nextCheckAt > checkedAt && evidence.state.validUntil > checkedAt) {
      return { status: 'verified', revision: evidence.state.revision, budget, checkpoint, writes: 0 };
    }
    const recheckAfter = integrityDay * (closed ? (manual ? 7 : 14) : 1);
    const expiresAt = checkedAt + recheckAfter;
    const revision = sameProjection ? evidence.state.revision : hash([epoch, contentHash, evidence.through]);
    const stateId = ref.id, writes = [];
    for (const branchId of ['global', ...allBranches]) {
      if (!validScopePart(branchId)) throw failReport('report-evidence', 'Sede de consolidación inválida.');
      const rows = branchId === 'global' ? facts : facts.filter(row => row.branchId === branchId);
      const selected = branchId === 'global' ? products : products.filter(row => row.branchId === branchId);
      const top = rankProducts(selected), pages = productDocuments({ businessId, branchId, periodKey, revision, stateId, expiresAt }, selected, top);
      const summary = { schemaVersion, businessId, branchId, periodKey, stateId, revision, status: 'verified',
        calculatedThrough, evidenceThrough: evidence.through, closed: calculatedThrough === +end,
        validUntil: expiresAt, mode,
        coverage: { sales: true, legacy: true, ledger: true, voids: true, orders: true, cash: true, products: true },
        sourceProof: { epoch, contentHash, checkedDocuments: budget.documents + budget.pointReads, checkedAt: evidence.through }, values: total(rows), rows, top,
        ...(branchId === 'global' ? { branchIds: allBranches } : {}),
        productPages: pages.length, productCount: selected.length };
      assertDocument(summary);
      writes.push([database.collection(collections.months).doc(keyOf(businessId, branchId, periodKey)), summary],
        ...pages.map(doc => [database.collection(collections.products).doc(keyOf(businessId, branchId, periodKey, doc.page)), doc]));
    }
    if (writes.length >= 399) throw failReport('report-budget', 'El lote mensual excede su presupuesto de publicación.');
    const state = { kind: 'month', businessId, periodKey, epoch, revision, status: 'verified', issue: null, contentHash, validUntil: expiresAt,
      nextCheckAt: expiresAt, closed, mode };
    await database.runTransaction(async tx => {
      checkpoint.attempts++;
      checkpoint.pointReads += lease ? 3 : 2;
      const [latest, hold] = await tx.getAll(ref, database.collection(collections.state).doc(keyOf('hold', businessId)));
      await checkBackfillLease(tx, lease, clock);
      const current = latest.data();
      if (hold.exists || (current?.epoch ?? 0) !== epoch || current?.revision !== evidence.state?.revision
        || current?.validUntil !== evidence.state?.validUntil || current?.status !== evidence.state?.status) {
        throw failReport('report-checkpoint-race', 'El corte cambió durante la consolidación.');
      }
      for (const [target, data] of writes) tx.set(target, data);
      tx.set(ref, state);
    });
    return { status: 'verified', revision, budget, checkpoint, writes: writes.length + 1 };
  }

  async function publishYearProducts({ businessId, year, asOf = clock() }, metrics = { pointReads: 0, checkpoints: 0 }) {
    const now = monthInLima(asOf);
    if (!/^\d{4}$/.test(year) || year > now.slice(0, 4) || !validScopePart(businessId)) throw failReport('report-evidence', 'Año o negocio inválido.');
    const count = year === now.slice(0, 4) ? Number(now.slice(-2)) : 12;
    const months = Array.from({ length: count }, (_, i) => year + '-' + String(i + 1).padStart(2, '0'));
    const states = months.map(month => monthState(database, businessId, month));
    const periodKey = 'year-' + year, ref = monthState(database, businessId, periodKey);
    return database.runTransaction(async tx => {
      metrics.checkpoints += 1 + states.length;
      const [head, ...monthsState] = (await tx.getAll(ref, ...states)).map(doc => doc.data());
      if (monthsState.some(state => state?.status !== 'verified' || state.validUntil <= clock())) {
        throw failReport('report-summary-pending', 'Falta consolidar un mes transcurrido.');
      }
      const revisions = monthsState.map(state => state.revision), revision = hash(revisions);
      const expiresAt = Math.min(...monthsState.map(state => state.validUntil));
      if (head?.status === 'verified' && head.revision === revision && head.validUntil === expiresAt) return { writes: 0 };
      metrics.pointReads += months.length;
      const roots = (await tx.getAll(...months.map(month => database.collection(collections.months).doc(keyOf(businessId, 'global', month)))))
        .map(doc => doc.data());
      if (roots.some((root, i) => root?.revision !== revisions[i] || root.productPages < 1 || root.productPages > maxProductPages
        || (months[i] < now && root.closed !== true))) {
        throw failReport('report-checkpoint-drift', 'Cobertura anual de productos inconsistente.');
      }
      if (roots.reduce((sum, root) => sum + root.productPages, 0) > MAX_ANNUAL_INPUT_PAGES) {
        throw failReport('report-budget', 'El catálogo anual excede el presupuesto de páginas de origen.');
      }
      const inputs = roots.flatMap(root => Array.from({ length: root.productPages }, (_, page) =>
        database.collection(collections.products).doc(keyOf(businessId, 'global', root.periodKey, page))));
      metrics.pointReads += inputs.length;
      const all = (await tx.getAll(...inputs)).map(doc => doc.data());
      const data = [];
      let offset = 0;
      for (const root of roots) {
        const pages = all.slice(offset, offset + root.productPages);
        if (pages.some((page, i) => !page || page.revision !== root.revision || page.page !== i || page.periodKey !== root.periodKey
          || !Array.isArray(page.products)) || pages.reduce((sum, page) => sum + page.products.length, 0) !== root.productCount) {
          throw failReport('report-checkpoint-drift', 'Página de productos incompleta.');
        }
        data.push(...pages.flatMap(page => page.products));
        offset += root.productPages;
      }
      const products = mergeProducts(data);
      const branches = new Set(roots.flatMap(root => [...root.rows.map(row => row.branchId), ...(root.branchIds ?? [])]));
      const writes = [];
      for (const branchId of ['global', ...[...branches].sort()]) {
        const selected = branchId === 'global' ? products : products.filter(row => row.branchId === branchId);
        const pages = productDocuments({ businessId, branchId, periodKey, revision, stateId: ref.id, expiresAt, revisions }, selected, rankProducts(selected));
        for (const page of pages) writes.push([database.collection(collections.products).doc(keyOf(businessId, branchId, periodKey, page.page)), page]);
      }
      if (writes.length >= 399) throw failReport('report-budget', 'El libro anual de productos excede su presupuesto.');
      for (const [target, data] of writes) tx.set(target, data);
      tx.set(ref, { kind: 'year', businessId, periodKey, revision, status: 'verified', validUntil: expiresAt });
      return { writes: writes.length + 1 };
    });
  }
  return { readEvidence, consolidate, publishYearProducts };
}

function assertDocument(record) {
  if (Buffer.byteLength(JSON.stringify(record)) > maxSummaryBytes) throw failReport('report-budget', 'El resumen excede el presupuesto de tamaño.');
}
function productDocuments(scope, products, top) {
  const pageCount = Math.max(1, Math.ceil(products.length / productPageSize));
  if (pageCount > maxProductPages) throw failReport('report-budget', 'El catálogo excede el límite de páginas verificables.');
  return Array.from({ length: pageCount }, (_, page) => {
    const record = { ...scope, schemaVersion, page, pageCount, productCount: products.length,
      products: products.slice(page * productPageSize, (page + 1) * productPageSize), top: page === 0 ? top : [] };
    assertDocument(record);
    return record;
  });
}
const safeIssue = error => ['report-budget', 'report-evidence', 'permission-denied', 'failed-precondition', 'unavailable', 'deadline-exceeded'].includes(error.code)
  ? error.code : 'report-evidence';
