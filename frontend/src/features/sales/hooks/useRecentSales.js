import { useCallback } from 'react';
import { useTenantData } from '../../branches/context/TenantContext';
import { subscribeRecentSales } from '../infrastructure/salesRepository';
import { subscribePendingSales } from '../infrastructure/pendingSalesCache';
import { mergeRecentSales, salesHistoryPresentation } from '../application/recentSales';
import { useSharedSubscription, useSessionResources } from '../../../core/session/sessionResourceHooks.js';
import { createSubscriptionScope } from '../../../shared/utils/subscriptionScope';
import { db } from '../../../core/firebase/client.js';
import { createPosVoidReader } from '../infrastructure/posVoidQueryRepository.js';
import { subscribeVoidAttempts } from '../infrastructure/saleTransactions.js';
import { matchesPosVoidReceipt } from '../domain/posVoidReceipt.js';
const compensations = createPosVoidReader(db);

export function useRecentSales(user) {
  const { activeBranchId, identityKey } = useTenantData();
  const businessId = user?.businessId;
  const branchId = user?.role === 'cajero' ? user.branchId : activeBranchId;
  const resources = useSessionResources();
  const verifiedVoids = resources.value(`sales:verified-voids:${identityKey}:${branchId}`, () => new Map());
  const subscribe = useCallback((onData, onError) => {
    const scope = createSubscriptionScope();
    let remote = [];
    let pending = [], unreadable = 0;
    let voidAttempts = [];
    let failure = null;
    let metadata = { fromCache: true };
    let voids = [], voidKey = null, voidRevision = 0, stopVoids = () => {}, voidMetadata = { fromCache: true };
    const fail = scope.guard(error => { failure = error; onError(error); });
    const publish = scope.guard((observedDocumentCount = 0) => {
      if (failure) { onError(failure); return; }
      const byId = new Map(voids.map(row => [row.saleId, row]));
      const attempts = new Map(voidAttempts.map(row => [row.saleId, row]));
      const decorated = remote.map(sale => {
        const receipt = byId.get(sale.id);
        if (matchesPosVoidReceipt(receipt, sale)) {
          if (receipt.serverConfirmed) {
            verifiedVoids.set(sale.id, receipt);
            if (verifiedVoids.size > 100) verifiedVoids.delete(verifiedVoids.keys().next().value);
          }
          return { ...sale, voided: true, voidReason: receipt.reason, posVoid: receipt,
            voidServerConfirmed: verifiedVoids.has(sale.id) };
        }
        const verified = verifiedVoids.get(sale.id);
        if (verified && matchesPosVoidReceipt(verified, sale)) return { ...sale, voided: true, voidReason: verified.reason, posVoid: verified, voidServerConfirmed: true };
        return attempts.has(sale.id) ? { ...sale, voidCheckPending: true, voidAttempt: attempts.get(sale.id) } : sale;
      });
      onData({ ...salesHistoryPresentation(pending, decorated), unreadable }, { ...metadata, fromCache: metadata.fromCache || voidMetadata.fromCache, observedDocumentCount });
    });
    const stopRemote = subscribeRecentSales(businessId, branchId, scope.guard((sales, source) => {
      remote = sales; metadata = source;
      const ids = mergeRecentSales([], remote).filter(sale => sale.atomicProtocol === 2).map(sale => sale.id).sort(), key = JSON.stringify(ids);
      if (key !== voidKey) {
        voidKey = key;
        if (stopVoids.update) { stopVoids.update(ids); publish(source.observedDocumentCount); return; }
        stopVoids(); voids = []; voidMetadata = { fromCache: true };
        const revision = ++voidRevision;
        stopVoids = compensations.subscribeIds(businessId, branchId, ids, scope.guard((rows, meta) => {
          if (revision !== voidRevision) return;
          voids = rows; voidMetadata = meta; publish(meta.observedDocumentCount);
        }), error => { if (revision === voidRevision) fail(error); });
      }
      publish(source.observedDocumentCount);
    }), fail);
    const stopPending = subscribePendingSales(user, branchId, scope.guard((sales, local) => { pending = sales; unreadable = local?.unreadable ?? 0; publish(); }), fail);
    const stopAttempts = branchId ? subscribeVoidAttempts({ ...user, branchId }, scope.guard(rows => {
      voidAttempts = rows; publish();
    }), fail) : () => {};
    return () => { scope.close(); voidRevision++; stopVoids(); stopRemote(); stopPending(); stopAttempts(); };
  }, [businessId, branchId, user, verifiedVoids]);
  const result = useSharedSubscription(`sales:${identityKey}:${branchId}`, subscribe, undefined, { preserveOnError: true });
  return { sales: result.data?.rows ?? [], unreadableLocalCount: result.data?.unreadable ?? 0, localCount: result.data?.localCount ?? 0, rejectedCount: result.data?.rejectedCount ?? 0,
    rejected: result.data?.rejected ?? [], draftCount: result.data?.draftCount ?? 0, getVerifiedVoid: saleId => verifiedVoids.get(saleId),
    uncertainCount: result.data?.uncertainCount ?? 0, isLoading: result.isLoading, error: result.error, retry: result.retry, isStale: result.isStale, updatedAt: result.updatedAt };
}
