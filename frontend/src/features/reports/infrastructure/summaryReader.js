import { doc, getDocFromServer } from 'firebase/firestore';
import { checkedRead } from '../../../core/firebase/readDiagnostics.js';
import { collections, expectedMonths, keyOf, schemaVersion, validScopePart, failReport, maxProductPages,
  productPageSize, checkVector, monthInLima, total, rankProducts } from '../../../../../functions/src/reports/summaryModel.js';

const ttl = 30000;
const pending = () => failReport('report-summary-pending', 'Resumen no disponible. Falta verificar o actualizar el período.');
const proofKeys = ['sales', 'legacy', 'ledger', 'voids', 'orders', 'cash', 'products'];
const revisionPattern = /^[a-f0-9]{64}$/;
const rankSignature = rows => JSON.stringify(rows.map(row => [row.name, row.qty, row.cents]));
const validDay = day => typeof day === 'string' && /^\d{4}-\d\d-\d\d$/.test(day)
  && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;

export function createVerifiedSummaryReader(database, { sdk = { doc, getDocFromServer }, now = Date.now, currentUid } = {}) {
  return async function readVerifiedSummary({ resources, uid, identityKey, businessId, branchId, period, revision = 0, includeProducts = false }) {
    const signal = resources.signal;
    const current = () => {
      signal.throwIfAborted();
      if (!uid || !identityKey || currentUid() !== uid) throw new DOMException('Cambió la identidad del reporte.', 'AbortError');
    };
    current();
    if (!validScopePart(businessId) || !validScopePart(branchId)) throw pending();
    const reference = checkedRead(sdk.getDocFromServer, 'report-summaries', signal);
    const read = async (collection, id) => {
      current();
      let snapshot;
      try { snapshot = await reference(sdk.doc(database, collection, id)); }
      catch (error) {
        if (error.code === 'permission-denied' || error.cause?.code === 'permission-denied') throw pending();
        throw error;
      }
      current();
      if (snapshot.metadata?.fromCache || snapshot.metadata?.hasPendingWrites || !snapshot.exists()) throw pending();
      return snapshot.data();
    };
    const asOf = now(), months = expectedMonths(period, asOf);
    const scope = [businessId, branchId, schemaVersion, period.key, identityKey, revision, months.at(-1)];
    const base = await resources.read('report:summary:' + JSON.stringify(scope), async () => {
      const roots = await Promise.all(months.map(month => read(collections.months, keyOf(businessId, branchId, month))));
      roots.forEach((root, i) => {
        try { validateRoot(root, { businessId, branchId, month: months[i], asOf }); }
        catch { throw pending(); }
      });
      const annual = period.filter === 'todo';
      const end = roots.at(-1);
      const productPeriod = annual ? 'year-' + months[0].slice(0, 4) : months[0];
      const manifest = annual ? await read(collections.products, keyOf(businessId, branchId, productPeriod, 0)) : null;
      if (manifest) {
        validateProductPage(manifest, { businessId, branchId, periodKey: productPeriod, page: 0, asOf });
        if (JSON.stringify(manifest.revisions) !== JSON.stringify(roots.map(root => root.revision))) throw pending();
      }
      const expiresAt = Math.min(asOf + ttl, ...roots.map(root => root.validUntil), manifest?.expiresAt ?? Infinity);
      return { businessId, branchId, periodKey: productPeriod, verified: true, loadedAt: asOf, expiresAt, calculatedThrough: end.calculatedThrough,
        evidenceThrough: Math.min(...roots.map(root => root.evidenceThrough)), closed: end.closed && (!annual || months.length === 12),
        mode: end.mode, revisions: roots.map(root => root.revision), rows: roots.flatMap(root => root.rows),
        branchIds: [...new Set(roots.flatMap(root => root.branchIds ?? [root.branchId]))], top: manifest?.top ?? end.top,
        productPages: manifest?.pageCount ?? end.productPages, productCount: manifest?.productCount ?? end.productCount,
        productRevision: manifest?.revision ?? end.revision, manifest };
    }, ttl);
    current();
    if (base.expiresAt <= now()) throw pending();
    if (!includeProducts) return base;
    const products = await resources.read('report:summary-products:' + JSON.stringify([...scope, base.productRevision]), async () => {
      const pages = await Promise.all(Array.from({ length: base.productPages }, (_, page) => page === 0 && base.manifest ? base.manifest
        : read(collections.products, keyOf(businessId, branchId, base.periodKey, page))));
      const items = [];
      for (const [page, value] of pages.entries()) {
        validateProductPage(value, { businessId, branchId, periodKey: base.periodKey, page, asOf });
        if (value.revision !== base.productRevision || value.pageCount !== base.productPages || value.productCount !== base.productCount) throw pending();
        items.push(...value.products);
      }
      if (items.length !== base.productCount || new Set(items.map(row => keyOf(row.branchId, row.id))).size !== items.length
        || rankSignature(rankProducts(items)) !== rankSignature(base.top)) throw pending();
      return items;
    }, ttl);
    current();
    if (base.expiresAt <= now()) throw pending();
    return { ...base, products };
  };
}

function validateRoot(root, { businessId, branchId, month, asOf }) {
  if (root?.schemaVersion !== schemaVersion || root.businessId !== businessId || root.branchId !== branchId || root.periodKey !== month
    || root.status !== 'verified' || !revisionPattern.test(root.revision ?? '') || !proofKeys.every(key => root.coverage?.[key] === true)
    || !Number.isSafeInteger(root.sourceProof?.epoch) || !Number.isSafeInteger(root.sourceProof?.checkedDocuments)
    || root.sourceProof.checkedAt !== root.evidenceThrough || !revisionPattern.test(root.sourceProof.contentHash ?? '')
    || !Number.isSafeInteger(root.evidenceThrough) || !Number.isSafeInteger(root.calculatedThrough)
    || root.calculatedThrough > root.evidenceThrough || root.evidenceThrough > asOf + 60000 || root.validUntil <= asOf
    || !Number.isFinite(root.validUntil) || monthInLima(root.calculatedThrough) !== month || (month < monthInLima(asOf) && root.closed !== true)
    || !Array.isArray(root.rows) || !validProductCount(root.productPages, root.productCount) || !validTop(root.top)) throw pending();
  const keys = new Set();
  for (const row of root.rows) {
    const id = keyOf(row.branchId, row.day);
    if (!validScopePart(row.branchId) || row.branchId === 'global' || (branchId !== 'global' && row.branchId !== branchId)
      || !validDay(row.day) || !row.day.startsWith(month + '-') || keys.has(id)) throw pending();
    keys.add(id);
    checkVector(row.values);
  }
  checkVector(root.values);
  if (total(root.rows).some((value, i) => value !== root.values[i])) throw pending();
}
const validTop = value => Array.isArray(value) && value.length <= 5
  && value.every(row => typeof row.name === 'string' && Number.isSafeInteger(row.qty) && row.qty > 0 && Number.isSafeInteger(row.cents));
const validProductCount = (pages, count) => Number.isSafeInteger(pages) && pages >= 1 && pages <= maxProductPages
  && Number.isSafeInteger(count) && count >= 0 && Math.max(1, Math.ceil(count / productPageSize)) === pages;
function validateProductPage(value, { businessId, branchId, periodKey, page, asOf }) {
  if (value?.schemaVersion !== schemaVersion || value.businessId !== businessId || value.branchId !== branchId
    || value.periodKey !== periodKey || value.page !== page || !revisionPattern.test(value.revision ?? '')
    || !Number.isFinite(value.expiresAt) || value.expiresAt <= asOf || !validProductCount(value.pageCount, value.productCount)
    || !validTop(value.top) || !Array.isArray(value.products) || value.products.length > productPageSize
    || value.products.some(row => !validScopePart(row.branchId) || (branchId !== 'global' && row.branchId !== branchId)
      || typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.first !== 'string' || typeof row.last !== 'string'
      || !Number.isSafeInteger(row.qty) || !Number.isSafeInteger(row.cents))) throw pending();
}

