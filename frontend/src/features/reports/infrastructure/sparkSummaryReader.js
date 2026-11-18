import * as firestore from 'firebase/firestore';
import { blank, checkVector, expectedMonths, failReport, mergeProducts, rankProducts, validScopePart } from '../../../../../functions/src/reports/summaryModel.js';
import { sparkReportCollections } from './sparkReportTransaction.js';

const pending = message => failReport('report-integrity', message);
const millis = value => value?.toMillis?.();
export function createSparkSummaryReader(database, { sdk = firestore, currentUid, now = Date.now } = {}) {
  return async ({ resources, uid, identityKey, businessId, branchId, period, revision = 0, signal: requestSignal }) => {
    const current = () => {
      resources.signal.throwIfAborted(); requestSignal?.throwIfAborted();
      if (!uid || !identityKey || currentUid() !== uid) throw new DOMException('La identidad del informe cambió.', 'AbortError');
    };
    current();
    if (!validScopePart(businessId) || !validScopePart(branchId)) throw pending('Alcance del informe inválido.');
    const asOf = now(), months = expectedMonths(period, asOf);
    const key = JSON.stringify([uid, identityKey, businessId, branchId, period.key, revision, months.at(-1)]);
    const data = await resources.read('report:spark:' + key, async () => sdk.runTransaction(database, async tx => {
      const read = async (name, id) => {
        current();
        const snapshot = await tx.get(sdk.doc(database, name, id));
        current();
        if (snapshot.metadata?.fromCache || snapshot.metadata?.hasPendingWrites) throw pending('Lectura sin confirmación del servidor.');
        return snapshot.exists() ? snapshot.data() : null;
      };
      const license = await read('licenses', businessId);
      const ids = branchId === 'global' ? license?.registeredBranchIds : [branchId];
      if (!Array.isArray(ids) || !ids.length || ids.length > 200 || new Set(ids).size !== ids.length
        || !ids.every(validScopePart) || (branchId === 'global' && license.registeredBranchQuotaVersion !== 1)) {
        throw failReport('report-history-unverified', 'El inventario de sedes requiere revisión antes de certificar el total.');
      }
      const branches = await Promise.all(ids.map(id => read('branches', id)));
      for (const branch of branches) {
        if (!branch || branch.businessId !== businessId) throw pending('La sede no coincide con el negocio.');
        if (branch.reportProtocol !== 1) throw failReport('report-bootstrap-required', 'Preparación inicial de informes pendiente.');
        const since = millis(branch.reportSince), start = new Date(since - 18000000);
        const firstWholeMonth = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1) + 18000000;
        const newBranch = branch.reportHistory === 'new-branch' && since === millis(branch.createdAt);
        if (!Number.isFinite(since) || (!newBranch && (branch.reportHistory !== 'pending' || +period.startDate < firstWholeMonth))) {
          throw failReport('report-history-unverified', 'El histórico está pendiente de certificación. Los movimientos nuevos se agregan automáticamente desde la preparación.');
        }
      }
      const roots = await Promise.all(ids.flatMap((id, i) => months.map(async month => {
        const root = await read(sparkReportCollections.months, `${businessId}:${id}:${month}`);
        // Absence is zero only after the immutable new-branch proof above. Every
        // authorized source write for this branch is bound to this aggregate.
        if (!root) return { rows: [], products: [], through: millis(branches[i].reportSince) };
        if (root.version !== 1 || root.businessId !== businessId || root.branchId !== id || root.period !== month
          || !Number.isFinite(millis(root.updatedAt)) || millis(root.updatedAt) > asOf + 60000
          || !root.rows || Object.keys(root.rows).length > 31 || !root.products || Object.keys(root.products).length > 6000) {
          throw pending('Agregado mensual incompatible o fuera del límite.');
        }
        const rows = Object.entries(root.rows).map(([day, values]) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !day.startsWith(month + '-')
            || new Date(day).toISOString().slice(0, 10) !== day) throw pending('Fecha inválida en el agregado.');
          checkVector(values);
          return { branchId: id, day, values };
        });
        const products = Object.entries(root.products).map(([productId, value]) => {
          if (!Array.isArray(value) || value.length !== 3 || typeof value[0] !== 'string'
            || !Number.isSafeInteger(value[1]) || !Number.isSafeInteger(value[2])) throw pending('Productos sin integridad.');
          return { id: productId, branchId: id, name: value[0], qty: value[1], cents: value[2], first: month, last: month };
        });
        return { rows, products, through: millis(root.updatedAt) };
      })));
      const products = mergeProducts(roots.flatMap(root => root.products));
      return { verified: true, coverage: 'transactional', businessId, branchId, branchIds: ids,
        rows: roots.flatMap(root => root.rows), products, top: rankProducts(products),
        loadedAt: asOf, expiresAt: asOf + 30000, calculatedThrough: Math.max(...roots.map(root => root.through)),
        evidenceThrough: asOf, closed: period.endDate.getTime() < asOf, mode: 'spark-incremental', values: blank() };
    }), 30000);
    current();
    if (data.expiresAt <= now()) throw pending('El corte requiere una nueva lectura del servidor.');
    return data;
  };
}
