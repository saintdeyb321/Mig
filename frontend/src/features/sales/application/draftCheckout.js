import { canonicalSale, canonicalNewSale, assertSaleIdentity, SaleError } from '../domain/saleModel.js';
import { decodeQueuedSale, saleFinancialState, hasVerifiedSaleReceipt, isDeterministicSaleError } from '../domain/queueState.js';

// Explicit checkout only. Reconnection never calls confirm, and the original ciphertext is retained.
export function createDraftCheckout({ store, encrypt, decrypt, prepare, apply, verifyReceipt, withLock, currentIdentity }) {
  const active = (identity, isCurrent) => currentIdentity(identity) && isCurrent();
  async function read(id, identity) {
    const record = await store.get(id);
    if (!record || record.userId !== identity.uid || record.businessId !== identity.businessId || record.branchId !== identity.branchId) {
      throw new SaleError('identity-mismatch', 'Selecciona la sede y la cuenta que guardaron este ticket.');
    }
    const sale = canonicalSale(await decodeQueuedSale(record, identity, decrypt));
    assertSaleIdentity(sale, identity);
    return { record, sale };
  }
  async function acknowledge(record, sale, receipt) {
    if (!hasVerifiedSaleReceipt(receipt, sale)) throw new SaleError('receipt-unverified', 'El servidor no acredita este ticket.');
    let localAcknowledgementPending = false;
    try {
      await store.update(record.localId, { status: 'synced', sync: true, financialAck: true, financialState: 'confirmed',
        stockVersions: receipt.stockVersions, syncedAt: receipt.syncedAt, lastError: null, lastErrorCode: null, requiresReceiptReview: false, syncStartedAt: null });
    } catch { localAcknowledgementPending = true; }
    return { success: true, isOffline: false, financialState: 'confirmed', sale: { ...sale, confirmedAt: receipt.syncedAt },
      ...(localAcknowledgementPending ? { localAcknowledgementPending: true } : {}) };
  }
  async function existingReceipt(record, sale, identity, isCurrent) {
    const receipt = await verifyReceipt(sale, identity);
    if (!active(identity, isCurrent)) throw new SaleError('session-changed', 'La cuenta o sede cambió.');
    return acknowledge(record, sale, receipt);
  }
  async function review(id, identity, isCurrent = () => true) {
    if (!active(identity, isCurrent)) throw new SaleError('session-changed', 'La sesión cambió.');
    const { record, sale } = await read(id, identity);
    try { return { alreadyConfirmed: true, result: await existingReceipt(record, sale, identity, isCurrent) }; }
    catch (error) { if (error.code !== 'receipt-not-found') throw error; }
    if (saleFinancialState(record, sale) !== 'draft_offline' || record.attempted || record.submissionData || record.financialAck) {
      throw new SaleError('receipt-unverified', 'Este cobro ya se intentó. Solo se permite verificarlo por su ID original.');
    }
    const prepared = await prepare(sale, identity);
    if (!active(identity, isCurrent)) throw new SaleError('session-changed', 'La cuenta o sede cambió durante la revisión.');
    return { ...prepared, original: sale, originalData: record.data };
  }
  async function confirm(reviewed, payment, identity, isCurrent = () => true) {
    const result = await withLock(async () => {
      if (!active(identity, isCurrent)) throw new SaleError('session-changed', 'La sesión cambió.');
      const { record, sale: original } = await read(reviewed.original.saleId, identity);
      if (record.attempted || record.submissionData || record.financialAck) return existingReceipt(record, original, identity, isCurrent);
      if (saleFinancialState(record, original) !== 'draft_offline' || record.data !== reviewed.originalData) throw new SaleError('sale-conflict', 'El ticket cambió; vuelve a revisarlo.');
      try { return await existingReceipt(record, original, identity, isCurrent); }
      catch (error) { if (error.code !== 'receipt-not-found') throw error; }
      const fresh = await prepare(original, identity);
      if (JSON.stringify(fresh.candidate.items) !== JSON.stringify(reviewed.candidate.items) || fresh.candidate.total !== reviewed.candidate.total
        || fresh.candidate.sessionId !== reviewed.candidate.sessionId) throw new SaleError('price-changed', 'Cambió el catálogo o la caja. Revisa de nuevo el ticket antes de confirmar.');
      const sale = canonicalNewSale({ ...fresh.candidate, payment: payment.payment, amountPaid: payment.amountPaid, change: payment.change,
        ...(payment.payment === 'mixto' ? { splitPayments: payment.splitPayments } : {}), saleId: original.saleId, localId: original.saleId,
        idempotencyKey: original.saleId, businessId: identity.businessId, branchId: identity.branchId, userId: identity.uid, origin: 'online' });
      const submissionData = await encrypt(JSON.stringify(sale), identity.uid);
      if (!active(identity, isCurrent)) throw new SaleError('session-changed', 'La cuenta o sede cambió.');
      await store.update(record.localId, { submissionData, attempted: true, status: 'syncing', sync: false,
        financialState: 'submitted_uncertain', projectionState: 'pending', projectionBase: fresh.projectionBase, syncStartedAt: Date.now() });
      try {
        if (!active(identity, isCurrent)) throw new SaleError('session-changed', 'La cuenta o sede cambió antes del envío.');
        const receipt = await apply(sale, identity);
        if (!active(identity, isCurrent)) throw new SaleError('session-changed', 'La cuenta o sede cambió.');
        if (!hasVerifiedSaleReceipt(receipt, sale)) throw new SaleError('receipt-unverified', 'El resultado requiere comprobación.');
        return await acknowledge(record, sale, receipt);
      } catch (error) {
        const rejected = isDeterministicSaleError(error);
        await store.update(record.localId, { status: rejected ? 'failed' : 'pending', sync: rejected ? 'failed' : false,
          financialState: rejected ? 'rejected' : 'submitted_uncertain', requiresReceiptReview: !rejected,
          ...(rejected ? { projectionState: null } : {}), lastError: error.message, lastErrorCode: error.code, syncStartedAt: null });
        return { success: false, pending: !rejected, rejected, isOffline: true, financialState: rejected ? 'rejected' : 'submitted_uncertain', sale, error };
      }
    });
    if (!result?.sale) throw new SaleError('operation-busy', 'Hay otra operación en curso. Conserva el ticket y vuelve a revisarlo en un momento.');
    return result;
  }
  return { review, confirm };
}
