import assert from 'node:assert/strict';
import { before, beforeEach, after, describe, it } from 'node:test';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import * as firestoreSDK from 'firebase/firestore';
import * as storageSDK from 'firebase/storage';
import { createPaymentRepository } from '../frontend/src/features/payments/infrastructure/paymentQueryRepository.js';
import { createContractQueryRepository } from '../frontend/src/features/contracts/infrastructure/contractQueryRepository.js';
import { mergeContractPages, createContractCommandRegistry } from '../frontend/src/features/contracts/application/contractCommands.js';
import { cleanupUnreferencedImages } from '../frontend/src/features/contracts/application/imageCleanup.js';
import { runContractMigration, migrationOptions } from '../functions/scripts/migrateLegacyContracts.mjs';
import { migrateLegacyContractImages } from '../functions/scripts/legacyContractImages.mjs';
import { ensureLegacyPaymentsMigrated } from '../functions/src/contracts/legacyLedger.js';
import { createCashAutoCloser } from '../functions/src/cash-register/scheduled.js';
import { cashLockId, createCashSessionHandlers, RESERVATION_WINDOW_MS } from '../functions/src/cash-register/handlers.js';
import { createCashStateReader } from '../frontend/src/features/cash-register/infrastructure/cashQueryRepository.js';
import { compatiblePayments } from '../frontend/src/features/payments/application/compatiblePayments.js';
import { createSalesPeriodReader } from '../frontend/src/features/sales/infrastructure/salesQueryRepository.js';
import { createNotificationRepository } from '../frontend/src/features/notifications/infrastructure/notificationQueryRepository.js';
import { createAuditRepository } from '../frontend/src/features/notifications/infrastructure/auditQueryRepository.js';

describe('Phase 6 protected cash sessions and event notifications', () => {
  async function fresh() { await database.doc('cash_sessions/session-a').delete(); }
  const opening = (extra = {}) => ({ sessionId: uuid(), branchId: 'a-1', openingAmount: 10, notes: '', ...extra });
  async function opened(extra = {}, actor = 'cashier') { const data = opening(extra); return rpc('openCashSession', data, actor); }
  async function audits(type, sourceId) {
    let query = database.collection('audit_events').where('type', '==', type);
    if (sourceId) query = query.where('sourceId', '==', sourceId);
    return (await query.get()).docs.map(doc => ({ ...doc.data(), id: doc.id }));
  }
  async function waitNotifications(eventId, minimum = 2) {
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      const rows = (await database.collection('notifications').where('eventId', '==', eventId).get()).docs.map(doc => ({ ...doc.data(), id: doc.id }));
      if (rows.length >= minimum) return rows;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail('Audit fanout did not create the expected private notifications.');
  }
  async function sale(sessionId, extra = {}) {
    await database.doc('products/cash-product').set({ businessId: 'tenant-a', name: 'Pan', price: 10, cost: 2, stock: { 'a-1': 20 } });
    const createdAt = new Date().toISOString();
    const data = { localId: uuid(), businessId: 'tenant-a', branchId: 'a-1', userId: actors.cashier.uid, sessionId,
      items: [{ id: 'cash-product', name: 'Pan', qty: 1, price: 10, cost: 2 }], total: 10,
      payment: 'efectivo', amountPaid: 10, change: 0, createdAt, queuedAt: createdAt, origin: 'online', ...extra };
    await rpc('submitSale', data); return data;
  }
  async function partialLegacy(sessionId) {
    const reference = database.doc('contracts/partial-legacy');
    await reference.set(legacy({ payments: [
      { amount: 30, type: 'advance', method: 'efectivo', sessionId, date: iso(-300000) },
      { amount: 5, type: 'refund', method: 'efectivo', sessionId, date: iso(-200000) },
    ] }));
    await database.runTransaction(async transaction => {
      const source = (await transaction.get(reference)).data();
      (await ensureLegacyPaymentsMigrated(transaction, database, reference, source)).write(1);
    });
  }
  it('two cashiers checking the branch do not create reservations or prevent a subsequent opening', async () => {
    await fresh();
    for (const who of ['cashier', 'cashier2']) {
      const read = createCashStateReader(actors[who].database, { sdk: firestoreSDK });
      assert.equal(await read('tenant-a', 'a-1'), null);
    }
    assert.equal((await database.collection('active_cash_sessions').get()).size, 0);
    assert.equal((await database.collection('cash_sessions').get()).size, 0);
    assert.equal((await opened({}, 'cashier2')).userId, actors.cashier2.uid);
  });
  it('explicit reservations block foreign openings only until expiry and retries never renew abandoned authorization', async () => {
    await fresh(); let clock = Date.now();
    const handlers = createCashSessionHandlers(database, { now: () => clock });
    const request = (who, data) => ({ auth: { uid: actors[who].uid }, data });
    const sessionId = uuid();
    const reserved = await handlers.reserveOfflineCashSession(request('cashier', { sessionId, branchId: 'a-1' }));
    assert.equal(new Date(reserved.financialWindow.expiresAt).getTime() - clock, RESERVATION_WINDOW_MS);
    assert.equal((await handlers.reserveOfflineCashSession(request('cashier', { sessionId: uuid(), branchId: 'a-1' }))).id, sessionId);
    await assert.rejects(handlers.openCashSession(request('cashier2', opening())), { code: 'active-session' });
    clock += RESERVATION_WINDOW_MS + 1;
    await assert.rejects(handlers.reserveOfflineCashSession(request('cashier', { sessionId, branchId: 'a-1' })), { code: 'expired-session' });
    const opened = await handlers.openCashSession(request('cashier2', opening()));
    assert.equal(opened.userId, actors.cashier2.uid);
    assert.equal((await database.doc('active_cash_sessions/' + cashLockId('tenant-a', 'a-1')).get()).data().sessionId, opened.id);
  });
  it('late offline sale and void include missing legacy refunds during a partial migration exactly once', async () => {
    await partialLegacy('session-a');
    const closed = await rpc('closeCashSession', { sessionId: 'session-a', declaredAmount: 35 });
    assert.equal(closed.expectedCash, 35); assert.equal(closed.contractCash, 25); assert.equal(closed.legacyPartialMigrations, 1);
    const receipt = await sale('session-a', { origin: 'offline', createdAt: iso(-1000), queuedAt: iso(-1000) });
    await rpc('submitSale', receipt);
    let saved = (await database.doc('cash_sessions/session-a').get()).data();
    assert.equal(saved.expectedCash, 45); assert.equal(saved.contractCash, 25); assert.equal(saved.financialRevision, 1);
    await rpc('voidSale', { saleId: receipt.localId, reason: 'Prueba' });
    await rpc('voidSale', { saleId: receipt.localId, reason: 'Prueba' });
    saved = (await database.doc('cash_sessions/session-a').get()).data();
    assert.equal(saved.expectedCash, 35); assert.equal(saved.financialRevision, 2);
    await runContractMigration({ database, bucket, businessId: 'tenant-a', dryRun: false });
    assert.equal((await rpc('reconcileCashSession', { sessionId: 'session-a' })).expectedCash, 35);
    assert.equal((await audits('CASH_RECONCILED', 'session-a')).length, 2);
  });
  it('unverifiable legacy preserves the last trusted close until an explicit reconciliation has complete data', async () => {
    await partialLegacy('session-a');
    await rpc('closeCashSession', { sessionId: 'session-a', declaredAmount: 35 });
    const bad = database.doc('contracts/missing-date');
    const payment = { amount: 4, type: 'payment', method: 'efectivo', sessionId: 'session-a' };
    await bad.set(legacy({ payments: [payment] }));
    await sale('session-a', { origin: 'offline', createdAt: iso(-1000), queuedAt: iso(-1000) });
    let saved = (await database.doc('cash_sessions/session-a').get()).data();
    assert.equal(saved.expectedCash, 35); assert.equal(saved.requiresFinancialReview, true); assert.equal(saved.totalsComplete, false);
    assert.equal((await rpc('reconcileCashSession', { sessionId: 'session-a' })).expectedCash, 35);
    await bad.update({ payments: [{ ...payment, date: iso(-30000) }] });
    const reconciled = await rpc('reconcileCashSession', { sessionId: 'session-a' });
    assert.equal(reconciled.expectedCash, 49); assert.equal(reconciled.requiresFinancialReview, false); assert.equal(reconciled.totalsComplete, true);
    await rpc('reconcileCashSession', { sessionId: 'session-a' });
    assert.equal((await audits('CASH_RECONCILED', 'session-a')).length, 2);
  });
  it('concurrent openings allow at most one actor and one deterministic branch lock', async () => {
    await fresh();
    const results = await Promise.allSettled([rpc('openCashSession', opening()), rpc('openCashSession', opening(), 'cashier2')]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.details.saleCode, 'active-session');
    assert.equal((await database.collection('cash_sessions').where('status', '==', 'open').get()).size, 1);
    assert.equal((await database.collection('active_cash_sessions').get()).size, 1);
  });
  it('opening retry preserves the same session; changed opening data and second branch session cannot bypass the lock', async () => {
    await fresh(); const data = opening();
    const first = await rpc('openCashSession', data);
    assert.equal((await rpc('openCashSession', data)).id, first.id);
    await fails(rpc('openCashSession', { ...data, openingAmount: 20 }), 'session-conflict');
    await fails(rpc('openCashSession', opening(), 'owner'), 'active-session');
    const other = await opened({ branchId: 'a-2' }, 'owner');
    assert.equal(other.branchId, 'a-2');
    assert.equal((await audits('CASH_OPENED', first.id)).length, 1);
  });
  it('server close includes POS and signed contract cash, excludes digital payments without a session and ignores forged totals', async () => {
    await fresh(); const session = await opened({ businessId: 'tenant-b', userId: actors.other.uid, expectedCash: 9999 });
    await sale(session.id);
    const contract = await create({ initialPayment: { operationId: uuid(), amount: 20, method: 'efectivo' } });
    await rpc('cancelContract', cancellation(contract.contractId));
    await create({ initialPayment: { operationId: uuid(), amount: 7, method: 'yape' } });
    const result = await rpc('closeCashSession', { sessionId: session.id, declaredAmount: 20, notes: 'Cierre',
      expectedCash: 9999, totalCash: 9999, totalSales: 9999, status: 'open', businessId: 'tenant-b' });
    assert.equal(result.expectedCash, 20); assert.equal(result.posCash, 10); assert.equal(result.contractCash, 0);
    assert.equal(result.totalSales, 2); assert.equal(result.difference, 0); assert.equal(result.status, 'closed');
    assert.equal(result.userId, actors.cashier.uid);
    assert.equal((await database.collection('active_cash_sessions').get()).size, 0);
  });
  it('mixed POS contributes cash/digital correctly and repeat close never creates a second event', async () => {
    await fresh(); const session = await opened();
    await sale(session.id, { payment: 'mixto', splitPayments: { efectivo: 4, yape: 6 } });
    const data = { sessionId: session.id, declaredAmount: 14 };
    const first = await rpc('closeCashSession', data);
    assert.equal(first.totalYape, 6); assert.equal(first.expectedCash, 14);
    assert.equal((await rpc('closeCashSession', data)).closedAt, first.closedAt);
    assert.equal((await audits('CASH_CLOSED', session.id)).length, 1);
  });
  it('force close requires an administrator and cannot be used cross-tenant', async () => {
    await fresh(); const session = await opened();
    await fails(rpc('forceCloseCashSession', { sessionId: session.id, declaredAmount: 10 }, 'cashier2'), 'permission-denied');
    await fails(rpc('closeCashSession', { sessionId: session.id, declaredAmount: 10 }, 'owner'), 'permission-denied');
    await fails(rpc('forceCloseCashSession', { sessionId: session.id, declaredAmount: 10 }, 'other'), 'permission-denied');
    const saved = await rpc('forceCloseCashSession', { sessionId: session.id, declaredAmount: 10, notes: 'Relevo autorizado' }, 'owner');
    assert.equal(saved.closedByUid, actors.owner.uid);
    assert.equal((await audits('CASH_FORCE_CLOSED', session.id)).length, 1);
  });
  it('offline reservation, local close and retries synchronize once, then late sales reconcile server totals', async () => {
    await fresh(); const reservation = await rpc('reserveOfflineCashSession', { sessionId: uuid(), branchId: 'a-1' });
    const openedAt = new Date().toISOString();
    await new Promise(resolve => setTimeout(resolve, 5));
    const createdAt = new Date().toISOString();
    await new Promise(resolve => setTimeout(resolve, 5));
    const payload = { sessionId: reservation.id, declaredAmount: 20, offline: true, openedAt,
      openingAmount: 10, closedAt: new Date().toISOString(), notes: 'Cierre offline' };
    const first = await rpc('closeCashSession', payload);
    assert.equal(first.expectedCash, 10); assert.equal(first.reconciliationPending, true);
    assert.equal((await rpc('closeCashSession', payload)).closedAt, first.closedAt);
    await sale(reservation.id, { origin: 'offline', createdAt, queuedAt: createdAt });
    let stored = (await database.doc('cash_sessions/' + reservation.id).get()).data();
    assert.equal(stored.expectedCash, 20); assert.equal(stored.difference, 0);
    const final = await rpc('reconcileCashSession', { sessionId: reservation.id });
    assert.equal(final.reconciliationPending, false); assert.equal(final.difference, 0);
    await rpc('reconcileCashSession', { sessionId: reservation.id });
    assert.equal((await audits('CASH_CLOSED', reservation.id)).length, 1);
    assert.equal((await audits('CASH_OPENED', reservation.id)).length, 1);
  });
  it('a late offline count survives automatic closure and cannot release a newer branch session', async () => {
    await fresh();
    const sessionId = uuid(), started = Date.now() - 20 * 3600000;
    await database.doc('cash_sessions/' + sessionId).set({ businessId: 'tenant-a', branchId: 'a-1', userId: actors.cashier.uid,
      status: 'reserved', financialWindow: { start: Timestamp.fromMillis(started), expiresAt: Timestamp.fromMillis(started + 18 * 3600000) } });
    const openedAt = new Date(started + 3600000).toISOString();
    const automatic = await rpc('openCashSession', { sessionId, branchId: 'a-1', openingAmount: 10, openedAt, offline: true });
    assert.equal(automatic.autoClosed, true); assert.equal(automatic.declaredAmount, null);
    const live = await opened({}, 'cashier2');
    const payload = { sessionId, declaredAmount: 10, openedAt, closedAt: new Date(started + 17 * 3600000).toISOString(), offline: true };
    const closed = await rpc('closeCashSession', payload);
    assert.equal(closed.declaredAmount, 10); assert.equal(closed.difference, 0);
    assert.equal((await rpc('closeCashSession', { ...payload, declaredAmount: 999 })).declaredAmount, 10);
    assert.equal((await database.doc('active_cash_sessions/' + cashLockId('tenant-a', 'a-1')).get()).data().sessionId, live.id);
    assert.equal((await audits('CASH_OPENED', sessionId)).length, 1);
    assert.equal((await audits('CASH_CLOSED', sessionId)).length, 1);
    const outside = new Date(started + 17.5 * 3600000).toISOString();
    await fails(sale(sessionId, { origin: 'offline', createdAt: outside, queuedAt: outside }), 'invalid-session');
  });
  it('historical sale void updates the authoritative closed-session projection exactly once', async () => {
    await fresh(); const session = await opened(); const receipt = await sale(session.id);
    await rpc('closeCashSession', { sessionId: session.id, declaredAmount: 20 });
    await rpc('voidSale', { saleId: receipt.localId, reason: 'Prueba' });
    await rpc('voidSale', { saleId: receipt.localId, reason: 'Prueba' });
    const saved = (await database.doc('cash_sessions/' + session.id).get()).data();
    assert.equal(saved.expectedCash, 10); assert.equal(saved.difference, 10);
    assert.equal((await audits('SALE_VOIDED', receipt.localId)).length, 1);
    assert.equal((await audits('CASH_RECONCILED', session.id)).length, 1);
  });
  it('discrepancy creates one immutable event and separate notifications for each owner and the affected cashier', async () => {
    await fresh(); const session = await opened();
    const result = await rpc('closeCashSession', { sessionId: session.id, declaredAmount: 8 });
    assert.equal(result.difference, -2); assert.equal(result.status, 'closed_with_discrepancy');
    const [event] = await audits('CASH_DISCREPANCY', session.id);
    const notifications = await waitNotifications(event.id, 3);
    assert.ok(notifications.some(item => item.userId === actors.cashier.uid));
    const first = notifications.find(item => item.userId === actors.owner.uid);
    const second = notifications.find(item => item.userId === actors.owner2.uid);
    const repository = createNotificationRepository(actors.owner.database, { sdk: firestoreSDK });
    await repository.markNotificationRead(first.id);
    assert.equal((await database.doc('notifications/' + second.id).get()).data().readAt, null);
    await assert.rejects(firestoreSDK.getDoc(firestoreSDK.doc(actors.owner2.database, 'notifications', first.id)), { code: 'permission-denied' });
    const auditRepo = createAuditRepository(actors.owner.database, { sdk: firestoreSDK });
    const events = await auditRepo.getAuditEventsPage('tenant-a', new Date(now - 60000), new Date(Date.now() + 60000), { branchId: 'a-1' });
    assert.ok(events.events.some(item => item.id === event.id));
    const all = await auditRepo.getAuditEventsPage('tenant-a', new Date(now - 60000), new Date(Date.now() + 60000));
    assert.ok(all.events.length >= events.events.length);
  });
  it('notification listener is limited and mark-all only changes the current user readAt', async () => {
    const batch = database.batch();
    for (let i = 0; i < 35; i++) batch.set(database.doc('notifications/notice-' + i), { businessId: 'tenant-a', userId: actors.owner.uid,
      eventId: 'test', type: 'TEST', title: 'Prueba', message: 'Mensaje', createdAt: Timestamp.fromMillis(now - i), readAt: null });
    batch.set(database.doc('notifications/other-owner'), { businessId: 'tenant-a', userId: actors.owner2.uid, eventId: 'test', type: 'TEST',
      title: 'Prueba', message: 'Mensaje', createdAt: Timestamp.fromMillis(now), readAt: null });
    await batch.commit();
    const repo = createNotificationRepository(actors.owner.database, { sdk: firestoreSDK });
    await new Promise((resolve, reject) => {
      const stop = repo.subscribeUnreadNotifications('tenant-a', actors.owner.uid, rows => {
        try { assert.equal(rows.length, 30); stop(); resolve(); } catch (error) { stop(); reject(error); }
      }, reject);
    });
    await repo.markAllNotificationsRead('tenant-a', actors.owner.uid);
    assert.equal((await database.collection('notifications').where('userId', '==', actors.owner.uid).where('readAt', '==', null).get()).size, 0);
    assert.equal((await database.doc('notifications/other-owner').get()).data().readAt, null);
  });
  it('contract cancel retries do not duplicate payment/refund/void audit events or notifications', async () => {
    const contract = await create({ initialPayment: { operationId: uuid(), amount: 20, method: 'yape' } });
    const data = cancellation(contract.contractId);
    await rpc('cancelContract', data); await rpc('cancelContract', data);
    assert.equal((await audits('CONTRACT_PAYMENT', contract.contractId)).length, 1);
    assert.equal((await audits('CONTRACT_REFUND', contract.contractId)).length, 1);
    const events = await audits('CONTRACT_VOIDED', contract.contractId);
    assert.equal(events.length, 1);
    const notifications = await waitNotifications(events[0].id);
    assert.equal(new Set(notifications.map(item => item.userId)).size, notifications.length);
  });
  it('scheduled auto-close only processes expired sessions, releases their lock and emits private notifications', async () => {
    const expiry = now - 3600000;
    const old = { businessId: 'tenant-a', branchId: 'a-2', userId: actors.cashier.uid, cashierName: 'cashier', status: 'open', openingAmount: 5,
      openedAt: iso(-19 * 3600000), financialWindow: { start: Timestamp.fromMillis(now - 19 * 3600000),
        openedAt: Timestamp.fromMillis(now - 19 * 3600000), expiresAt: Timestamp.fromMillis(expiry) } };
    await database.doc('cash_sessions/expired').set(old);
    await database.doc('active_cash_sessions/' + cashLockId('tenant-a', 'a-2')).set({ businessId: 'tenant-a', branchId: 'a-2',
      sessionId: 'expired', userId: actors.cashier.uid, status: 'open', expiresAt: Timestamp.fromMillis(expiry) });
    const closeExpired = createCashAutoCloser(database);
    assert.equal((await closeExpired()).closed, 1);
    assert.equal((await database.doc('cash_sessions/session-a').get()).data().status, 'open');
    const expired = (await database.doc('cash_sessions/expired').get()).data();
    assert.equal(expired.autoClosed, true); assert.equal(expired.declaredAmount, null); assert.equal(expired.expectedCash, 5);
    assert.equal((await database.doc('active_cash_sessions/' + cashLockId('tenant-a', 'a-2')).get()).exists, false);
    assert.equal((await closeExpired()).closed, 0);
    const [event] = await audits('REGISTER_AUTO_CLOSED', 'expired');
    await waitNotifications(event.id, 3);
  });
});

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1:9199');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp: initAdmin, deleteApp: deleteAdmin } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const projectId = 'demo-migapos';
const admin = initAdmin({ projectId, storageBucket: projectId + '.appspot.com' }, 'contracts-tests');
const database = getFirestore(admin), bucket = getStorage(admin).bucket(), actors = {};
const uuid = () => crypto.randomUUID();
const now = Date.now();
const iso = offset => new Date(now + offset).toISOString();
const rpc = (name, data, who = 'cashier') => httpsCallable(actors[who].functions, name)(data).then(result => result.data);
const fails = (promise, code) => assert.rejects(promise, error => error.details?.saleCode === code);
const input = (overrides = {}) => ({ contractId: uuid(), operationId: uuid(), branchId: 'a-1', clientName: 'Cliente',
  subtotal: 100, deliveryCost: 0, total: 100, deliveryDate: iso(86400000), deliveryType: 'a-1', ...overrides });
const getContract = async id => (await database.doc('contracts/' + id).get()).data();
const ledger = async id => (await database.collection('payments').where('sourceId', '==', id).get()).docs.map(doc => ({ ...doc.data(), id: doc.id }));
const create = async overrides => { const data = input(overrides); await rpc('createContract', data); return data; };
const pay = (contractId, overrides = {}) => ({ contractId, operationId: uuid(), branchId: 'a-1', amount: 25, method: 'yape', ...overrides });
const cancellation = (contractId, overrides = {}) => ({ contractId, operationId: uuid(), branchId: 'a-1', reason: 'Cancelación solicitada', ...overrides });
const legacy = (overrides = {}) => ({ businessId: 'tenant-a', branchId: 'a-1', contractId: 'PED-LEGACY',
  clientName: 'Cliente histórico', total: 100, subtotal: 100, status: 'pendiente', createdAt: Timestamp.fromDate(new Date('2024-01-01')),
  payments: [{ type: 'adelanto', amount: 30, method: 'yape', date: '2024-01-02T15:00:00Z' }], ...overrides });

before(async () => {
  for (const name of ['cashier', 'cashier2', 'owner', 'owner2', 'other']) {
    const app = initializeApp({ projectId, apiKey: 'demo-key' }, 'contracts-' + name);
    const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const credential = await createUserWithEmailAndPassword(auth, name + '-' + uuid() + '@example.test', 'emulator-only-password');
    const functions = getFunctions(app, 'us-central1'); connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    const clientDatabase = firestoreSDK.getFirestore(app); firestoreSDK.connectFirestoreEmulator(clientDatabase, '127.0.0.1', 8080);
    const storage = storageSDK.getStorage(app, 'gs://' + projectId + '.appspot.com');
    storageSDK.connectStorageEmulator(storage, '127.0.0.1', 9199);
    actors[name] = { app, functions, uid: credential.user.uid, database: clientDatabase, storage };
  }
});
beforeEach(async () => {
  assert.equal(database.projectId, projectId);
  assert.equal((await fetch('http://127.0.0.1:8080/emulator/v1/projects/' + projectId + '/databases/(default)/documents', { method: 'DELETE' })).ok, true);
  const batch = database.batch();
  for (const businessId of ['tenant-a', 'tenant-b']) batch.set(database.doc('licenses/' + businessId), {
    businessId, status: 'activa', expiry: Timestamp.fromMillis(Date.now() + 365 * 86400000),
  });
  for (const [name, actor] of Object.entries(actors)) batch.set(database.doc('users/' + actor.uid), {
    businessId: name === 'other' ? 'tenant-b' : 'tenant-a', branchId: name === 'other' ? 'b-1' : 'a-1',
    role: name.startsWith('owner') ? 'dueño' : 'cajero', status: 'activo', firstName: name,
  });
  for (const branchId of ['a-1', 'a-2', 'b-1']) batch.set(database.doc('branches/' + branchId), {
    businessId: branchId === 'b-1' ? 'tenant-b' : 'tenant-a', status: 'activo',
  });
  batch.set(database.doc('cash_sessions/session-a'), { businessId: 'tenant-a', branchId: 'a-1', userId: actors.cashier.uid,
    cashierName: 'cashier', status: 'open', openingAmount: 10, openedAt: iso(-600000), financialWindow: {
      start: Timestamp.fromMillis(now - 600000), openedAt: Timestamp.fromMillis(now - 600000), expiresAt: Timestamp.fromMillis(now + 18 * 3600000),
    } });
  await batch.commit();
});
after(async () => { await Promise.all(Object.values(actors).map(actor => deleteApp(actor.app))); await deleteAdmin(admin); });

describe('Phase 5 contract callables', () => {
  it('creates without an advance and ignores client financial identity/projections', async () => {
    const data = input({ businessId: 'tenant-b', userId: actors.other.uid, role: 'superadmin', paidTotal: 100, balance: 0 });
    const result = await rpc('createContract', data), saved = await getContract(data.contractId);
    assert.equal(saved.businessId, 'tenant-a'); assert.equal(saved.createdBy, actors.cashier.uid);
    assert.equal(saved.balance, 100); assert.equal(saved.paidTotal, 0); assert.equal(saved.payments, undefined);
    assert.equal((await ledger(data.contractId)).length, 0); assert.match(result.contractNumber, /^PED-/);
  });
  for (const method of ['efectivo', 'yape', 'plin']) it('creates an atomic advance with ' + method, async () => {
    if (method !== 'efectivo') await database.doc('cash_sessions/session-a').delete();
    const data = await create({ initialPayment: { operationId: uuid(), amount: 30, method } });
    const [payment] = await ledger(data.contractId);
    assert.equal(payment.type, 'advance'); assert.equal(payment.amount, 30); assert.equal(payment.branchId, 'a-1');
    assert.equal(payment.sessionId, method === 'efectivo' ? 'session-a' : null);
    assert.ok(payment.occurredAt instanceof Timestamp); assert.equal((await getContract(data.contractId)).balance, 70);
  });
  it('rejects global/foreign branch and overlarge advance without partial writes', async () => {
    for (const branchId of ['global', 'b-1', 'absent']) await fails(rpc('createContract', input({ branchId })), 'permission-denied');
    const data = input({ initialPayment: { operationId: uuid(), amount: 101, method: 'yape' } });
    await fails(rpc('createContract', data), 'overpayment'); assert.equal(await getContract(data.contractId), undefined);
  });
  it('cash advance requires an open real actor session', async () => {
    await database.doc('cash_sessions/session-a').update({ status: 'closed' });
    await fails(rpc('createContract', input({ initialPayment: { operationId: uuid(), amount: 10, method: 'efectivo' } })), 'cash-session-required');
  });
  it('create retry is idempotent and changed payload or reused operation conflicts', async () => {
    const data = input({ initialPayment: { operationId: uuid(), amount: 30, method: 'yape' } });
    await rpc('createContract', data);
    assert.equal((await rpc('createContract', data)).status, 'ALREADY_APPLIED');
    await fails(rpc('createContract', { ...data, clientName: 'Changed' }), 'payment-conflict');
    await fails(rpc('createContract', { ...data, contractId: uuid() }), 'payment-conflict');
    assert.equal((await ledger(data.contractId)).length, 1);
  });
  it('payments derive balance/status on the server and exact retry never duplicates', async () => {
    const data = await create(), payment = pay(data.contractId);
    await rpc('addContractPayment', payment);
    assert.equal((await rpc('addContractPayment', payment)).status, 'ALREADY_APPLIED');
    await fails(rpc('addContractPayment', { ...payment, amount: 26 }), 'payment-conflict');
    await fails(rpc('addContractPayment', pay(data.contractId, { amount: 76 })), 'overpayment');
    await fails(rpc('addContractPayment', pay(data.contractId), 'other'), 'permission-denied');
    assert.equal((await getContract(data.contractId)).balance, 75); assert.equal((await ledger(data.contractId)).length, 1);
    await rpc('addContractPayment', pay(data.contractId, { amount: 75 }));
    assert.equal((await getContract(data.contractId)).status, 'listo_para_entrega');
  });
  it('cash payment without a box rejects; digital payment does not invent one', async () => {
    const data = await create(); await database.doc('cash_sessions/session-a').delete();
    await fails(rpc('addContractPayment', pay(data.contractId, { method: 'efectivo' })), 'cash-session-required');
    await rpc('addContractPayment', pay(data.contractId));
    assert.equal((await ledger(data.contractId))[0].sessionId, null);
  });
  it('delivery status follows debt and final payment completes a delivered order', async () => {
    const data = await create(); await rpc('markContractDelivered', { contractId: data.contractId });
    assert.equal((await getContract(data.contractId)).status, 'entregado_con_deuda');
    await rpc('addContractPayment', pay(data.contractId, { amount: 100 }));
    assert.equal((await getContract(data.contractId)).status, 'entregado');
    assert.equal((await getContract(data.contractId)).balance, 0);
    const second = await create({ total: 0, subtotal: 0 }); await rpc('markContractDelivered', { contractId: second.contractId });
    assert.equal((await getContract(second.contractId)).status, 'entregado');
  });
  it('editing cannot forge projections and total cannot fall below net collected', async () => {
    const data = await create({ initialPayment: { operationId: uuid(), amount: 50, method: 'yape' } });
    await fails(rpc('updateContract', { contractId: data.contractId, changes: { balance: 0 } }), 'protected-contract-field');
    await fails(rpc('updateContract', { contractId: data.contractId, changes: { subtotal: 40, total: 40 } }), 'overpayment');
    await rpc('updateContract', { contractId: data.contractId, changes: { total: 120, subtotal: 120 } });
    assert.equal((await getContract(data.contractId)).balance, 70);
  });
  it('cancel refunds only outstanding receipts once and leaves zero balance', async () => {
    const data = await create({ initialPayment: { operationId: uuid(), amount: 30, method: 'efectivo' } });
    await rpc('addContractPayment', pay(data.contractId, { amount: 20 }));
    const cancel = cancellation(data.contractId); await rpc('cancelContract', cancel);
    assert.equal((await rpc('cancelContract', cancel)).status, 'ALREADY_APPLIED');
    const rows = await ledger(data.contractId), refunds = rows.filter(row => row.type === 'refund');
    assert.equal(refunds.length, 2); assert.equal(refunds.reduce((sum, row) => sum + row.amount, 0), -50);
    for (const refund of refunds) { assert.ok(refund.reversesPaymentId); assert.equal(refund.branchId, 'a-1'); assert.equal(refund.sessionId, refund.method === 'efectivo' ? 'session-a' : null); }
    assert.equal((await getContract(data.contractId)).status, 'cancelado'); assert.equal((await getContract(data.contractId)).balance, 0);
    assert.equal((await getContract(data.contractId)).paidTotal, 0);
    await fails(rpc('cancelContract', cancel, 'other'), 'permission-denied');
  });
  it('cash refund needs an open box and digital cancellation works without a box', async () => {
    const cash = await create({ initialPayment: { operationId: uuid(), amount: 10, method: 'efectivo' } });
    await database.doc('cash_sessions/session-a').update({ status: 'closed' });
    await fails(rpc('cancelContract', cancellation(cash.contractId)), 'cash-session-required');
    assert.equal((await getContract(cash.contractId)).status, 'pendiente');
    const digital = await create({ initialPayment: { operationId: uuid(), amount: 10, method: 'yape' } });
    await rpc('cancelContract', cancellation(digital.contractId));
    assert.equal((await ledger(digital.contractId)).find(row => row.type === 'refund').sessionId, null);
  });
});

describe('Phase 5 migration, queries and image cleanup', () => {
  it('Phase 7 sales export pages actual scoped queries and enforces the read limit', async () => {
    const batch = database.batch();
    for (let index = 0; index < 205; index++) batch.set(database.doc('sales/report-' + String(index).padStart(3, '0')), {
      businessId: 'tenant-a', branchId: 'a-1', createdAt: Timestamp.fromMillis(now + index), total: 1,
    });
    batch.set(database.doc('sales/report-other-branch'), { businessId: 'tenant-a', branchId: 'a-2', createdAt: Timestamp.fromMillis(now), total: 2 });
    batch.set(database.doc('sales/report-foreign'), { businessId: 'tenant-b', branchId: 'b-1', createdAt: Timestamp.fromMillis(now), total: 3 });
    await batch.commit();
    const read = createSalesPeriodReader(actors.owner.database, { sdk: firestoreSDK });
    const rows = await read('tenant-a', new Date(now - 1), new Date(now + 1000), { branchId: 'a-1' });
    assert.equal(rows.length, 205); assert.equal(new Set(rows.map(row => row.id)).size, 205);
    assert.equal((await read('tenant-a', new Date(now - 1), new Date(now + 1000))).length, 206);
    await assert.rejects(read('tenant-a', new Date(now - 1), new Date(now + 1000), { maxRows: 200 }), /Demasiados tickets/);
    await assert.rejects(read('tenant-b', new Date(now - 1), new Date(now + 1000)), { code: 'permission-denied' });
  });
  it('a partial ledger merges missing movement IDs and ignores unverified or foreign completion markers', async () => {
    const reference = database.doc('contracts/partial-report');
    await reference.set(legacy({ paymentsMigrated: true, payments: [
      { amount: 30, method: 'efectivo', type: 'advance', branchId: 'a-1', sessionId: 'session-a', date: '2024-01-02' },
      { amount: 5, method: 'efectivo', type: 'refund', branchId: 'a-1', sessionId: 'session-a', date: '2024-01-03' },
    ] }));
    await database.runTransaction(async transaction => {
      const source = (await transaction.get(reference)).data();
      (await ensureLegacyPaymentsMigrated(transaction, database, reference, source)).write(1);
    });
    const marker = database.doc('contract_migrations/tenant-a');
    await marker.set({ businessId: 'tenant-b', proofVersion: 2, verified: true, complete: true, needsReview: false });
    const input = { sessionId: 'session-a', branchId: 'a-1' };
    const page = await rpc('getLegacyContractPayments', input);
    assert.equal(page.partialMigrations, 1); assert.equal(page.payments.length, 1); assert.equal(page.payments[0].amount, -5);
    assert.equal(page.payments[0].occurredAt, '2024-01-03T00:00:00.000Z');
    const repo = createPaymentRepository(actors.cashier.database, { sdk: firestoreSDK });
    await assert.rejects(compatiblePayments(input, () => repo.getPaymentsBySession('tenant-a', 'session-a', 'a-1'), data => rpc('getLegacyContractPayments', data),
      { requireMigrated: true }), /incompleta/);
    const rows = await compatiblePayments(input, () => repo.getPaymentsBySession('tenant-a', 'session-a', 'a-1'), data => rpc('getLegacyContractPayments', data));
    assert.equal(rows.length, 2); assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 25);
    await marker.set({ businessId: 'tenant-a', complete: true });
    assert.equal((await rpc('getLegacyContractPayments', input)).payments.length, 1);
    const result = await runContractMigration({ database, bucket, businessId: 'tenant-a', dryRun: false });
    assert.equal(result.errors, 0); assert.equal((await marker.get()).data().verified, true);
    assert.equal((await rpc('getLegacyContractPayments', input)).payments.length, 0);
    assert.equal((await ledger(reference.id)).length, 2);
  });
  it('dry run is default, CLI only prints a summary and resumes via cursor', async () => {
    assert.equal(migrationOptions([]).dryRun, true);
    await database.doc('contracts/legacy-a').set(legacy());
    await database.doc('contracts/legacy-b').set(legacy());
    const dry = await runContractMigration({ database, bucket, limit: 1 });
    assert.equal(dry.scanned, 1); assert.equal(dry.migrated, 1); assert.ok(dry.nextCursor);
    assert.ok((await getContract('legacy-a')).payments); assert.equal((await ledger('legacy-a')).length, 0);
    const output = execFileSync(process.execPath, ['functions/scripts/migrateLegacyContracts.mjs', '--dry-run', '--limit=1', '--cursor=legacy-a', '--business=tenant-a'], {
      env: { ...process.env, GCLOUD_PROJECT: projectId }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    const result = JSON.parse(output.trim()); assert.equal(result.scanned, 1);
    const first = await runContractMigration({ database, bucket, dryRun: false, limit: 1 });
    assert.equal(first.migrated, 1);
    const second = await runContractMigration({ database, bucket, dryRun: false, cursor: first.nextCursor });
    assert.equal(second.migrated, 1);
    const repeated = await runContractMigration({ database, bucket, dryRun: false });
    assert.equal(repeated.migrated, 0); assert.equal(repeated.skipped, 2);
    assert.equal(repeated.manualReview, 2);
    const row = (await ledger('legacy-a'))[0];
    assert.equal(row.occurredAt.toDate().toISOString(), '2024-01-02T15:00:00.000Z');
    assert.equal(row.branchResolution, 'inferred-contract');
    assert.equal((await getContract('legacy-a')).paymentsMigrated, true); assert.equal((await getContract('legacy-a')).payments, undefined);
  });
  it('mixed receipts and refunds preserve money and verified branch provenance', async () => {
    await database.doc('contracts/legacy-a').set(legacy({ payments: [
      { type: 'adelanto', amount: 40, method: 'mixto', splitPayments: { efectivo: 10, yape: 30 }, sessionId: 'session-a', date: '2024-01-02' },
      { type: 'reembolso', amount: 5, method: 'yape', branchId: 'a-2', date: '2024-01-03' },
    ] }));
    const result = await runContractMigration({ database, bucket, dryRun: false });
    assert.equal(result.migrated, 1);
    const rows = await ledger('legacy-a'); assert.equal(rows.length, 3);
    assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 35);
    assert.equal(rows.find(row => row.amount < 0).branchResolution, 'verified-payment');
    assert.equal(rows.find(row => row.method === 'efectivo').branchResolution, 'verified-session');
    assert.equal((await getContract('legacy-a')).balance, 65);
  });
  it('a large interrupted migration resumes bounded chunks without dropping or duplicating historical receipts', async () => {
    const reference = database.doc('contracts/large-legacy');
    await reference.set(legacy({ total: 1000, subtotal: 1000, payments: Array.from({ length: 450 }, (_, index) => ({
      amount: 1, type: 'payment', method: 'yape', branchId: 'a-1', date: new Date(Date.UTC(2024, 0, 1, 0, index)).toISOString(),
    })) }));
    await database.runTransaction(async transaction => {
      const original = (await transaction.get(reference)).data();
      const planned = await ensureLegacyPaymentsMigrated(transaction, database, reference, original, { maxNewPayments: 10000 });
      planned.write(200);
    });
    assert.equal((await ledger(reference.id)).length, 200);
    assert.equal((await getContract(reference.id)).payments.length, 450);
    const result = await runContractMigration({ database, bucket, businessId: 'tenant-a', dryRun: false });
    assert.equal(result.migrated, 1); assert.equal(result.errors, 0);
    const rows = await ledger(reference.id);
    assert.equal(rows.length, 450); assert.equal(new Set(rows.map(row => row.id)).size, 450);
    assert.equal((await getContract(reference.id)).balance, 550);
    assert.equal((await getContract(reference.id)).payments, undefined);
    assert.equal((await database.doc('contract_migrations/tenant-a').get()).data().complete, true);
    await runContractMigration({ database, bucket, businessId: 'tenant-a', dryRun: false });
    assert.equal((await ledger(reference.id)).length, 450);
  });
  it('unresolvable branch/date cases are reported for manual review without deleting money', async () => {
    await database.doc('contracts/legacy-a').set(legacy({ branchId: 'global' }));
    await database.doc('contracts/legacy-b').set(legacy({ payments: [{ amount: 10, method: 'yape' }] }));
    const result = await runContractMigration({ database, bucket, dryRun: false });
    assert.equal(result.manualReview, 2); assert.equal(result.errors, 0);
    assert.ok((await getContract('legacy-a')).payments); assert.equal((await ledger('legacy-a')).length, 0);
  });
  it('legacy fallback disappears once any ledger exists and never double counts', async () => {
    await database.doc('contracts/legacy-a').set(legacy());
    const query = { branchId: 'a-1', startDate: '2024-01-01', endDate: '2024-02-01' };
    assert.equal((await rpc('getLegacyContractPayments', query)).payments.length, 1);
    await runContractMigration({ database, bucket, dryRun: false });
    assert.equal((await rpc('getLegacyContractPayments', query)).payments.length, 0);
  });
  it('session and period queries are tenant/branch scoped and page all records without duplicates', async () => {
    const batch = database.batch();
    for (let i = 0; i < 205; i++) batch.set(database.doc('payments/payment-' + String(i).padStart(3, '0')), {
      businessId: 'tenant-a', branchId: 'a-1', sessionId: 'session-a', sourceType: 'contract', sourceId: 'contract-a',
      type: 'payment', method: 'efectivo', amount: 1, occurredAt: Timestamp.fromMillis(now), createdAt: Timestamp.fromMillis(now),
    });
    batch.set(database.doc('payments/other-session'), { businessId: 'tenant-a', branchId: 'a-1', sessionId: 'other', occurredAt: Timestamp.fromMillis(now - 86400000) });
    await batch.commit();
    const repo = createPaymentRepository(actors.owner.database, { sdk: firestoreSDK });
    const session = await repo.getPaymentsBySession('tenant-a', 'session-a', 'a-1');
    assert.equal(session.length, 205); assert.equal(new Set(session.map(row => row.id)).size, 205);
    const period = await repo.getPaymentsInPeriod('tenant-a', new Date(now - 1), new Date(now + 1), 'a-1');
    assert.equal(period.length, 205);
    assert.equal((await repo.getPaymentsInPeriod('tenant-a', new Date(now + 1), new Date(now + 2), 'a-1')).length, 0);
  });
  it('image migration dry run, deterministic upload and second apply are idempotent', async () => {
    const id = 'legacy-images', image = 'data:image/png;base64,iVBORw0KGgo=';
    await database.doc('contracts/' + id).set(legacy({ referenceImages: [image] }));
    const data = await getContract(id);
    const dry = await migrateLegacyContractImages({ database, bucket, contractId: id, contract: data });
    assert.equal(dry.changed, true); assert.equal((await bucket.file(dry.referenceImages[0].storagePath).exists())[0], false);
    await migrateLegacyContractImages({ database, bucket, contractId: id, contract: data, dryRun: false });
    const saved = await getContract(id); assert.ok(saved.referenceImages[0].storagePath);
    assert.equal((await migrateLegacyContractImages({ database, bucket, contractId: id, contract: saved, dryRun: false })).changed, false);
  });
  it('active listener is limited and history really obtains the next page without duplicates', async () => {
    const batch = database.batch();
    for (let i = 0; i < 31; i++) batch.set(database.doc('contracts/history-' + i), {
      businessId: 'tenant-a', status: 'entregado', createdAt: Timestamp.fromMillis(now + i), deliveryDate: Timestamp.fromMillis(now + i) });
    for (let i = 0; i < 103; i++) batch.set(database.doc('contracts/active-' + i), {
      businessId: 'tenant-a', status: 'pendiente', createdAt: Timestamp.fromMillis(now), deliveryDate: Timestamp.fromMillis(now + i) });
    await batch.commit();
    const repository = createContractQueryRepository(actors.owner.database, { sdk: firestoreSDK });
    const first = await repository.getContractHistoryPage('tenant-a');
    const second = await repository.getContractHistoryPage('tenant-a', first.cursor);
    assert.equal(first.contracts.length, 25); assert.equal(second.contracts.length, 6); assert.equal(second.hasMore, false);
    assert.equal(mergeContractPages(first.contracts, second.contracts).length, 31);
    await new Promise((resolve, reject) => {
      const stop = repository.subscribeActiveContracts('tenant-a', rows => {
        try { assert.equal(rows.length, 100); stop(); resolve(); } catch (error) { stop(); reject(error); }
      }, reject);
    });
  });
  it('cleanup never deletes referenced/old images and retains failures for a retry', async () => {
    const removed = [], retries = [];
    const result = await cleanupUnreferencedImages({ paths: ['new.jpg', 'retained.jpg', 'failed.jpg'],
      readCurrent: async () => [{ storagePath: 'retained.jpg' }],
      remove: async path => { if (path === 'failed.jpg') throw Error('temporary'); removed.push(path); },
      onFailure: async paths => retries.push(paths) });
    assert.deepEqual(removed, ['new.jpg']); assert.deepEqual(result.pending, ['failed.jpg']); assert.equal(retries.length, 1);
    const unknown = await cleanupUnreferencedImages({ paths: ['new.jpg'], readCurrent: async () => { throw Error('offline'); },
      remove: async () => assert.fail('Must not delete on unknown Firestore state') });
    assert.equal(unknown.pending.length, 1);
  });
  it('failed creation can verify an absent tenant-scoped contract and delete only its new Storage object', async () => {
    const id = uuid(), path = `contracts/tenant-a/${id}/new.png`, object = storageSDK.ref(actors.cashier.storage, path);
    await storageSDK.uploadBytes(object, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), { contentType: 'image/png' });
    await fails(rpc('createContract', input({ contractId: id, initialPayment: { operationId: uuid(), amount: 101, method: 'yape' } })), 'overpayment');
    const result = await cleanupUnreferencedImages({ paths: [path], readCurrent: async () => {
      const snapshot = await firestoreSDK.getDocFromServer(firestoreSDK.doc(actors.cashier.database, 'contracts', id));
      return snapshot.data()?.referenceImages ?? [];
    }, remove: () => storageSDK.deleteObject(object), onFailure: (_paths, error) => { throw error; } });
    assert.equal(result.deleted, 1); assert.equal(result.pending.length, 0);
    await assert.rejects(storageSDK.getMetadata(object), { code: 'storage/object-not-found' });
  });
  it('page merges do not duplicate IDs and retry command IDs remain stable', () => {
    assert.deepEqual(mergeContractPages([{ id: 'a' }, { id: 'b', old: true }], [{ id: 'b' }, { id: 'c' }]), [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const registry = createContractCommandRegistry(); const first = registry.retain('pay', 'amount:1');
    assert.equal(registry.retain('pay', 'amount:1').operationId, first.operationId);
    assert.notEqual(registry.retain('pay', 'amount:2').operationId, first.operationId);
  });
});
