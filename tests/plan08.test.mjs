import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createSparkSalesRepository } from '../frontend/src/features/sales/infrastructure/sparkSalesRepository.js';
import { createPosVoidRepository } from '../frontend/src/features/sales/infrastructure/posVoidRepository.js';
import { projectQueuedStock } from '../frontend/src/features/catalog/application/projectQueuedStock.js';
import { createSaleQueue } from '../frontend/src/features/sales/application/saleQueue.js';
import { createDraftCheckout } from '../frontend/src/features/sales/application/draftCheckout.js';
import { createVoidRecovery } from '../frontend/src/features/sales/application/voidRecovery.js';
import { canonicalNewSale, SaleError } from '../frontend/src/features/sales/domain/saleModel.js';
import { decodeQueuedSale, saleFinancialState } from '../frontend/src/features/sales/domain/queueState.js';
import { salesHistoryPresentation } from '../frontend/src/features/sales/application/recentSales.js';
import { calculateCashTotals } from '../functions/src/cash-register/domain/cashTotals.js';
import { voidCashPayments, createPosVoidReader } from '../frontend/src/features/sales/infrastructure/posVoidQueryRepository.js';
import { encrypt, decrypt } from '../frontend/src/crypto.js';
import { generateReceiptHTML } from '../frontend/src/utils/receiptTemplate.js';
import { plan08FinancialHarness, plan08Sale, plan08Identity, plan08MemoryStore } from './helpers/plan08FinancialHarness.mjs';

it('P08 proves exact remote stock/version restitution and reproduces the stale uncertain-sale projection', async () => {
  const h = await plan08FinancialHarness(), sale = plan08Sale('p08-stock-restoration');
  const product = () => h.documents.get('products/p08-product');
  assert.equal(product().stock[plan08Identity.branchId], 1); assert.equal(product().posStockVersion[plan08Identity.branchId], 0);
  await createSparkSalesRepository({}, { sdk: h.sdk, currentUser: h.currentUser }).submit(sale);
  assert.equal(product().stock[plan08Identity.branchId], 0); assert.equal(product().posStockVersion[plan08Identity.branchId], 1);
  const voids = createPosVoidRepository({}, { sdk: h.sdk, currentUser: h.currentUser });
  const command = { saleId: sale.saleId, reason: 'Corrección de simulación aislada', businessId: sale.businessId, branchId: sale.branchId };
  await voids.void(command);
  const receipt = h.documents.get('pos_voids/' + sale.saleId);
  assert.equal(product().stock[sale.branchId], 1); assert.equal(product().posStockVersion[sale.branchId], 2);
  assert.equal(product().posLastVoidSaleId, sale.saleId); assert.equal(receipt.stockVersions['p08-product'], 2);
  const writeCount = h.writes.length;
  await voids.void(command);
  assert.equal(h.writes.length, writeCount); assert.equal(product().stock[sale.branchId], 1);
  const pending = { ...sale, queueStatus: 'pending', attempted: true, financialAck: false,
    projectionBase: { 'p08-product': { stock: 1, version: 0 } } };
  const visible = projectQueuedStock([product()], [pending], sale.businessId, { serverConfirmed: true });
  console.log(JSON.stringify({ stockBefore: 1, versionBefore: 0, stockAfterSale: 0, versionAfterSale: 1, stockAfterVoid: product().stock[sale.branchId],
    versionAfterVoid: product().posStockVersion[sale.branchId], receiptVersion: receipt.stockVersions['p08-product'], visibleStock: visible.products[0].rawStock[sale.branchId] }));
  assert.equal(visible.products[0].rawStock[sale.branchId], 1, 'The authoritative product snapshot is displayed without inventing another credit');
});

it('P08 acknowledges a server-acknowledged void without a redundant receipt/source read and concurrent clicks do not credit twice', async () => {
  const h = await plan08FinancialHarness(), sale = plan08Sale('p08-void-ack');
  await createSparkSalesRepository({}, { sdk: h.sdk, currentUser: h.currentUser }).submit(sale);
  const voids = createPosVoidRepository({}, { sdk: h.sdk, currentUser: h.currentUser });
  const command = { saleId: sale.saleId, reason: 'Error de ticket confirmado', businessId: sale.businessId, branchId: sale.branchId };
  h.state.receiptReadFailure = true;
  let serverReads = 0; h.state.beforeRead = () => { serverReads++; };
  const results = await Promise.all([voids.void(command), voids.void(command)]);
  assert.deepEqual(results.map(row => row.status), ['APPLIED', 'ALREADY_APPLIED']);
  assert.equal(serverReads, 0); assert.ok(results.every(row => row.confirmation === 'server-commit'));
  assert.equal(h.writes.filter(path => path.startsWith('pos_voids/')).length, 1);
  assert.equal(h.documents.get('products/p08-product').stock[sale.branchId], 1);
  assert.equal(h.documents.get('products/p08-product').posStockVersion[sale.branchId], 2);
  await assert.rejects(voids.void({ ...command, reason: 'Un motivo distinto' }), { code: 'sale-conflict' });
});

it('P08 keeps a lost void commit response uncertain until a read-only receipt check, without another stock write', async () => {
  const h = await plan08FinancialHarness(), sale = plan08Sale('p08-void-lost-response');
  await createSparkSalesRepository({}, { sdk: h.sdk, currentUser: h.currentUser }).submit(sale);
  h.state.afterCommitFailure = true; h.state.receiptReadFailure = true;
  const voids = createPosVoidRepository({}, { sdk: h.sdk, currentUser: h.currentUser });
  const command = { saleId: sale.saleId, reason: 'Respuesta de anulación perdida', businessId: sale.businessId, branchId: sale.branchId };
  await assert.rejects(voids.void(command), { code: 'void-unverified' });
  const count = h.writes.length;
  h.state.receiptReadFailure = false; h.state.afterCommitFailure = false;
  assert.equal((await voids.verify(command)).status, 'ALREADY_APPLIED');
  assert.equal(h.writes.length, count);
  assert.equal(h.documents.get('products/p08-product').stock[sale.branchId], 1);
});

it('P08 a verified void stays confirmed when local acknowledgement persistence fails', async () => {
  const h = await plan08FinancialHarness(), sale = plan08Sale('p08-void-local-ack');
  await createSparkSalesRepository({}, { sdk: h.sdk, currentUser: h.currentUser }).submit(sale);
  const rows = new Map(), recovery = createVoidRecovery({ encrypt, decrypt, currentIdentity: () => true,
    repository: createPosVoidRepository({}, { sdk: h.sdk, currentUser: h.currentUser }),
    store: { get: async id => rows.get(id), insert: async row => rows.set(row.id, row),
      update: async () => { throw Error('Local disk unavailable'); }, list: async () => [...rows.values()] } });
  const command = { saleId: sale.saleId, reason: 'Confirmación remota con disco local ocupado' };
  assert.equal((await recovery.submit(command, plan08Identity)).localAcknowledgementPending, true);
  const writes = h.writes.length;
  assert.equal((await recovery.verify(command, plan08Identity)).localAcknowledgementPending, true);
  assert.equal(h.writes.length, writes); assert.equal([...rows.values()][0].status, 'pending');
});

it('P08 compensation listeners preserve authority, reuse unchanged IDs and stop after disposal', () => {
  const callbacks = new Map(), stopped = [], values = [], starts = [];
  const reader = createPosVoidReader({}, { sdk: { where: (...args) => args, doc: (_db, name, id) => ({ name, id }),
    onSnapshot: (ref, _options, callback) => { starts.push(ref.id); callbacks.set(ref.id, callback); return () => { stopped.push(ref.id); }; } } });
  const stop = reader.subscribeIds('p08-tenant', 'p08-branch', ['one', 'one'], (rows, metadata) => values.push({ rows, metadata }), assert.fail);
  const snapshot = (fromCache, id = 'one') => ({ id, exists: () => true, data: () => ({ businessId: 'p08-tenant', branchId: 'p08-branch' }), metadata: { fromCache, hasPendingWrites: false } });
  callbacks.get('one')(snapshot(true)); assert.equal(values.at(-1).rows[0].serverConfirmed, false);
  callbacks.get('one')(snapshot(false)); assert.equal(values.at(-1).rows[0].serverConfirmed, true);
  stop.update(['one', 'two']); assert.deepEqual(starts, ['one', 'two']);
  assert.equal(values.at(-1).rows[0].serverConfirmed, true); assert.equal(values.at(-1).metadata.fromCache, true);
  callbacks.get('two')(snapshot(false, 'two')); assert.equal(values.at(-1).metadata.fromCache, false);
  stop.update(['two']); assert.deepEqual(stopped, ['one']);
  const count = values.length;
  callbacks.get('one')(snapshot(false)); assert.equal(values.length, count);
  stop(); callbacks.get('two')(snapshot(false, 'two')); assert.equal(values.length, count); assert.deepEqual(stopped, ['one', 'two']);
  assert.throws(() => reader.subscribeIds('p08-tenant', 'p08-branch', Array.from({ length: 51 }, (_, i) => 'id' + i), () => {}, assert.fail));
});

async function draftHarness(id) {
  const h = await plan08FinancialHarness(), store = plan08MemoryStore();
  const repository = createSparkSalesRepository({}, { sdk: h.sdk, currentUser: h.currentUser });
  let online = false;
  const queue = createSaleQueue({ store, encrypt, decrypt, withLock: callback => callback(), online: () => online,
    receiptOnlyRetries: true,
    apply: repository.submit, verifyReceipt: repository.verify, syncSessions: async () => { throw Error('No automatic offline cash sync'); },
    currentIdentity: captured => captured.uid === h.actor.uid });
  await queue.submit(plan08Sale(id, { origin: 'offline' }), plan08Identity, { isolated: true });
  const checkout = createDraftCheckout({ store, encrypt, decrypt, prepare: repository.prepareDraft, apply: repository.submit,
    verifyReceipt: repository.verify, withLock: callback => callback(), currentIdentity: captured => captured.uid === h.actor.uid });
  return { ...h, store, queue, checkout, goOnline: () => { online = true; } };
}

it('P08 unsent drafts do not write remotely, reserve stock, or masquerade as printed receipts', async () => {
  const h = await draftHarness('p08-draft-unsent');
  const record = h.store.rows.get('p08-draft-unsent');
  const sale = await decodeQueuedSale(record, plan08Identity, decrypt);
  assert.equal(saleFinancialState(record, sale), 'draft_offline'); assert.equal(record.projectionState, null);
  assert.equal(h.writes.length, 0); assert.equal(h.state.transactions, 0);
  const raw = h.documents.get('products/p08-product');
  const projection = projectQueuedStock([raw], [{ ...sale, queueStatus: 'pending', financialState: 'draft_offline' }], sale.businessId, { serverConfirmed: true });
  assert.equal(projection.products[0].rawStock[sale.branchId], 1);
  h.goOnline(); await h.queue.reconcile(plan08Identity);
  await h.queue.flush(plan08Identity, { onlyId: record.localId, forceId: record.localId });
  assert.equal(h.state.transactions, 0, 'reconnection is read-only');
  assert.match(generateReceiptHTML({ ...sale, isOffline: true, financialState: 'draft_offline' }, {}), /BORRADOR.*SIN COBRAR/);
  const legacy = { ...record, financialState: undefined, attempted: undefined, retries: undefined, lastError: 'No existe recibo', lastErrorCode: 'receipt-not-found' };
  assert.equal(saleFinancialState(legacy, sale), 'draft_offline', 'old never-submitted offline records retain their nonfinancial classification');
  assert.equal(saleFinancialState({ ...legacy, retries: 1 }, sale), 'submitted_uncertain', 'an old attempted write cannot become a new charge');
});

it('P08 Spark queue cannot resubmit an attempted ID when its server receipt is absent', async () => {
  const h = await draftHarness('p08-queue-receipt-only'); h.goOnline();
  const record = h.store.rows.get('p08-queue-receipt-only');
  Object.assign(record, { attempted: true, financialState: 'submitted_uncertain', origin: 'online' });
  await h.queue.flush(plan08Identity, { onlyId: record.localId, forceId: record.localId });
  assert.equal(h.state.transactions, 0); assert.equal(h.writes.length, 0);
  assert.equal(record.status, 'pending'); assert.equal(record.requiresReceiptReview, true); assert.equal(record.lastErrorCode, 'receipt-not-found');
});

it('P08 explicit draft checkout revalidates the current catalogue and own cash, keeps ID and original ciphertext, and charges once', async () => {
  const h = await draftHarness('p08-draft-explicit'), record = h.store.rows.get('p08-draft-explicit');
  const originalCiphertext = record.data;
  h.documents.get('products/p08-product').price = 75;
  h.goOnline();
  const review = await h.checkout.review(record.localId, plan08Identity);
  assert.equal(review.original.total, 70); assert.equal(review.candidate.total, 75); assert.equal(h.writes.length, 0);
  assert.ok(h.reads.length <= 13, 'review reads are bounded, not per-card listeners');
  const payment = { payment: 'efectivo', amountPaid: 75, change: 0 };
  const result = await h.checkout.confirm(review, payment, plan08Identity);
  assert.equal(result.success, true); assert.equal(result.sale.saleId, record.localId); assert.equal(record.data, originalCiphertext);
  assert.equal(JSON.parse(await decrypt(record.data, plan08Identity.uid)).origin, 'offline');
  assert.equal(JSON.parse(await decrypt(record.submissionData, plan08Identity.uid)).origin, 'online');
  assert.equal(h.documents.get('sales/' + record.localId).total, 75);
  const writes = h.writes.length;
  assert.equal((await h.checkout.confirm(review, payment, plan08Identity)).success, true);
  assert.equal(h.writes.length, writes); assert.equal(h.state.transactions, 1);
  assert.equal(h.documents.get('products/p08-product').stock[plan08Identity.branchId], 0);
});

it('P08 stale price, foreign cash, closed cash, changed account and changed branch prevent a draft write', async () => {
  for (const failure of ['price', 'foreign-cash', 'closed-cash', 'account', 'branch']) {
    const h = await draftHarness('p08-draft-block-' + failure); h.goOnline();
    const review = await h.checkout.review('p08-draft-block-' + failure, plan08Identity);
    if (failure === 'price') h.documents.get('products/p08-product').price = 76;
    if (failure === 'foreign-cash') for (const [path, row] of h.documents) if (path.startsWith('active_cash_sessions/')) row.userId = 'another-cashier';
    if (failure === 'closed-cash') h.documents.get('cash_sessions/p08-cash-session').status = 'closed';
    if (failure === 'account') h.actor.uid = 'another-cashier';
    await assert.rejects(h.checkout.confirm(review, { payment: 'efectivo', amountPaid: 70, change: 0 }, plan08Identity, () => failure !== 'branch'));
    assert.equal(h.writes.length, 0); assert.equal(h.store.rows.get(review.original.saleId).attempted, false);
  }
});

it('P08 an uncertain explicit checkout can only recover its existing receipt and never performs a second transaction', async () => {
  const h = await draftHarness('p08-draft-uncertain'); h.goOnline();
  const review = await h.checkout.review('p08-draft-uncertain', plan08Identity);
  h.state.onCommit = () => { h.state.receiptReadFailure = true; };
  const payment = { payment: 'efectivo', amountPaid: 70, change: 0 };
  const result = await h.checkout.confirm(review, payment, plan08Identity);
  assert.equal(result.financialState, 'submitted_uncertain');
  const writes = h.writes.length;
  await assert.rejects(h.checkout.confirm(review, payment, plan08Identity));
  assert.equal(h.writes.length, writes); assert.equal(h.state.transactions, 1);
  h.state.receiptReadFailure = false;
  assert.equal((await h.checkout.confirm(review, payment, plan08Identity)).success, true);
  assert.equal(h.writes.length, writes); assert.equal(h.state.transactions, 1);
});

it('P08 a branch change during durable intent storage prevents sending the reviewed draft', async () => {
  const h = await draftHarness('p08-draft-scope-race'); h.goOnline();
  const review = await h.checkout.review('p08-draft-scope-race', plan08Identity);
  let active = true; const update = h.store.update;
  h.store.update = async (id, changes) => { await update(id, changes); if (changes.submissionData) active = false; };
  const result = await h.checkout.confirm(review, { payment: 'efectivo', amountPaid: 70, change: 0 }, plan08Identity, () => active);
  assert.equal(h.state.transactions, 0); assert.equal(h.writes.length, 0); assert.equal(result.success, false);
  assert.equal(h.store.rows.get(review.original.saleId).financialState, 'submitted_uncertain');
});

it('P08 an occupied cross-tab lease preserves the draft and a failed local acknowledgement cannot duplicate a confirmed checkout', async () => {
  const h = await draftHarness('p08-draft-lease'); h.goOnline();
  const review = await h.checkout.review('p08-draft-lease', plan08Identity);
  const blocked = createDraftCheckout({ store: h.store, encrypt, decrypt, withLock: async () => ({ pending: true }), currentIdentity: () => true });
  await assert.rejects(blocked.confirm(review, {}, plan08Identity), { code: 'operation-busy' });
  assert.equal(h.state.transactions, 0); assert.equal(h.store.rows.get(review.original.saleId).attempted, false);
  const update = h.store.update;
  h.store.update = async (id, changes) => { if (changes.financialAck) throw Error('Local ack unavailable'); return update(id, changes); };
  const payment = { payment: 'efectivo', amountPaid: 70, change: 0 };
  assert.equal((await h.checkout.confirm(review, payment, plan08Identity)).localAcknowledgementPending, true);
  const writes = h.writes.length;
  assert.equal((await h.checkout.confirm(review, payment, plan08Identity)).localAcknowledgementPending, true);
  assert.equal(h.writes.length, writes); assert.equal(h.state.transactions, 1);
});

it('P08 draft checkout keeps strict cents, mixed sums, quantity, total and eight-line limits', async () => {
  for (const changes of [{ amountPaid: 70.001, change: 0.001 }, { amountPaid: 50000.01, change: 49930.01 },
    { payment: 'mixto', splitPayments: { efectivo: 60, yape: 9 } }, { items: [{ ...plan08Sale('x').items[0], qty: 1001 }], total: 70070 },
    { items: Array.from({ length: 9 }, (_, i) => ({ ...plan08Sale('x').items[0], id: 'p08-line-' + i })), total: 630, amountPaid: 630 }]) {
    assert.throws(() => canonicalNewSale({ ...plan08Sale('p08-limits'), ...changes }), SaleError);
  }
});

it('P08 one bounded history includes draft, uncertain and confirmed cards, with rejections in secondary review', () => {
  const local = [{ id: 'draft', financialState: 'draft_offline', queueStatus: 'pending', createdAt: '2026-11-02T18:01:00Z' },
    { id: 'uncertain', financialState: 'submitted_uncertain', queueStatus: 'pending', createdAt: '2026-11-02T18:02:00Z' },
    { id: 'rejected', financialState: 'rejected', queueStatus: 'failed', createdAt: '2026-11-02T18:03:00Z' }];
  const remote = [{ id: 'confirmed', isOffline: false, createdAt: '2026-11-02T18:00:00Z' }];
  const view = salesHistoryPresentation(local, remote);
  assert.deepEqual(view.rows.map(row => row.id), ['uncertain', 'draft', 'confirmed']);
  assert.deepEqual(view.rejected.map(row => row.id), ['rejected']); assert.equal(view.draftCount, 1);
  assert.equal(salesHistoryPresentation([{ ...local[1], id: 'confirmed' }], remote).rows.length, 1);
});

it('P08 zero-difference cash with compensations stays provisional, counts each ticket once and preserves the original amounts', () => {
  const source = { id: 'p08-cash-void', saleId: 'p08-cash-void', authority: 'pos-compensation', cashAmount: -106.30, digitalAmount: 0 };
  const payments = voidCashPayments([source, source]);
  const totals = calculateCashTotals({ openingAmount: 11 }, [{ total: 106.30, payment: 'efectivo' }], payments);
  assert.equal(totals.expectedCash, 11); assert.equal(totals.posCash, 106.30); assert.equal(totals.posCompensationCash, -106.30);
  assert.equal(totals.posCompensationCount, 1); assert.equal(totals.hasUnverifiedDisbursements, true);
  const negative = calculateCashTotals({ openingAmount: 0 }, [], voidCashPayments([{ ...source, cashAmount: -9 }]));
  assert.equal(negative.expectedCash, -9); assert.equal(negative.hasUnverifiedDisbursements, true);
});
