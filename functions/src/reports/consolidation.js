import { FieldPath } from 'firebase-admin/firestore';
import { hash, stable } from './contributions.js';
import { accumulateAtom, activeBucket, blankDay, identityOf, monthState, sourceRecord } from './projectionStore.js';
import { checkVector, collections, dayInLima, failReport, groupDays, keyOf, maxProductPages, maxSummaryBytes,
  mergeProducts, monthInLima, productPageSize, rankProducts, schemaVersion, sourceTypes, total, validMonth, validScopePart } from './summaryModel.js';

const PAGE = 100;
const MANUAL_LEASE = 86400000;
const AUTO_RECHECK = 15 * 60000;
const AUTO_LEASE = 60 * 60000;
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
  async function readEvidence({ businessId, periodKey, maxDocuments }) {
    assertScope(businessId, periodKey, maxDocuments);
    const { start, end } = monthWindow(periodKey);
    return database.runTransaction(async raw => {
      const budget = { operations: 0, documents: 0, pointReads: 0 };
      const count = (operation, documents, points = 0) => {
        budget.operations += operation;
        budget.documents += documents;
        budget.pointReads += points;
        if (budget.documents + budget.pointReads > maxDocuments) throw failReport('report-budget', 'Se agotó el presupuesto de origen.');
      };
      const tx = {
        async get(ref) { count(1, 0, 1); return raw.get(ref); },
        async getAll(...refs) { count(1, 0, refs.length); return raw.getAll(...refs); },
      };
      const state = await tx.get(monthState(database, businessId, periodKey));
      const through = state.readTime?.toMillis() ?? clock();
      if (through < +start) throw failReport('report-summary-pending', 'El mes todavía no ha comenzado.');
      const scan = async query => {
        const rows = [];
        let cursor;
        do {
          const size = Math.min(PAGE, maxDocuments - budget.documents - budget.pointReads);
          if (size < 1) throw failReport('report-budget', 'Falta una página para verificar el fin del origen.');
          const page = await raw.get((cursor ? query.startAfter(cursor) : query).limit(size));
          count(1, page.size);
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
      const range = (source, field, first = start, iso = false) => scan(tenant(source)
        .where(field, '>=', iso ? first.toISOString() : first)
        .where(field, '<=', iso ? upper.toISOString() : upper).orderBy(field).orderBy(documentId()));
      const primary = {
        sales: await Promise.all([range('sales', 'confirmedAt'), range('sales', 'createdAt'), range('sales', 'createdAt', start, true)]),
        payments: [await range('payments', 'occurredAt')], pos_voids: [await range('pos_voids', 'occurredAt')],
        // Embedded ledger dates can be more recent than their order. There is no safe date predicate on that history.
        contracts: [await scan(tenant('contracts').orderBy(documentId()))],
        cash_sessions: await Promise.all(['openedAt', 'closedAt'].flatMap(field => {
          const first = field === 'openedAt' ? new Date(+start - 14 * 3600000) : start;
          return [range('cash_sessions', field, first), range('cash_sessions', field, first, true)];
        })),
      };
      const old = await scan(tenant(collections.contributions).where('months', 'array-contains', periodKey).orderBy(documentId()));
      const previous = old.map(snap => snap.data());
      const entries = [], candidates = [];
      for (const source of sourceTypes) {
        const proposed = primary[source].flat().map(row => row.id);
        const retained = new Set(previous.filter(row => row.source === source).map(row => row.sourceId));
        const ids = [...new Set([...proposed, ...retained])].sort();
        for (const id of ids) {
          const record = await sourceRecord(database, tx, source, id, businessId, through);
          if (!record) throw failReport('report-evidence', 'Movimiento desapareció del corte.');
          const participates = record.atoms.some(atom => atom.day.startsWith(periodKey + '-'));
          if (participates) entries.push({ source, id, atoms: record.atoms });
          if (participates || retained.has(id)) candidates.push({ source, id });
        }
      }
      const stored = await scan(tenant(collections.days).where('periodKey', '==', periodKey).orderBy(documentId()));
      const seenBranches = await scan(tenant('branches').orderBy(documentId()));
      const branchIds = new Set(seenBranches.map(doc => doc.id));
      const projection = projectionFromRecords(businessId, periodKey, entries);
      if (projection.buckets.some(row => !branchIds.has(row.branchId))) throw failReport('report-evidence', 'Hay movimientos de una sede sin evidencia del negocio.');
      const hold = await tx.get(database.collection(collections.state).doc(keyOf('hold', businessId)));
      return { ...projection, stored: stored.map(doc => doc.data()),
        branchIds: [...branchIds].sort(), candidates, epoch: state.data()?.epoch ?? 0, state: state.data(), through,
        blocked: hold.data()?.blocked === true, budget };
    }, { readOnly: true });
  }

  async function markIncomplete({ businessId, periodKey }, epoch, code) {
    return database.runTransaction(async tx => {
      const ref = monthState(database, businessId, periodKey), current = (await tx.get(ref)).data();
      if ((current?.epoch ?? 0) !== epoch) return false;
      tx.set(ref, { kind: 'month', businessId, periodKey, epoch, status: 'incomplete', issue: code,
        nextCheckAt: clock() + AUTO_RECHECK, mode: current?.mode ?? 'automatic' }, { merge: true });
      return true;
    });
  }

  async function consolidate(input, { manual = false } = {}) {
    const { businessId, periodKey } = input;
    assertScope(businessId, periodKey, input.maxDocuments);
    const ref = monthState(database, businessId, periodKey);
    const initial = (await ref.get()).data();
    let evidence;
    try { evidence = await readEvidence(input); }
    catch (error) {
      await markIncomplete(input, initial?.epoch ?? 0, safeIssue(error));
      throw error;
    }
    if (evidence.blocked) throw failReport('report-evidence', 'La cobertura del negocio está en revisión.');
    const { epoch, buckets, products, budget } = evidence;
    const ordered = rows => rows.filter(activeBucket).sort((a, b) => compare(identityOf(a), identityOf(b)));
    if (stable(ordered(evidence.stored)) !== stable(buckets)) {
      await markIncomplete(input, epoch, 'report-checkpoint-drift');
      throw failReport('report-checkpoint-drift', 'La proyección no coincide con el corte de origen.');
    }
    const { end } = monthWindow(periodKey);
    const calculatedThrough = Math.min(+end, evidence.through);
    const allBranches = [...new Set([...evidence.branchIds, ...buckets.map(row => row.branchId)])].sort();
    const facts = buckets.map(({ day, branchId, values }) => ({ day, branchId, values: checkVector(values) }));
    const contentHash = hash([facts, products, allBranches]);
    const checkedAt = clock();
    const mode = manual ? 'manual' : 'automatic';
    if (evidence.state?.status === 'verified' && evidence.state.mode === mode && evidence.state.contentHash === contentHash
      && evidence.state.nextCheckAt > checkedAt && evidence.state.validUntil > checkedAt) {
      return { status: 'verified', revision: evidence.state.revision, budget, writes: 0 };
    }
    const closed = calculatedThrough === +end;
    const recheckAfter = manual ? MANUAL_LEASE * (closed ? 7 : 1) : closed ? MANUAL_LEASE : AUTO_RECHECK;
    const expiresAt = checkedAt + (manual ? recheckAfter : closed ? 2 * MANUAL_LEASE : AUTO_LEASE);
    const revision = hash([epoch, contentHash, evidence.through]);
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
      nextCheckAt: checkedAt + recheckAfter, mode };
    await database.runTransaction(async tx => {
      const [latest, hold] = await tx.getAll(ref, database.collection(collections.state).doc(keyOf('hold', businessId)));
      const current = latest.data();
      if (hold.data()?.blocked || (current?.epoch ?? 0) !== epoch || (current?.revision ?? null) !== (evidence.state?.revision ?? null)) {
        throw failReport('report-checkpoint-race', 'El corte cambió durante la consolidación.');
      }
      for (const [target, data] of writes) tx.set(target, data);
      tx.set(ref, state);
    });
    return { status: 'verified', revision, budget, writes: writes.length + 1 };
  }

  async function publishYearProducts({ businessId, year, asOf = clock() }) {
    const now = monthInLima(asOf);
    if (!/^\d{4}$/.test(year) || year > now.slice(0, 4) || !validScopePart(businessId)) throw failReport('report-evidence', 'Año o negocio inválido.');
    const count = year === now.slice(0, 4) ? Number(now.slice(-2)) : 12;
    const months = Array.from({ length: count }, (_, i) => year + '-' + String(i + 1).padStart(2, '0'));
    const states = months.map(month => monthState(database, businessId, month));
    const periodKey = 'year-' + year, ref = monthState(database, businessId, periodKey);
    return database.runTransaction(async tx => {
      const [head, ...monthsState] = (await tx.getAll(ref, ...states)).map(doc => doc.data());
      if (monthsState.some(state => state?.status !== 'verified' || state.validUntil <= clock())) {
        throw failReport('report-summary-pending', 'Falta consolidar un mes transcurrido.');
      }
      const revisions = monthsState.map(state => state.revision), revision = hash(revisions);
      if (head?.status === 'verified' && head.revision === revision) return { writes: 0 };
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
      const expiresAt = Math.min(...monthsState.map(state => state.validUntil));
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
