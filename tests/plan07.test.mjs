import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createSaleQueue } from '../frontend/src/features/sales/application/saleQueue.js';
import { createVoidRecovery, voidIntentPrefix } from '../frontend/src/features/sales/application/voidRecovery.js';
import { createSparkSalesRepository } from '../frontend/src/features/sales/infrastructure/sparkSalesRepository.js';
import { createPosVoidRepository } from '../frontend/src/features/sales/infrastructure/posVoidRepository.js';
import { createCashAvailabilityWatcher } from '../frontend/src/features/cash-register/infrastructure/cashQueryRepository.js';
import { createNotificationRepository, projectFinancialNotice } from '../frontend/src/features/notifications/infrastructure/notificationQueryRepository.js';
import { voidCashPayments } from '../frontend/src/features/sales/infrastructure/posVoidQueryRepository.js';
import { calculateCashTotals } from '../functions/src/cash-register/domain/cashTotals.js';
import { canonicalSale } from '../frontend/src/features/sales/domain/saleModel.js';
import { cartCatalogChanges, acceptCartCatalogChange, canAddDistinctProduct } from '../frontend/src/features/sales/domain/cartCatalog.js';
import { checkoutBlockReason } from '../frontend/src/features/sales/domain/checkoutPolicy.js';
import { aggregateReport } from '../frontend/src/features/reports/domain/reportTotals.js';
import { encrypt, decrypt } from '../frontend/src/crypto.js';
import { startReceiptRecovery } from '../frontend/src/features/sales/application/receiptRecovery.js';

const identity = { uid: 'cashier', businessId: 'tenant', branchId: 'branch' };
const product = { id: 'bread', businessId: 'tenant', name: 'Pan', category: '', price: 3.33, cost: 1, status: 'activo', stock: { branch: 100 } };
const sale = id => canonicalSale({ localId: id, userId: identity.uid, businessId: identity.businessId, branchId: identity.branchId,
  sessionId: 'session', items: [{ ...product, qty: 10 }], total: 33.3, payment: 'efectivo', amountPaid: 33.3, change: 0, createdAt: '2026-11-02T12:00:00.000Z' });
const timestamp = () => ({ toDate: () => new Date('2026-11-02T12:00:01.000Z') });
const unavailable = () => Object.assign(new Error('Lost network response'), { code: 'unavailable' });
function memoryStore() {
  const rows = new Map();
  return { rows, get: async id => rows.get(id), put: async row => rows.set(row.id, { ...row }),
    insert: async row => { const id = row.localId ?? row.id; if (rows.has(id)) throw Object.assign(Error('Duplicate ID'), { name: 'ConstraintError' }); rows.set(id, { ...row }); },
    list: async prefix => [...rows.values()].filter(row => !prefix || row.id.startsWith(prefix)),
    update: async (id, changes) => Object.assign(rows.get(id), changes) };
}
function financialSDK() {
  const rows = new Map([['products/bread', product]]);
  const state = { writes: 0, transactions: 0, failBeforeCommit: false, failReceipt: false, failAfterCommit: false, afterRead: () => {} };
  const snapshot = ref => ({ ref, metadata: { fromCache: false, hasPendingWrites: false }, exists: () => rows.has(ref.path), data: () => rows.get(ref.path) });
  const sdk = {
    doc: (_db, name, id) => ({ path: `${name}/${id}` }), serverTimestamp: timestamp,
    getDocFromServer: async ref => {
      if (state.failReceipt && /^(sales|pos_voids)\//.test(ref.path)) throw unavailable();
      const result = snapshot(ref); state.afterRead(ref); return result;
    },
    runTransaction: async (_db, work) => {
      state.transactions++;
      if (state.failBeforeCommit) throw unavailable();
      const changes = [];
      await work({ get: async ref => snapshot(ref), set: (ref, data) => changes.push([ref, data]), update: (ref, data) => changes.push([ref, { ...rows.get(ref.path), ...data }]) });
      for (const [ref, data] of changes) { rows.set(ref.path, data); state.writes++; }
      if (state.failAfterCommit) throw unavailable();
    },
  };
  return { sdk, rows, state };
}
function queueHarness(remote, store = memoryStore()) {
  let uid = identity.uid;
  const repository = createSparkSalesRepository({}, { sdk: remote.sdk, currentUser: () => ({ uid }) });
  const queue = createSaleQueue({ store, encrypt, decrypt, apply: repository.submit, verifyReceipt: repository.verify,
    syncSessions: async () => new Map(), withLock: work => work(), online: () => true,
    currentIdentity: captured => captured.uid === uid });
  return { queue, store, changeUser: value => { uid = value; } };
}

it('Plan07 recovers a lost post-commit receipt by server reads without recharging or changing ciphertext', async () => {
  for (const failAfterCommit of [false, true]) {
    const remote = financialSDK(), { queue, store } = queueHarness(remote);
    remote.state.failReceipt = true; remote.state.failAfterCommit = failAfterCommit;
    const input = sale(`lost-receipt-${failAfterCommit}`), result = await queue.submit(input, identity, { isolated: true });
    assert.equal(result.pending, true); assert.equal(remote.rows.get('products/bread').stock.branch, 90);
    const originalCiphertext = store.rows.get(input.saleId).data, writes = remote.state.writes;
    remote.state.failReceipt = false;
    assert.equal((await queue.reconcile(identity))[0].state, 'confirmed');
    assert.deepEqual(await queue.reconcile(identity), []);
    assert.equal(store.rows.get(input.saleId).status, 'synced'); assert.equal(store.rows.get(input.saleId).financialAck, true);
    assert.equal(store.rows.get(input.saleId).data, originalCiphertext); assert.deepEqual(store.rows.get(input.saleId).stockVersions, { bread: 1 });
    assert.equal(remote.state.transactions, 1); assert.equal(remote.state.writes, writes);
  }
});

it('Plan07 preserves an absent receipt after a pre-commit outage and never retries the write', async () => {
  const remote = financialSDK(), { queue, store } = queueHarness(remote), input = sale('before-commit');
  remote.state.failBeforeCommit = true;
  await queue.submit(input, identity, { isolated: true });
  for (let i = 0; i < 3; i++) assert.equal((await queue.reconcile(identity))[0].state, 'unconfirmed');
  assert.equal(remote.state.transactions, 1); assert.equal(remote.state.writes, 0);
  assert.equal(store.rows.get(input.saleId).requiresReceiptReview, true); assert.equal(store.rows.get(input.saleId).financialAck, undefined);
});

it('Plan07 recovers a failed durable acknowledgement and ignores foreign identities, branches and changed accounts', async () => {
  const remote = financialSDK(), store = memoryStore(), originalUpdate = store.update;
  let failAck = true;
  store.update = async (id, changes) => { if (changes.status === 'synced' && failAck) { failAck = false; throw Error('IDB acknowledgement interrupted'); } return originalUpdate(id, changes); };
  const { queue, changeUser } = queueHarness(remote, store), input = sale('lost-local-ack');
  await queue.submit(input, identity, { isolated: true });
  assert.equal(store.rows.get(input.saleId).financialAck, true);
  assert.deepEqual(await queue.reconcile({ ...identity, branchId: 'other' }), []);
  assert.deepEqual(await queue.reconcile({ ...identity, uid: 'other' }), []);
  remote.state.afterRead = () => changeUser('other');
  assert.deepEqual(await queue.reconcile(identity), []); assert.equal(store.rows.get(input.saleId).status, 'pending');
  changeUser(identity.uid); remote.state.afterRead = () => {};
  assert.equal((await queue.reconcile(identity))[0].state, 'confirmed'); assert.equal(remote.state.transactions, 1);
});

it('Plan07 keeps uncertain and conflicting receipts for review, bounds recovery and cancels a branch change', async () => {
  const remote = financialSDK(), { queue, store } = queueHarness(remote);
  remote.state.failReceipt = true;
  for (let i = 0; i < 11; i++) await queue.enqueue(sale(`bounded-${i}`), identity);
  for (const row of store.rows.values()) row.attempted = true;
  const first = await queue.reconcile(identity);
  assert.equal(first.length, 10);
  const second = await queue.reconcile(identity);
  assert.ok(second.some(row => !first.some(previous => previous.saleId === row.saleId)), 'bounded cycles do not starve the eleventh receipt');
  let current = true;
  remote.state.failReceipt = false; remote.state.afterRead = () => { current = false; };
  assert.deepEqual(await queue.reconcile(identity, { isCurrent: () => current }), []);
  assert.ok([...store.rows.values()].every(row => row.status === 'pending'));
});

it('Plan07 schedules only three read-only recovery attempts per connection and cancels on scope cleanup', async () => {
  const events = new EventTarget(), timers = new Map();
  let counter = 0, reads = 0, active = true;
  const recovery = startReceiptRecovery({ events, isCurrent: () => active,
    schedule: callback => { const id = ++counter; timers.set(id, callback); return id; }, cancel: id => timers.delete(id),
    verify: async current => { if (current()) reads++; } });
  assert.equal(timers.size, 3);
  for (const [id, callback] of [...timers]) { timers.delete(id); await callback(); }
  assert.equal(reads, 3); assert.equal(timers.size, 0);
  events.dispatchEvent(new Event('online')); assert.equal(timers.size, 3);
  active = false;
  for (const [id, callback] of [...timers]) { timers.delete(id); await callback(); }
  assert.equal(reads, 3);
  recovery.stop(); events.dispatchEvent(new Event('online')); assert.equal(timers.size, 0);
});

it('P18 coalesces reconnect during a slow receipt read and invalidates the prior network generation', async () => {
  const events = new EventTarget(), timers = new Map();
  let id = 0, online = true, reads = 0, release, currentCheck;
  const recovery = startReceiptRecovery({ events, online: () => online, isCurrent: () => true,
    schedule: callback => { timers.set(++id, callback); return id; }, cancel: timer => timers.delete(timer),
    async verify(isCurrent) { reads++; currentCheck = isCurrent; if (reads === 1) await new Promise(resolve => { release = resolve; }); },
  });
  const [firstId, first] = [...timers][0];
  timers.delete(firstId);
  const inFlight = first();
  online = false; events.dispatchEvent(new Event('offline'));
  assert.equal(currentCheck(), false);
  online = true;
  for (let index = 0; index < 5; index++) events.dispatchEvent(new Event('online'));
  assert.equal(timers.size, 0);
  release(); await inFlight;
  assert.equal(timers.size, 3);
  for (const [timer, callback] of [...timers]) { timers.delete(timer); await callback(); }
  assert.equal(reads, 4);
  recovery.stop();
});

it('Plan07 keeps a definitively rejected void retryable only by an explicit action after verifying absence', async () => {
  const store = memoryStore(); let writes = 0, absentChecks = 0;
  const recovery = createVoidRecovery({ store, encrypt, decrypt, currentIdentity: () => true, repository: {
    void: async () => { writes++; if (writes === 1) throw Object.assign(Error('Open your cash'), { code: 'invalid-session' }); return { status: 'APPLIED' }; },
    verify: async () => { absentChecks++; throw Object.assign(Error('No receipt'), { code: 'receipt-not-found' }); },
  } });
  const command = { saleId: 'rejected-void', reason: 'Motivo original conservado' };
  await assert.rejects(recovery.submit(command, identity), { code: 'invalid-session' });
  const ciphertext = [...store.rows.values()][0].data;
  assert.equal([...store.rows.values()][0].status, 'rejected');
  assert.equal((await recovery.submit(command, identity)).status, 'APPLIED');
  assert.equal(absentChecks, 1); assert.equal(writes, 2); assert.equal([...store.rows.values()][0].data, ciphertext);
});

it('Plan07 verifies an applied void after a lost read without a second compensation or stock credit', async () => {
  const remote = financialSDK(), input = sale('void-ack');
  const original = { ...input, atomicProtocol: 2, status: 'confirmed', confirmedAt: timestamp() };
  remote.rows.set('sales/' + input.saleId, original);
  remote.rows.set('users/cashier', { role: 'cajero', status: 'activo', businessId: 'tenant', branchId: 'branch' });
  const { cashLockId } = await import('../frontend/src/features/cash-register/infrastructure/sparkCashRepository.js');
  remote.rows.set('active_cash_sessions/' + await cashLockId('tenant', 'branch'), { ...identity, userId: identity.uid, sessionId: 'current-session', status: 'open', runtime: 'spark' });
  const repository = createPosVoidRepository({}, { sdk: remote.sdk, currentUser: () => ({ uid: identity.uid }) });
  const store = memoryStore(), recovery = createVoidRecovery({ store, encrypt, decrypt, repository, currentIdentity: () => true });
  const command = { saleId: input.saleId, reason: 'Error confirmado de ticket' };
  remote.state.failReceipt = true;
  remote.state.failAfterCommit = true;
  await assert.rejects(recovery.submit(command, identity), { code: 'void-unverified' });
  const writes = remote.state.writes, stock = remote.rows.get('products/bread').stock.branch;
  const ciphertext = [...store.rows.values()][0].data;
  remote.state.failReceipt = false;
  remote.state.failAfterCommit = false;
  assert.equal((await recovery.verify(command, identity)).status, 'ALREADY_APPLIED');
  assert.equal((await recovery.submit(command, identity)).status, 'ALREADY_APPLIED');
  assert.equal(remote.state.transactions, 1); assert.equal(remote.state.writes, writes); assert.equal(remote.rows.get('products/bread').stock.branch, stock);
  assert.equal([...store.rows.values()][0].data, ciphertext); assert.equal([...store.rows.values()][0].status, 'confirmed');
  await assert.rejects(recovery.verify(command, { ...identity, branchId: 'foreign' }), { code: 'session-changed' });
  await assert.rejects(recovery.verify(command, identity, () => false), { code: 'session-changed' });
  await store.insert({ id: voidIntentPrefix(identity) + 'unreadable', saleId: 'unreadable', status: 'pending', data: 'invalid-ciphertext' });
  assert.equal((await recovery.list(identity)).find(row => row.saleId === 'unreadable').localState, 'unreadable');
  assert.equal((await recovery.list(identity)).find(row => row.saleId === input.saleId).localState, 'confirmed');
  assert.equal(remote.state.writes, writes);
});

it('Plan07 separates current/prior-session POS compensation from contract receipts and preserves negative estimates', () => {
  for (const payment of ['efectivo', 'yape', 'mixto']) {
    const original = { ...sale('cash-' + payment), total: 20, payment, ...(payment === 'mixto' ? { splitPayments: { efectivo: 9, yape: 11 } } : {}) };
    const cash = payment === 'efectivo' ? 20 : payment === 'mixto' ? 9 : 0;
    for (const sessionId of ['current-session', 'prior-session']) {
      const voids = [{ id: original.saleId, saleId: original.saleId, sourceSessionId: sessionId, sessionId: 'current-session', authority: 'pos-compensation',
        cashAmount: -cash, digitalAmount: -(20 - cash), amount: -20 }];
      const payments = voidCashPayments(voids);
      const totals = calculateCashTotals({ openingAmount: 0 }, [], [...payments, ...payments]);
      assert.equal(totals.contractCash, 0); assert.equal(totals.posCompensationCash, -cash || 0); assert.equal(totals.posCompensationDigital, -(20 - cash) || 0);
      assert.equal(totals.expectedCash, -cash || 0); assert.equal(totals.hasUnverifiedDisbursements, true);
      assert.ok(payments.every(row => row.physicalDisbursementVerified === false));
    }
  }
});

it('Plan07 detects price/cost/status changes, requires explicit acceptance and keeps the safe eight-product cart bound', async () => {
  const cart = [{ ...product, qty: 1 }], changed = { ...product, price: 6, cost: 2 };
  assert.equal(cartCatalogChanges(cart, [changed], 'branch').bread.type, 'changed');
  assert.equal(cart[0].price, 3.33);
  assert.equal(acceptCartCatalogChange(cart, 'bread', [changed])[0].price, 6);
  assert.equal(cartCatalogChanges(cart, [{ ...changed, status: 'inactivo' }], 'branch').bread.type, 'unavailable');
  assert.equal(cartCatalogChanges(cart, [], 'branch').bread.type, 'unavailable');
  const items = Array.from({ length: 16 }, (_, i) => ({ ...product, id: `p${i}`, qty: 1 }));
  assert.equal(canAddDistinctProduct(items.slice(0, 8), 'p8'), false);
  assert.equal(canAddDistinctProduct(items.slice(0, 8), 'p0'), true);
  assert.equal(checkoutBlockReason(items.slice(0, 8)), null);
  for (const count of [9, 12, 15, 16]) {
    const draft = canonicalSale({ ...sale('blocked-' + count), items: items.slice(0, count), total: Math.round(count * 333) / 100, amountPaid: Math.round(count * 333) / 100 });
    let transactions = 0;
    const repository = createSparkSalesRepository({}, { currentUser: () => ({ uid: identity.uid }), sdk: { runTransaction: () => transactions++ } });
    await assert.rejects(repository.submit(draft), { code: 'invalid-sale' }); assert.equal(transactions, 0);
  }
});

it('Plan07 observes lock acquisition and release symmetrically, shares one listener and ignores cache', async () => {
  let callback, starts = 0, stops = 0, changes = 0;
  const watcher = createCashAvailabilityWatcher({}, { sdk: { doc: (_db, collection, id) => ({ collection, id }), onSnapshot: (_ref, _meta, next) => { starts++; callback = next; return () => stops++; } } });
  const off = watcher('tenant', 'branch', null, () => changes++, assert.fail);
  const off2 = watcher('tenant', 'branch', null, () => {}, assert.fail);
  for (let i = 0; i < 100 && !callback; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(typeof callback, 'function');
  const emit = (data, fromCache = false) => callback({ exists: () => Boolean(data), data: () => data, metadata: { fromCache, hasPendingWrites: false } });
  emit(null); emit({ sessionId: 'owner', userId: 'owner', status: 'open' }, true); assert.equal(changes, 0);
  emit({ sessionId: 'owner', userId: 'owner', status: 'open' }); assert.equal(changes, 1);
  emit({ sessionId: 'owner', userId: 'owner', status: 'open' }); assert.equal(changes, 1);
  emit(null); assert.equal(changes, 2); assert.equal(starts, 1);
  off(); assert.equal(stops, 0); off2(); assert.equal(stops, 1);
  emit({ sessionId: 'other' }); assert.equal(changes, 2);
});

it('Plan07 reconciles lost notification batch responses and exposes partial receipts for idempotent retry', async () => {
  const confirmed = new Map(); let batches = 0, partial = false;
  const sdk = { doc: (_db, _name, id) => ({ id }), serverTimestamp: timestamp,
    writeBatch: () => {
      const rows = []; return { set: (ref, data) => rows.push([ref, data]), update: (ref, data) => rows.push([ref, data]),
        commit: async () => { batches++; for (const [ref, data] of rows.slice(0, partial ? 2 : undefined)) confirmed.set(ref.id, data); throw unavailable(); } };
    },
    getDocFromServer: async ref => ({ exists: () => confirmed.has(ref.id), data: () => confirmed.get(ref.id), metadata: { fromCache: false, hasPendingWrites: false } }),
  };
  const repo = createNotificationRepository({}, { sdk });
  const visible = Array.from({ length: 21 }, (_, i) => ({ id: `notice-${i}`, businessId: 'tenant', userId: 'owner', readMarker: { businessId: 'tenant', userId: 'owner' } }));
  assert.equal((await repo.markAllNotificationsRead('tenant', 'owner', visible)).confirmedIds.length, 21); assert.equal(batches, 3);
  confirmed.clear(); partial = true;
  await assert.rejects(repo.markAllNotificationsRead('tenant', 'owner', visible), error => error.confirmedIds.length === 2 && error.pendingIds.length === 19);
  partial = false;
  assert.equal((await repo.markAllNotificationsRead('tenant', 'owner', visible)).confirmedIds.length, 21);
});

it('Plan07 retains server-confirmed notification views through cached write snapshots and keeps internal actor evidence', () => {
  const callbacks = new Map(), views = [];
  const sdk = { collection: (_db, name) => name, doc: (_db, _name, id) => id, query: collection => collection,
    where: () => ({}), orderBy: () => ({}), limit: () => ({}),
    onSnapshot: (ref, _options, callback) => { callbacks.set(ref, callback); return () => callbacks.delete(ref); } };
  const repo = createNotificationRepository({}, { sdk });
  const off = repo.subscribeUnreadNotifications('tenant', 'owner', (rows, meta) => views.push({ rows, meta }), assert.fail);
  const row = { id: 'legacy', data: () => ({ businessId: 'tenant', userId: 'owner', readAt: null, createdAt: timestamp() }), metadata: { hasPendingWrites: false } };
  callbacks.get('notifications')({ docs: [row], metadata: { fromCache: false, hasPendingWrites: false } });
  callbacks.get('notifications')({ docs: [], metadata: { fromCache: true, hasPendingWrites: true } });
  callbacks.get('notifications')({ docs: [], metadata: { fromCache: true, hasPendingWrites: false } });
  assert.equal(views.at(-1).rows.length, 1);
  callbacks.get('notifications')({ docs: [], metadata: { fromCache: false, hasPendingWrites: false } });
  assert.equal(views.at(-1).rows.length, 0); off();
  const notice = projectFinancialNotice('pos-void', { id: 'ticket', saleId: 'ticket', businessId: 'tenant', branchId: 'branch', userId: 'cashier',
    authority: 'pos-compensation', protocol: 1, amount: -9, reason: 'Motivo', occurredAt: timestamp() }, 'tenant', 'owner');
  assert.equal(notice.metadata.actorId, 'cashier'); assert.match(notice.message, /No acredita entrega física/);
});

it('Plan07 report projection applies each compensation once without classifying it as contract expenditure', () => {
  const receipt = { ...sale('report-ticket'), status: 'confirmed' };
  const refund = { ...receipt, id: receipt.saleId, authority: 'pos-compensation', amount: -33.3, cashAmount: -33.3, digitalAmount: 0, occurredAt: timestamp() };
  const report = aggregateReport({ sales: [receipt], voids: [refund, refund], businessId: 'tenant', branchId: 'branch' });
  assert.equal(report.summary.netRevenue, 0); assert.equal(report.summary.contractRevenue, 0); assert.equal(report.summary.refundCount, 1);
});
