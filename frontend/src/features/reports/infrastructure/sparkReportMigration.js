import * as firestore from 'firebase/firestore';
import { validScopePart, failReport } from '../../../../../functions/src/reports/summaryModel.js';

const sources = ['sales', 'pos_voids', 'payments', 'contracts', 'cash_sessions'];
// This inventories authorized historical sources. Its cursor is progress, never
// a coverage certificate; Rules forbid promoting the pending historical scope.
export function createSparkReportMigration(database, { sdk = firestore, currentUid } = {}) {
  return async ({ uid, businessId, branchId, maxDocuments = 100, pageSize = 25, signal }) => {
    const current = () => { signal?.throwIfAborted();
      if (!uid || currentUid() !== uid) throw new DOMException('La identidad cambió.', 'AbortError'); };
    current();
    if (!validScopePart(businessId) || !validScopePart(branchId) || branchId === 'global'
      || !Number.isInteger(maxDocuments) || maxDocuments < 1 || maxDocuments > 500
      || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw failReport('report-budget', 'Presupuesto de preparación inválido.');
    const branchRef = sdk.doc(database, 'branches', branchId);
    const ref = sdk.doc(database, 'spark_report_migrations_v1', `${businessId}:${branchId}:history`);
    const metrics = { queries: 0, documents: 0, checkpointReads: 0, writes: 0 };
    let checkpoint = await sdk.runTransaction(database, async tx => {
      metrics.checkpointReads += 2;
      const [branch, saved] = await Promise.all([tx.get(branchRef), tx.get(ref)]);
      current();
      if (branch.data()?.businessId !== businessId) throw failReport('permission-denied', 'Sede no autorizada.');
      if (branch.data().reportProtocol !== 1) {
        tx.update(branchRef, { reportProtocol: 1, reportHistory: 'pending', reportSince: sdk.serverTimestamp() });
        metrics.writes++;
      }
      if (saved.exists()) return saved.data();
      const initial = { businessId, branchId, source: sources[0], cursor: null, processed: 0, status: 'pending', updatedAt: sdk.serverTimestamp() };
      tx.set(ref, initial); metrics.writes++;
      return initial;
    });
    while (metrics.documents < maxDocuments && checkpoint.source !== 'complete') {
      current();
      const take = Math.min(pageSize, maxDocuments - metrics.documents), source = checkpoint.source;
      const page = await sdk.getDocsFromServer(sdk.query(sdk.collection(database, source),
        sdk.where('businessId', '==', businessId), sdk.where('branchId', '==', branchId), sdk.orderBy(sdk.documentId()),
        ...(checkpoint.cursor ? [sdk.startAfter(checkpoint.cursor)] : []), sdk.limit(take)));
      current(); metrics.queries++; metrics.documents += page.size;
      if (page.metadata.fromCache || page.metadata.hasPendingWrites) throw failReport('report-integrity', 'La página no se confirmó en el servidor.');
      const next = { ...checkpoint, cursor: page.size === take ? page.docs.at(-1).id : null,
        source: page.size === take ? source : (sources[sources.indexOf(source) + 1] ?? 'complete'),
        processed: checkpoint.processed + page.size, updatedAt: sdk.serverTimestamp(), status: 'pending' };
      await sdk.runTransaction(database, async tx => {
        metrics.checkpointReads++;
        const saved = (await tx.get(ref)).data(); current();
        if (saved.processed !== checkpoint.processed || saved.cursor !== checkpoint.cursor || saved.source !== checkpoint.source) {
          throw failReport('report-migration-race', 'Otra pestaña avanzó la preparación. Reintenta para retomar su cursor.');
        }
        tx.set(ref, next); metrics.writes++;
      });
      checkpoint = next;
    }
    current();
    return { ...checkpoint, metrics, verified: false,
      message: checkpoint.source === 'complete' ? 'Inventario revisado. La cobertura histórica sigue pendiente de certificación.'
        : 'Preparación pausada en el presupuesto. Puedes continuar sin repetir el inventario ya recorrido.' };
  };
}
