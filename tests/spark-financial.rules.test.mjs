import { createContractMediaRepository, imageHash } from '../frontend/src/features/contracts/infrastructure/contractMediaRepository.js';
import { planLegacyPayments } from '../functions/src/contracts/domain/legacyPaymentPlan.js';
import { createContractPeriodReader } from '../frontend/src/features/contracts/infrastructure/contractPeriodRepository.js';
import { createContractQueryRepository } from '../frontend/src/features/contracts/infrastructure/contractQueryRepository.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, beforeEach, after, describe, it } from 'node:test';
import { createHash } from 'node:crypto';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch, runTransaction, serverTimestamp, Timestamp, setLogLevel } from 'firebase/firestore';
import * as sdk from 'firebase/firestore';
import { createSalesPeriodReader, createSalesSessionReader } from '../frontend/src/features/sales/infrastructure/salesQueryRepository.js';
import { createPaymentRepository } from '../frontend/src/features/payments/infrastructure/paymentQueryRepository.js';
import { createSparkLegacyPaymentReader } from '../frontend/src/features/payments/infrastructure/sparkLegacyPayments.js';
import { salesToDailyStats } from '../frontend/src/features/reports/domain/sparkReport.js';
import { aggregateReport } from '../frontend/src/features/reports/domain/reportTotals.js';
import { createSparkSalesRepository } from '../frontend/src/features/sales/infrastructure/sparkSalesRepository.js';
import { createSparkContractsRepository } from '../frontend/src/features/contracts/infrastructure/sparkContractsRepository.js';
import { createSparkCashClosingRepository } from '../frontend/src/features/cash-register/infrastructure/sparkCashClosingRepository.js';
import { createRequire } from 'node:module';
import { buildSalesWorkbook } from '../frontend/src/features/reports/application/salesWorkbook.js';
import { reportPeriod } from '../frontend/src/features/reports/domain/reportPeriod.js';
import { updateProductTransaction } from '../frontend/src/features/catalog/infrastructure/productWrites.js';
import { canonicalSale, sameSaleOperation } from '../functions/src/sales/domain/saleModel.js';
import { createSaleQueue } from '../frontend/src/features/sales/application/saleQueue.js';
import { encrypt, decrypt } from '../frontend/src/crypto.js';
import { createPosVoidRepository } from '../frontend/src/features/sales/infrastructure/posVoidRepository.js';
import { createPosVoidReader, voidCashPayments } from '../frontend/src/features/sales/infrastructure/posVoidQueryRepository.js';
import { createNotificationRepository, projectFinancialNotice } from '../frontend/src/features/notifications/infrastructure/notificationQueryRepository.js';
import { createCashAvailabilityWatcher } from '../frontend/src/features/cash-register/infrastructure/cashQueryRepository.js';
import { createSparkCashRepository } from '../frontend/src/features/cash-register/infrastructure/sparkCashRepository.js';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-migapos');
setLogLevel('silent');
let env;
const uid = 'cashier', businessId = 'prototype-tenant', branchId = 'prototype-branch', sessionId = 'prototype-session';
const products = ['bread', 'cake', 'milk', 'tea', 'extra'].map((id, index) => ({ id, businessId, name: id, category: 'Prueba', price: index + 1.25, cost: 0.25, stock: { [branchId]: 10, other: 7 }, posStockVersion: { other: 41 }, status: 'activo' }));
const database = () => env.authenticatedContext(uid).firestore();
const inspect = async path => { let result; await env.withSecurityRulesDisabled(async ctx => { result = await getDoc(doc(ctx.firestore(), path)); }); return result; };
const payload = (id, count = 4, qty = 1) => {
  const items = products.slice(0, count).map(product => ({ id: product.id, name: product.name, category: product.category, price: product.price, cost: product.cost, qty }));
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  return canonicalSale({ localId: id, businessId, branchId, userId: uid, sessionId, items, total, payment: 'efectivo', amountPaid: total, change: 0, createdAt: '2026-10-23T12:00:00.000Z' }, products);
};
async function commit(data, { mutate = value => value, omitProduct = null, receipt = true } = {}) {
  const db = database();
  return runTransaction(db, async tx => {
    const ref = doc(db, 'sales', data.saleId), existing = await tx.get(ref);
    if (existing.exists()) { if (!sameSaleOperation(data, existing.data())) throw new Error('operation-conflict'); return existing.data(); }
    const rows = await Promise.all(data.items.map(item => tx.get(doc(db, 'products', item.id))));
    const sale = mutate({ ...data, productIds: data.items.map(item => item.id), stockVersions: Object.fromEntries(rows.map((row, i) => [data.items[i].id, (row.data().posStockVersion?.[data.branchId] ?? 0) + 1])), confirmedAt: serverTimestamp(), status: 'confirmed' });
    if (receipt) tx.set(ref, sale);
    for (const [index, item] of data.items.entries()) if (item.id !== omitProduct) {
      const product = rows[index].data();
      tx.update(doc(db, 'products', item.id), { ...(data.atomicProtocol === 2 ? { posSaleLineIndex: index } : {}), stock: { ...product.stock, [data.branchId]: product.stock[data.branchId] - item.qty }, posLastSaleId: data.saleId, posStockVersion: { ...product.posStockVersion, [data.branchId]: (product.posStockVersion?.[data.branchId] ?? 0) + 1 } });
    }
    if (data.atomicProtocol === 2) for (let offset = 0; offset < data.items.length; offset += 4) {
      const items = data.items.slice(offset, offset + 4), index = offset / 4;
      tx.set(doc(db, 'pos_sale_groups', `${data.saleId}_${index}`), { businessId: data.businessId, branchId: data.branchId, userId: data.userId,
        saleId: data.saleId, index, createdAt: serverTimestamp(), totalCents: items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.qty, 0),
        costCents: items.reduce((sum, item) => sum + Math.round(item.cost * 100) * item.qty, 0) });
    }
    return sale;
  });
}
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-migapos', firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') } }); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore(), batch = writeBatch(db);
    const entries = { [`users/${uid}`]: { role: 'cajero', businessId, branchId, status: 'activo' }, [`tenants/${businessId}`]: { businessId, status: 'active' },
      [`licenses/${businessId}`]: { businessId, status: 'activa', expiry: Timestamp.fromMillis(Date.now() + 86400000) },
      [`branches/${branchId}`]: { businessId, status: 'activo', sparkCashVersion: 1 },
      [`cash_sessions/${sessionId}`]: { businessId, branchId, userId: uid, status: 'open', openingAmount: 10, runtime: 'spark', openedAt: Timestamp.fromMillis(Date.now() - 1000) },
      [`active_cash_sessions/${createHash('sha256').update(JSON.stringify([businessId, branchId])).digest('hex')}`]: { businessId, branchId, userId: uid, sessionId, status: 'open', runtime: 'spark' } };
    for (const product of products) entries[`products/${product.id}`] = product;
    for (const [path, value] of Object.entries(entries)) batch.set(doc(db, path), value);
    await batch.commit();
  });
});
after(async () => env?.cleanup());

describe('SPARK-4 integrated financial Rules', () => {
  it('Plan07 recovers a committed sale and cashier void after losing their post-commit reads', async () => {
    const db = database(), input = payload('plan07-receipts', 2);
    let loseRead = true, transactionCount = 0;
    const injected = { ...sdk, runTransaction: (...args) => { transactionCount++; return sdk.runTransaction(...args); },
      getDocFromServer: reference => loseRead ? Promise.reject(Object.assign(new Error('Lost receipt read'), { code: 'unavailable' })) : sdk.getDocFromServer(reference) };
    const sales = createSparkSalesRepository(db, { sdk: injected, currentUser: () => ({ uid }) });
    const rows = new Map(), store = { get: async id => rows.get(id), list: async () => [...rows.values()],
      insert: async row => rows.set(row.localId, row), update: async (id, changes) => Object.assign(rows.get(id), changes) };
    const identity = { uid, businessId, branchId };
    const queue = createSaleQueue({ store, encrypt, decrypt, online: () => true, currentIdentity: () => true,
      syncSessions: async () => new Map(), withLock: work => work(), apply: sales.submit, verifyReceipt: sales.verify });
    assert.equal((await queue.submit(input, identity, { isolated: true })).pending, true);
    assert.ok((await inspect('sales/' + input.saleId)).exists());
    const ciphertext = rows.get(input.saleId).data;
    loseRead = false;
    assert.equal((await queue.reconcile(identity))[0].state, 'confirmed');
    assert.deepEqual(await queue.reconcile(identity), []); assert.equal(transactionCount, 1); assert.equal(rows.get(input.saleId).data, ciphertext);
    const voids = createPosVoidRepository(db, { sdk: injected, currentUser: () => ({ uid }) });
    const command = { saleId: input.saleId, reason: 'Corrección real de simulación', businessId, branchId };
    loseRead = true;
    assert.equal((await voids.void(command)).status, 'APPLIED');
    const saved = (await inspect('pos_voids/' + input.saleId)).data();
    assert.equal(saved.authority, 'pos-compensation');
    loseRead = false;
    assert.equal((await voids.verify(command)).status, 'ALREADY_APPLIED');
    assert.equal((await voids.verify(command)).status, 'ALREADY_APPLIED');
    assert.equal(transactionCount, 2);
    assert.equal((await inspect('products/bread')).data().stock[branchId], 10);
    assert.equal((await inspect('products/bread')).data().posStockVersion[branchId], 2);
  });
  it('Plan07 keeps prior-session cash and digital compensations separate in a provisional negative cash close', async () => {
    const db = database(), sales = createSparkSalesRepository(db, { sdk, currentUser: () => ({ uid }) });
    const original = payload('plan07-prior-cash', 2);
    await sales.submit(original);
    const digital = { ...payload('plan07-prior-yape', 1), payment: 'yape' };
    const mixed = { ...payload('plan07-prior-mixed', 1), payment: 'mixto', splitPayments: { efectivo: 0.25, yape: 1 } };
    await sales.submit(digital); await sales.submit(mixed);
    const reader = createPosVoidReader(db, { sdk });
    const closing = createSparkCashClosingRepository(db, { sdk, currentUser: () => ({ uid }),
      readSales: createSalesSessionReader(db, { sdk }), readPayments: async session => voidCashPayments(await reader.bySession(session)) });
    const cashCompensation = original.total + 0.25;
    await assert.doesNotReject(closing.close(sessionId, 10 + cashCompensation, 'Cierre previo a compensación'), 'Previous session close');
    const nextId = 'plan07-current-cash-session';
    await createSparkCashRepository(db, { sdk, currentUser: () => ({ uid }) }).open({ sessionId: nextId, businessId, branchId, openingAmount: 0 });
    const command = { saleId: original.saleId, reason: 'Ticket de una caja anterior', businessId, branchId };
    const voids = createPosVoidRepository(db, { sdk, currentUser: () => ({ uid }) });
    await voids.void(command); await voids.verify(command);
    for (const source of [digital, mixed]) await voids.void({ ...command, saleId: source.saleId });
    const currentDigital = { ...payload('plan07-current-yape', 1), sessionId: nextId, payment: 'yape' };
    await sales.submit(currentDigital); await voids.void({ ...command, saleId: currentDigital.saleId });
    const estimate = await closing.preview(nextId, 0);
    assert.equal(estimate.contractCash, 0); assert.equal(estimate.posCompensationCash, -cashCompensation);
    assert.equal(estimate.expectedCash, -cashCompensation); assert.equal(estimate.difference, cashCompensation);
    assert.equal(estimate.digitalTotal, -2.25);
    assert.equal(estimate.hasUnverifiedDisbursements, true); assert.equal(estimate.requiresOwnerReview, true);
    let results;
    await assert.doesNotReject(async () => { results = await Promise.all([closing.close(nextId, 0, 'Entrega física no acreditada; revisión del dueño'), closing.close(nextId, 0, 'Entrega física no acreditada; revisión del dueño')]); }, 'Negative estimate concurrent close');
    assert.ok(results.every(row => row.reconciliationPending));
    const saved = (await inspect('cash_sessions/' + nextId)).data();
    assert.equal(saved.closeEstimate.posCompensationCash, -cashCompensation); assert.equal(saved.status, 'closed_with_discrepancy');
    await assert.rejects(sales.submit({ ...payload('plan07-after-close', 1), sessionId: nextId }), { code: 'permission-denied' });
  });
  it('Plan07 detects an owner opening cash while the cashier has no local session, then its release', async () => {
    const cashierDb = database();
    await createSparkCashClosingRepository(cashierDb, { sdk, currentUser: () => ({ uid }), readSales: async () => [], readPayments: async () => [] }).close(sessionId, 10);
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'users', 'manager'), { businessId, role: 'dueño', status: 'activo' }));
    const ownerDb = env.authenticatedContext('manager').firestore();
    let changes = 0;
    const stop = createCashAvailabilityWatcher(cashierDb, { sdk })(businessId, branchId, null, () => changes++, error => assert.fail(error.message));
    try {
      const id = 'plan07-owner-cash-session';
      await createSparkCashRepository(ownerDb, { sdk, currentUser: () => ({ uid: 'manager' }) }).open({ sessionId: id, businessId, branchId, openingAmount: 0 });
      for (let i = 0; i < 100 && changes < 1; i++) await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(changes, 1);
      await createSparkCashClosingRepository(ownerDb, { sdk, currentUser: () => ({ uid: 'manager' }), readSales: async () => [], readPayments: async () => [] }).close(id, 0);
      for (let i = 0; i < 100 && changes < 2; i++) await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(changes, 2);
    } finally { stop(); }
  });
  it('Plan07 verifies notification markers after a lost batch response without relaxing evidence Rules', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'users', 'manager'), { businessId, role: 'dueño', status: 'activo' });
      const batch = writeBatch(ctx.firestore());
      for (let index = 0; index < 12; index++) batch.set(doc(ctx.firestore(), 'pos_voids', `plan07-notice-${index}`), {
        businessId, branchId, userId: uid, saleId: `plan07-notice-${index}`, authority: 'pos-compensation', protocol: 1,
        amount: -9, reason: 'Prueba de lectura', occurredAt: Timestamp.now(),
      });
      await batch.commit();
    });
    const ownerDb = env.authenticatedContext('manager').firestore();
    const injected = { ...sdk, writeBatch: db => {
      const batch = sdk.writeBatch(db);
      return { set: (...args) => batch.set(...args), update: (...args) => batch.update(...args), commit: async () => { await batch.commit(); throw Object.assign(new Error('Lost batch response'), { code: 'unavailable' }); } };
    } };
    const repo = createNotificationRepository(ownerDb, { sdk: injected, currentUser: () => ({ uid: 'manager' }) });
    const notices = [];
    for (let index = 0; index < 12; index++) notices.push(projectFinancialNotice('pos-void', { ...(await inspect(`pos_voids/plan07-notice-${index}`)).data(), id: `plan07-notice-${index}` }, businessId, 'manager'));
    assert.equal((await repo.markAllNotificationsRead(businessId, 'manager', notices)).confirmedIds.length, 12);
    assert.equal((await repo.markAllNotificationsRead(businessId, 'manager', notices)).confirmedIds.length, 12);
    assert.ok((await inspect('notifications/' + notices.at(-1).id)).data().readAt.toDate());
  });
  it('Plan07 rejects 9, 12, 15 and 16 product writes atomically with the current eight-line Rules protocol', async () => {
    const rows = Array.from({ length: 16 }, (_, index) => ({ ...products[0], id: `plan07-bound-${index}` }));
    await env.withSecurityRulesDisabled(async ctx => { const batch = writeBatch(ctx.firestore()); for (const row of rows) batch.set(doc(ctx.firestore(), 'products', row.id), row); await batch.commit(); });
    for (const count of [9, 12, 15, 16]) {
      const input = canonicalSale({ ...payload(`plan07-bound-ticket-${count}`, 1), items: rows.slice(0, count).map(row => ({ ...row, qty: 1 })), total: count * 1.25, amountPaid: count * 1.25 });
      await assertFails(commit({ ...input, atomicProtocol: 2 }));
      assert.equal((await inspect('sales/' + input.saleId)).exists(), false);
      assert.equal((await inspect('products/' + rows[0].id)).data().stock[branchId], 10);
      assert.equal((await inspect('products/' + rows[count - 1].id)).data().stock[branchId], 10);
    }
  });
  it('Plan06 cashier compensates eight lines once with a verified actor and owner evidence read acknowledgements', async () => {
    const rows = Array.from({ length:8 }, (_,i)=>({ ...products[0], id:`cashier-void-${i}` }));
    await env.withSecurityRulesDisabled(async ctx => {
      for (const row of rows) await setDoc(doc(ctx.firestore(),'products',row.id),row);
      await setDoc(doc(ctx.firestore(),'users','manager'), { businessId, role:'dueño', status:'activo' });
    });
    const sale = canonicalSale({ ...payload('plan06-cashier-void',1), items:rows.map(row=>({ ...row,qty:1 })),total:10,amountPaid:10,
      payment:'mixto',splitPayments:{efectivo:4,yape:6} });
    await createSparkSalesRepository(database(), { sdk,currentUser:()=>({uid}) }).submit(sale);
    const original = (await inspect('sales/'+sale.saleId)).data();
    const voids = createPosVoidRepository(database(), { sdk,currentUser:()=>({uid}) });
    const command={saleId:sale.saleId,reason:'Devolución autorizada en sede'};
    await Promise.all([voids.void(command),voids.void(command)]);
    await voids.void(command);
    const compensation=(await inspect('pos_voids/'+sale.saleId)).data();
    assert.equal(compensation.userId,uid); assert.equal(compensation.amount,-10);
    assert.deepEqual((await inspect('sales/'+sale.saleId)).data(),original);
    for(const row of rows) { const p=(await inspect('products/'+row.id)).data(); assert.equal(p.stock[branchId],10); assert.equal(p.posStockVersion[branchId],2); }
    const ownerDb=env.authenticatedContext('manager').firestore();
    const notifications=createNotificationRepository(ownerDb,{sdk});
    const notice=await new Promise((resolve,reject)=>{
      let stop=()=>{}; const timer=setTimeout(()=>{stop();reject(Error('Owner evidence timed out'));},8000);
      stop=notifications.subscribeUnreadNotifications(businessId,'manager',(rows,meta)=>{if(!meta.fromCache&&rows.some(row=>row.sourceId===sale.saleId)){ clearTimeout(timer);stop();resolve(rows.find(row=>row.sourceId===sale.saleId));}},reject,{owner:true});
    });
    assert.equal(notice.metadata.actorId,uid); assert.equal(notice.metadata.reason,command.reason); assert.equal(notice.metadata.amount,10);
    await notifications.markNotificationRead(notice); await notifications.markNotificationRead(notice);
    const ack=(await inspect('notifications/'+notice.id)).data(); assert.equal(ack.authority,'read-marker'); assert.equal(ack.userId,'manager'); assert.equal(ack.amount,undefined);
    const bulk=Array.from({length:30},(_,i)=>({...compensation,id:`bulk-${i}`,saleId:`bulk-${i}`}));
    await env.withSecurityRulesDisabled(async ctx=>{const batch=writeBatch(ctx.firestore());for(const row of bulk) {const {id,...data}=row;batch.set(doc(ctx.firestore(),'pos_voids',id),data);}await batch.commit();});
    await notifications.markAllNotificationsRead(businessId,'manager',bulk.map(row=>projectFinancialNotice('pos-void',row,businessId,'manager')));
    assert.ok((await inspect('notifications/read_pos-void_bulk-29_manager')).exists());
    const marker={...ack,readAt:serverTimestamp()};
    await assertFails(setDoc(doc(database(),'notifications',`read_pos-void_${sale.saleId}_${uid}`),{...marker,userId:uid}));
    await assertFails(setDoc(doc(ownerDb,'notifications',notice.id),{...marker,amount:100}));
    await assertFails(setDoc(doc(ownerDb,'notifications','read_pos-void_absent_manager'),{...marker,sourceId:'absent'}));
    await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'pos_voids','foreign-void'),{...compensation,businessId:'foreign',saleId:'foreign-void'}));
    await assertFails(setDoc(doc(ownerDb,'notifications','read_pos-void_foreign-void_manager'),{...marker,sourceId:'foreign-void'}));
  });
  it('Plan06 owner closes a foreign cash with counting, releases availability, and bars a prepared late sale', async () => {
    await env.withSecurityRulesDisabled(async ctx=>{
      await setDoc(doc(ctx.firestore(),'users','manager'),{businessId,role:'dueño',status:'activo'});
      await setDoc(doc(ctx.firestore(),'users','next-cashier'),{businessId,role:'cajero',branchId,status:'activo'});
    });
    const prepared=payload('plan06-prepared-before-close',2);
    const foreignDb=env.authenticatedContext('next-cashier').firestore();
    const unauthorized=createSparkCashClosingRepository(foreignDb,{sdk,currentUser:()=>({uid:'next-cashier'}),readSales:async()=>[],readPayments:async()=>[]});
    await assert.rejects(unauthorized.close(sessionId,10,''));
    const db=env.authenticatedContext('manager').firestore();
    const closing=createSparkCashClosingRepository(db,{sdk,currentUser:()=>({uid:'manager'}),readSales:async()=>[],readPayments:async()=>[]});
    let released=0;
    const stop=createCashAvailabilityWatcher(foreignDb,{sdk})(businessId,branchId,sessionId,()=>released++,error=>assert.fail(error.message));
    try {
      const closed=await closing.close(sessionId,8,'Faltante declarado tras arqueo');
      assert.equal(closed.closeEstimate.difference,-2);assert.equal(closed.reconciliationPending,true);assert.equal(closed.userId,uid);assert.equal(closed.closedBy,'manager');
      for(let i=0;i<30&&!released;i++) await new Promise(resolve=>setTimeout(resolve,50));
      assert.ok(released);
      await assert.rejects(createSparkSalesRepository(database(),{sdk,currentUser:()=>({uid})}).submit(prepared),{code:'permission-denied'});
      assert.equal((await inspect('sales/'+prepared.saleId)).exists(),false);assert.equal((await inspect('products/bread')).data().stock[branchId],10);
      const opened=await createSparkCashRepository(foreignDb,{sdk,currentUser:()=>({uid:'next-cashier'})}).open({sessionId:'plan06-next-cashier-session',businessId,branchId,openingAmount:10});
      assert.equal(opened.userId,'next-cashier');
      const marker={businessId,userId:'manager',sourceType:'cash-close',sourceId:sessionId,authority:'read-marker',readAt:serverTimestamp()};
      await setDoc(doc(db,'notifications',`read_cash-close_${sessionId}_manager`),marker);
      await assertFails(setDoc(doc(db,'notifications',`read_cash-close_${opened.id}_manager`),{...marker,sourceId:opened.id}));
    } finally {stop();}
  });
  it('Plan06 history reads missing and existing compensation IDs with tenant and cashier branch isolation', async () => {
    const read = (db, business, branch, ids) => new Promise((resolve, reject) => {
      let stop = () => {};
      const timer = setTimeout(() => { stop(); reject(new Error('History listener timed out')); }, 8000);
      stop = createPosVoidReader(db, { sdk }).subscribeIds(business, branch, ids, (rows, meta) => {
        if (!meta.fromCache) { clearTimeout(timer); stop(); resolve(rows); }
      }, error => { clearTimeout(timer); stop(); reject(error); });
    });
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'pos_voids', 'history-existing'), { businessId, branchId, saleId: 'history-existing' });
      await setDoc(doc(ctx.firestore(), 'pos_voids', 'history-other'), { businessId, branchId: 'other', saleId: 'history-other' });
      await setDoc(doc(ctx.firestore(), 'pos_voids', 'history-foreign'), { businessId: 'foreign', branchId, saleId: 'history-foreign' });
    });
    for (const role of ['cajero', 'dueño']) {
      await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', uid), { role }));
      assert.deepEqual(await read(database(), businessId, branchId, ['history-missing']), []);
      assert.equal((await read(database(), businessId, branchId, ['history-existing', 'history-missing']))[0].saleId, 'history-existing');
    }
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', uid), { role: 'cajero' }));
    await assert.rejects(read(database(), businessId, 'other', ['history-other']), { code: 'permission-denied' });
    await assert.rejects(read(database(), 'foreign', branchId, ['history-foreign']), { code: 'permission-denied' });
  });
  it('Plan06 remote Rules reject excessive cash, precision, totals and quantities through both protocols without partial stock', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'products', 'bread'), { price: 22, stock: { [branchId]: 5000, other: 7 } }));
    const make = (id, price = 22, qty = 1) => canonicalSale({ localId: id, businessId, branchId, userId: uid, sessionId,
      items: [{ ...products[0], price, qty }], total: price * qty, payment: 'efectivo', amountPaid: price * qty, change: 0, createdAt: '2026-10-29T12:00:00Z' });
    for (const atomicProtocol of [undefined, 2]) {
      for (const [index, changes] of [
        { amountPaid: 2000000000, change: 1999999978 }, { amountPaid: 1000000000, change: 999999978 },
        { amountPaid: 50000.01, change: 49978.01 }, { amountPaid: 22.001, change: 0.001 },
        { amountPaid: -22, change: -44 }, { payment: 'mixto', splitPayments: { efectivo: 19.40, yape: 2.602345 } },
        { payment: 'mixto', splitPayments: { efectivo: 19.40, yape: 2.59 } },
      ].entries()) {
        const sale = { ...make(`plan06-bad-${atomicProtocol ?? 1}-${index}`), ...(atomicProtocol ? { atomicProtocol } : {}), ...changes };
        await assertFails(commit(sale));
        assert.equal((await inspect(`sales/${sale.saleId}`)).exists(), false);
        if (atomicProtocol) assert.equal((await inspect(`pos_sale_groups/${sale.saleId}_0`)).exists(), false);
      }
    }
    assert.equal((await inspect('products/bread')).data().stock[branchId], 5000);
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'products', 'bread'), { price: 50000.01 }));
    for (const atomicProtocol of [undefined, 2]) await assertFails(commit({ ...make(`plan06-total-${atomicProtocol ?? 1}`, 50000.01), ...(atomicProtocol ? { atomicProtocol } : {}) }));
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'products', 'bread'), { price: 1 }));
    for (const atomicProtocol of [undefined, 2]) {
      await assertFails(commit({ ...make(`plan06-quantity-${atomicProtocol ?? 1}`, 1, 1001), ...(atomicProtocol ? { atomicProtocol } : {}) }));
    }
    assert.equal((await inspect('products/bread')).data().stock[branchId], 5000);
    await commit({ ...make('plan06-quantity-boundary', 1, 1000), atomicProtocol: 2 });
    assert.equal((await inspect('products/bread')).data().stock[branchId], 4000);
  });
  it('Plan06 confirms valid cash/change and exact mixed cents, and recovers a historical oversized receipt without new writes', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'products', 'bread'), { price: 22 }));
    const repo = createSparkSalesRepository(database(), { sdk, currentUser: () => ({ uid }) });
    const cash = canonicalSale({ ...payload('plan06-cash', 1), items: [{ ...payload('template', 1).items[0], price: 22 }], total: 22, amountPaid: 50, change: 28 });
    for (const amountPaid of [2000000000, 1000000000]) await assert.rejects(repo.submit({ ...cash, amountPaid, change: amountPaid - 22 }), { code: 'invalid-sale' });
    await repo.submit(cash); await repo.submit(cash);
    assert.equal((await inspect('products/bread')).data().stock[branchId], 9);
    const historic = canonicalSale({ ...cash, saleId: 'plan06-historical', localId: 'plan06-historical', idempotencyKey: 'plan06-historical', amountPaid: 1000000000, change: 999999978 });
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'sales', historic.saleId), { ...historic, atomicProtocol: 2, status: 'confirmed', confirmedAt: Timestamp.now(), stockVersions: { bread: 1 }, productIds: ['bread'] }));
    assert.equal((await repo.verify(historic)).status, 'ALREADY_APPLIED');
    await repo.submit(historic);
    assert.equal((await inspect('products/bread')).data().stock[branchId], 9);
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'products', 'bread'), { price: 6 }));
    const mixed = canonicalSale({ ...cash, saleId: 'plan06-mixed', localId: 'plan06-mixed', idempotencyKey: 'plan06-mixed', items: [{ ...cash.items[0], price: 6 }], total: 6,
      payment: 'mixto', amountPaid: 6, change: 0, splitPayments: { efectivo: 3.40, yape: 2.60 } });
    await assert.rejects(repo.submit({ ...mixed, splitPayments: { efectivo: 3.40, yape: 2.602345 } }), { code: 'invalid-sale' });
    await repo.submit(mixed); await repo.submit(mixed);
    assert.equal((await inspect('products/bread')).data().stock[branchId], 8);
    assert.equal((await inspect('sales/' + mixed.saleId)).data().splitPayments.yape, 2.60);
  });
  it('Plan05 refuses financial writes in the reserved global read-only context even if historical documents exist', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      await updateDoc(doc(db, 'users', uid), { role: 'dueño' });
      await setDoc(doc(db, 'branches', 'global'), { businessId, status: 'activo', sparkCashVersion: 1 });
      await updateDoc(doc(db, 'cash_sessions', sessionId), { branchId: 'global' });
      await setDoc(doc(db, 'active_cash_sessions', createHash('sha256').update(JSON.stringify([businessId, 'global'])).digest('hex')), {
        businessId, branchId: 'global', userId: uid, sessionId, runtime: 'spark', status: 'open',
      });
      for (const row of products.slice(0, 2)) await updateDoc(doc(db, 'products', row.id), { stock: { ...row.stock, global: 10 } });
    });
    await assertFails(commit({ ...payload('plan05-reserved-global', 2), branchId: 'global' }));
    assert.equal((await inspect('sales/plan05-reserved-global')).exists(), false);
    assert.equal((await inspect('products/bread')).data().stock.global, 10);
  });
  it('Plan05 compensates an eight-product mixed ticket once and preserves the immutable original', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ ...products[0], id: `void-${i}` }));
    await env.withSecurityRulesDisabled(async ctx => {
      await updateDoc(doc(ctx.firestore(), 'users', uid), { role: 'dueño' });
      for (const row of rows) await setDoc(doc(ctx.firestore(), 'products', row.id), row);
    });
    const repo = createSparkSalesRepository(database(), { sdk, protocolVersion: 2, currentUser: () => ({ uid }) });
    const sale = canonicalSale({ localId: 'plan05-void-eight', businessId, branchId, userId: uid, sessionId,
      items: rows.map(row => ({ ...row, qty: 1 })), total: 10, amountPaid: 10, change: 0, payment: 'mixto',
      splitPayments: { efectivo: 4, yape: 6 }, createdAt: '2026-10-26T12:00:00.000Z' }, rows);
    await repo.submit(sale);
    const before = (await inspect('sales/' + sale.saleId)).data();
    const voids = createPosVoidRepository(database(), { sdk, currentUser: () => ({ uid }) });
    const command = { saleId: sale.saleId, reason: 'Devolución de prueba' };
    await Promise.all([voids.void(command), voids.void(command)]);
    const result = await voids.void(command);
    assert.equal(result.amount, -10); assert.equal(result.cashAmount, -4); assert.equal(result.digitalAmount, -6);
    assert.deepEqual((await inspect('sales/' + sale.saleId)).data(), before);
    for (const row of rows) {
      const saved = (await inspect('products/' + row.id)).data();
      assert.equal(saved.stock[branchId], 10); assert.equal(saved.stock.other, 7); assert.equal(saved.posStockVersion[branchId], 2);
    }
    await assert.rejects(voids.void({ ...command, reason: 'Una segunda devolución' }), { code: 'sale-conflict' });
    await assertFails(updateDoc(doc(database(), 'pos_voids', sale.saleId), { amount: -20 }));
    await assertFails(updateDoc(doc(database(), 'sales', sale.saleId), { voided: true }));
    const reader = createPosVoidReader(database(), { sdk });
    const period = reportPeriod('hoy'), from = new Date(Date.now() - 60000), to = new Date(Date.now() + 60000);
    const [refunds, receipts] = await Promise.all([reader.inPeriod(businessId, from, to, branchId),
      createSalesPeriodReader(database(), { sdk })(businessId, from, to, { branchId })]);
    const model = aggregateReport({ sales: receipts, voids: refunds, businessId, branchId, period });
    assert.equal(model.summary.netRevenue, 0); assert.equal(model.summary.posCash, 0); assert.equal(model.summary.posDigital, 0);
    assert.equal(model.summary.contractRevenue, 0); assert.equal(model.summary.voidedTicketCount, 1);
    assert.ok(model.products.every(row => row.qty === 0 && row.revenue === 0));
    const XLSX = createRequire(new URL('../frontend/package.json', import.meta.url))('xlsx-js-style');
    const workbook = buildSalesWorkbook(XLSX, { period, sales: receipts, voids: refunds, businessId, branchId }).workbook;
    const copy = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
    assert.ok(copy.SheetNames.filter(name => name.startsWith('Detalle_'))
      .some(name => {
        const sheet = copy.Sheets[name], header = XLSX.utils.decode_range(sheet['!autofilter'].ref).s.r;
        return XLSX.utils.sheet_to_json(sheet, { range: header }).some(row => row.Movimiento === 'COMPENSACIÓN POS' && row['Importe movimiento (S/)'] === -10);
      }));
    assert.ok(XLSX.utils.sheet_to_json(copy.Sheets.Resumen_Financiero).some(row => row.Concepto === 'Alcance de las compensaciones POS' && row.Valor.includes('sin evidencia de desembolso físico')));
    await assertFails(reader.inPeriod('foreign', from, to, branchId));
    const adjustedStock = { [branchId]: 11, other: 7 };
    await env.withSecurityRulesDisabled(async ctx => {
      for (let index = 0; index < 4; index++) {
        const id = `catalog-extra-${index}`; adjustedStock[id] = 1;
        await setDoc(doc(ctx.firestore(), 'branches', id), { businessId, status: 'activo' });
      }
    });
    await updateDoc(doc(database(), 'products', rows[0].id), { stock: adjustedStock });
    assert.deepEqual((await inspect('products/' + rows[0].id)).data().stock, adjustedStock);
    const close = createSparkCashClosingRepository(database(), { sdk, currentUser: () => ({ uid }),
      readSales: createSalesSessionReader(database(), { sdk }), readPayments: async session => voidCashPayments(await reader.bySession(session)) });
    assert.equal((await close.close(sessionId, 10)).status, 'closed');
  });
  it('Plan05 void Rules reject false refunds, omitted stock/proofs, foreign scope, cashier escalation and expired cash', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', uid), { role: 'dueño' }));
    const sale = payload('plan05-void-negative', 2);
    await createSparkSalesRepository(database(), { sdk, protocolVersion: 2, currentUser: () => ({ uid }) }).submit(sale);
    const command = { saleId: sale.saleId, reason: 'Devolución rechazada' };
    for (const mutate of [
      (path, data) => path.startsWith('pos_voids/') ? { ...data, cashAmount: -99 } : data,
      (path, data) => path.startsWith('pos_voids/') ? { ...data, amount: -99 } : data,
      (path, data) => path.startsWith('pos_voids/') ? { ...data, businessId: 'foreign' } : data,
      (path, data) => path.startsWith('pos_voids/') ? { ...data, reason: '' } : data,
      (path, data) => path.startsWith('pos_void_groups/') ? null : data,
      (path, data) => path === 'products/bread' ? null : data,
      (path, data) => path.startsWith('products/') ? { ...data, stock: { ...data.stock, [branchId]: 11 } } : data,
      (path, data) => path.startsWith('products/') ? { ...data, stock: { ...data.stock, other: 0 } } : data,
    ]) {
      const injected = { ...sdk, runTransaction: (db, work) => sdk.runTransaction(db, tx => work({ get: ref => tx.get(ref),
        set: (ref, data) => { const changed = mutate(ref.path, data); if (changed) tx.set(ref, changed); },
        update: (ref, data) => { const changed = mutate(ref.path, data); if (changed) tx.update(ref, changed); },
      })) };
      await assert.rejects(createPosVoidRepository(database(), { sdk: injected, currentUser: () => ({ uid }) }).void(command), { code: 'permission-denied' });
      assert.equal((await inspect('pos_voids/' + sale.saleId)).exists(), false);
      assert.equal((await inspect('products/bread')).data().stock[branchId], 9);
    }
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', uid), { role: 'cajero', branchId: 'other' }));
    const forgedProfileSDK = { ...sdk, runTransaction: (db, work) => sdk.runTransaction(db, tx => work({
      get: async ref => { const saved = await tx.get(ref); return ref.path === `users/${uid}` ? { data: () => ({ ...saved.data(), role: 'dueño' }) } : saved; },
      set: (ref, data) => tx.set(ref, data), update: (ref, data) => tx.update(ref, data),
    })) };
    await assert.rejects(createPosVoidRepository(database(), { sdk: forgedProfileSDK, currentUser: () => ({ uid }) }).void(command), { code: 'permission-denied' });
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', uid), { role: 'dueño' }));
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'cash_sessions', sessionId), { durationHours: 10, openedAt: Timestamp.fromMillis(Date.now() - 11 * 3600000) }));
    await assert.rejects(createPosVoidRepository(database(), { sdk, currentUser: () => ({ uid }) }).void(command), { code: 'permission-denied' });
    assert.equal((await inspect('pos_voids/' + sale.saleId)).exists(), false);
  });
  it('Plan05 groups 3, 5 and 8 products in one indivisible receipt', async () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({ ...products[0], id: `group-${index}` }));
    await env.withSecurityRulesDisabled(async ctx => {
      for (const row of rows) await setDoc(doc(ctx.firestore(), 'products', row.id), row);
    });
    const repository = createSparkSalesRepository(database(), { sdk, protocolVersion: 2, currentUser: () => ({ uid }) });
    for (const count of [3, 5, 8]) {
      const total = count * 1.25;
      const sale = canonicalSale({ localId: `plan05-group-${count}`, businessId, branchId, userId: uid, sessionId,
        items: rows.slice(0, count).map(row => ({ ...row, qty: 1 })), total, payment: 'mixto', amountPaid: total, change: 0,
        splitPayments: { efectivo: 1.25, yape: total - 1.25 }, createdAt: '2026-10-26T12:00:00.000Z' }, rows);
      await assert.doesNotReject(repository.submit(sale), `grouped ticket with ${count} products`);
      await repository.submit(sale);
      assert.equal((await inspect('sales/' + sale.saleId)).data().items.length, count);
    }
    assert.equal((await inspect('products/group-0')).data().stock[branchId], 7);
  });
  it('Plan05 grouped Rules reject incomplete proofs, altered prices, foreign stock and concurrent oversell', async () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({ ...products[0], id: `proof-${index}` }));
    await env.withSecurityRulesDisabled(async ctx => { for (const row of rows) await setDoc(doc(ctx.firestore(), 'products', row.id), row); });
    const command = id => canonicalSale({ localId: id, businessId, branchId, userId: uid, sessionId,
      items: rows.map(row => ({ ...row, qty: 1 })), total: 10, payment: 'mixto', amountPaid: 10, change: 0,
      splitPayments: { efectivo: 4, yape: 6 }, createdAt: '2026-10-26T12:00:00.000Z' }, rows);
    const mutations = [
      (path, data) => path.startsWith('pos_sale_groups/') && data.index === 1 ? null : data,
      (path, data) => path === 'products/proof-7' ? null : data,
      (path, data) => path.startsWith('pos_sale_groups/') ? { ...data, totalCents: data.totalCents + 1 } : data,
      (path, data) => path.startsWith('sales/') ? { ...data, privileged: true } : data,
      (path, data) => path.startsWith('sales/') ? { ...data, items: data.items.map((line, i) => i ? line : { ...line, price: 0 }) } : data,
      (path, data) => path.startsWith('products/') ? { ...data, stock: { ...data.stock, other: 0 } } : data,
      (path, data) => path.startsWith('products/') ? { ...data, posSaleLineIndex: 8 } : data,
      (path, data) => path.startsWith('notifications/') ? { ...data, title: 'Forged notice' } : data,
    ];
    for (const [index, mutate] of mutations.entries()) {
      const id = `plan05-proof-negative-${index}`;
      const injected = { ...sdk, runTransaction: (db, work) => sdk.runTransaction(db, tx => work({
        get: ref => tx.get(ref), set: (ref, data) => { const changed = mutate(ref.path, data); if (changed) tx.set(ref, changed); },
        update: (ref, data) => { const changed = mutate(ref.path, data); if (changed) tx.update(ref, changed); },
      })) };
      const repository = createSparkSalesRepository(database(), { sdk: injected, protocolVersion: 2, currentUser: () => ({ uid }) });
      await assert.rejects(repository.submit(command(id)), { code: 'permission-denied' });
      for (const path of [`sales/${id}`, `notifications/sale_${id}`, `pos_sale_groups/${id}_0`, `pos_sale_groups/${id}_1`]) assert.equal((await inspect(path)).exists(), false);
      for (const row of rows) assert.equal((await inspect('products/' + row.id)).data().stock[branchId], 10);
    }
    await env.withSecurityRulesDisabled(async ctx => { for (const row of rows) await updateDoc(doc(ctx.firestore(), 'products', row.id), { stock: { [branchId]: 1, other: 7 } }); });
    const repository = createSparkSalesRepository(database(), { sdk, protocolVersion: 2, currentUser: () => ({ uid }) });
    const race = await Promise.allSettled(['plan05-proof-race-a', 'plan05-proof-race-b'].map(id => repository.submit(command(id))));
    assert.equal(race.filter(row => row.status === 'fulfilled').length, 1);
    for (const row of rows) assert.equal((await inspect('products/' + row.id)).data().stock[branchId], 0);
    for (const count of [9, 12]) {
      const draftRows = Array.from({ length: count }, (_, i) => ({ ...rows[0], id: `over-${i}`, qty: 1 }));
      await assert.rejects(repository.submit({ ...command('plan05-over-limit'), items: draftRows, total: count * 1.25, amountPaid: count * 1.25,
        payment: 'yape' }), { code: 'invalid-sale' });
    }
  });
  it('Plan05 preserves an uncertain committed ticket and removes projection only after a definitive Rules rejection', async () => {
    const rows = new Map();
    const store = { get: async id => rows.get(id), list: async () => [...rows.values()],
      insert: async (row, existing) => rows.has(row.localId) ? existing(rows.get(row.localId)) : rows.set(row.localId, row),
      update: async (id, changes) => Object.assign(rows.get(id), changes) };
    let loseReceipt = true, denyReceipt = false;
    const repository = createSparkSalesRepository(database(), { currentUser: () => ({ uid }), sdk: { ...sdk,
      getDocFromServer: async ref => { if (loseReceipt || denyReceipt) { loseReceipt = false; throw Object.assign(new Error('Receipt denied'), { code: 'permission-denied' }); } return sdk.getDocFromServer(ref); } } });
    const identity = { uid, businessId };
    const queue = createSaleQueue({ store, encrypt, decrypt, online: () => true, currentIdentity: () => true,
      withLock: work => work(), syncSessions: async () => new Map(), apply: sale => repository.submit(sale), verifyReceipt: sale => repository.verify(sale) });
    const sale = payload('plan05-uncertain', 2), result = await queue.submit(sale, identity, { isolated: true });
    assert.equal(result.success, false); assert.equal(result.pending, true);
    assert.equal(rows.get(sale.saleId).status, 'pending'); assert.equal(rows.get(sale.saleId).projectionState, 'pending');
    assert.equal((await inspect('products/bread')).data().stock[branchId], 9);
    const ciphertext = rows.get(sale.saleId).data;
    denyReceipt = true;
    await queue.flush(identity, { forceId: sale.saleId, onlyId: sale.saleId });
    assert.equal(rows.get(sale.saleId).requiresReceiptReview, true); assert.equal(rows.get(sale.saleId).data, ciphertext);
    denyReceipt = false;
    await queue.flush(identity, { forceId: sale.saleId, onlyId: sale.saleId });
    assert.equal(rows.get(sale.saleId).status, 'synced'); assert.equal(rows.get(sale.saleId).financialAck, true);
    assert.equal((await inspect('products/bread')).data().stock[branchId], 9);
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'cash_sessions', sessionId), { status: 'closed' }));
    const rejected = payload('plan05-rejected', 2);
    await assert.rejects(queue.submit(rejected, identity, { isolated: true }), { code: 'sale-failed' });
    assert.equal(rows.get(rejected.saleId).status, 'failed'); assert.equal(rows.get(rejected.saleId).projectionState, null);
    assert.equal((await inspect('sales/' + rejected.saleId)).exists(), false);
    assert.equal((await inspect('notifications/sale_' + rejected.saleId)).exists(), false);
    assert.equal((await inspect('products/bread')).data().stock[branchId], 9);
  });
  it('Plan05 reproduces the complete S/16 mixed ticket with two products and its notification', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', uid), { role: 'dueño' }));
    const rows = products.slice(0, 2).map((row, index) => ({ ...row, price: index ? 12 : 4 }));
    await env.withSecurityRulesDisabled(async ctx => {
      for (const row of rows) await updateDoc(doc(ctx.firestore(), 'products', row.id), { price: row.price });
    });
    const repository = createSparkSalesRepository(database(), { sdk, protocolVersion: 1, currentUser: () => ({ uid }) });
    const sale = canonicalSale({ localId: 'plan05-mixed-16', businessId, branchId, userId: uid, sessionId,
      items: rows.map(row => ({ ...row, qty: 1 })), total: 16, payment: 'mixto',
      splitPayments: { efectivo: 4, yape: 12 }, amountPaid: 16, change: 0, origin: 'online',
      createdAt: '2026-10-26T12:00:00.000Z' }, rows);
    await assert.doesNotReject(Promise.all([repository.submit(sale), repository.submit(sale)]), 'simultaneous initial owner mixed commit');
    await repository.submit(sale);
    assert.equal((await inspect('sales/' + sale.saleId)).data().total, 16);
    assert.equal((await inspect('notifications/sale_' + sale.saleId)).data().sourceId, sale.saleId);
    for (const row of rows) {
      const saved = (await inspect('products/' + row.id)).data();
      assert.equal(saved.stock[branchId], 9); assert.equal(saved.stock.other, 7);
      assert.equal(saved.posStockVersion[branchId], 1);
    }
    for (const count of [1, 2]) for (const payment of ['efectivo', 'yape', 'mixto']) {
      const items = rows.slice(0, count).map(row => ({ ...row, qty: 1 })), total = items.reduce((sum, row) => sum + row.price, 0);
      const command = canonicalSale({ ...sale, localId: `plan05-${count}-${payment}`, saleId: `plan05-${count}-${payment}`,
        idempotencyKey: `plan05-${count}-${payment}`, items, total, payment, amountPaid: total, change: 0,
        ...(payment === 'mixto' ? { splitPayments: { efectivo: 4, yape: total - 4 } } : {}) }, rows);
      await assert.doesNotReject(repository.submit(command), `${count} products, ${payment}`);
      assert.equal((await inspect('notifications/sale_' + command.saleId)).data().userId, uid);
    }
  });
  it('confirms a complete two-product ticket within Rules limits and retries without a second debit', async () => {
    const sale = payload('ticket-two', 2); await commit(sale); const first = (await inspect('sales/ticket-two')).data();
    assert.ok(first.confirmedAt instanceof Timestamp);
    await commit(sale);
    for (const product of products.slice(0, 2)) { const saved = (await inspect(`products/${product.id}`)).data(); assert.equal(saved.stock[branchId], 9); assert.equal(saved.stock.other, 7); assert.equal(saved.posStockVersion.other, 41); assert.equal(saved.posStockVersion[branchId], 1); }
    await assert.rejects(commit({ ...sale, cashierName: 'Different operation' }), /operation-conflict/);
  });
  it('rejects manipulated price, cost, total, payment and extra/inconsistent lines', async () => {
    const sale = payload('bad-ticket', 2);
    for (const mutate of [d => ({ ...d, items: d.items.map((item, i) => i ? item : { ...item, price: 0.25 }) }),
      d => ({ ...d, items: d.items.map(item => ({ ...item, cost: 0 })) }), d => ({ ...d, total: 0.25 }), d => ({ ...d, amountPaid: 0 }),
      d => ({ ...d, productIds: ['bread', 'bread'] }), d => ({ ...d, items: d.items.slice(0, 1) }), d => ({ ...d, origin: 'offline' })]) await assertFails(commit(sale, { mutate }));
    await assertFails(commit(payload('too-many', 3)));
    const db = database(), batch = writeBatch(db);
    batch.update(doc(db, 'products', 'bread'), { price: 0.25, stock: { [branchId]: 9 }, posLastSaleId: sale.saleId, posStockVersion: 1 });
    batch.set(doc(db, 'sales', sale.saleId), { ...sale, productIds: ['bread', 'cake'], confirmedAt: serverTimestamp(), status: 'confirmed' });
    await assertFails(batch.commit());
  });
  it('validates canonical cents, costs and cash/change, Yape and mixed payments on bounded tickets', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'products', 'bread'), { price: 0.29 }));
    const base = payload('decimal-cash', 2);
    base.items[0].price = 0.29;
    base.total = 2.54; base.amountPaid = 5; base.change = 2.46; base.grossProfit = 2.04;
    await commit(base);
    const yape = { ...base, saleId: 'decimal-yape', localId: 'decimal-yape', idempotencyKey: 'decimal-yape', payment: 'yape', amountPaid: 2.54, change: 0 };
    await commit(yape);
    const mixed = { ...yape, saleId: 'decimal-mixed', localId: 'decimal-mixed', idempotencyKey: 'decimal-mixed', payment: 'mixto', splitPayments: { efectivo: 1.25, yape: 1.29 } };
    await commit(mixed);
    await assertFails(commit({ ...mixed, saleId: 'bad-mixed', localId: 'bad-mixed', idempotencyKey: 'bad-mixed', splitPayments: { efectivo: 1, yape: 1 } }));
    assert.equal((await inspect('products/bread')).data().stock[branchId], 7);
  });
  it('rejects foreign tenant/branch/session and a revoked license', async () => {
    const sale = payload('foreign-ticket', 2);
    for (const value of [{ businessId: 'foreign' }, { branchId: 'other' }, { sessionId: 'other-session' }, { userId: 'other-user' }]) await assertFails(commit({ ...sale, ...value }));
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'licenses', businessId), { status: 'inactiva' }));
    await assertFails(commit(sale));
  });
  it('rejects partial writes and negative stock atomically, leaving every product and receipt intact', async () => {
    const sale = payload('partial-ticket', 2);
    await assertFails(commit(sale, { omitProduct: 'cake' }));
    await assertFails(commit(sale, { receipt: false }));
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'products', 'cake'), { stock: { [branchId]: 0, other: 7 } }));
    await assertFails(commit(sale));
    assert.equal((await inspect('products/bread')).data().stock[branchId], 10);
    assert.equal((await inspect('products/cake')).data().stock[branchId], 0);
    assert.equal((await inspect('sales/partial-ticket')).exists(), false);
  });
  it('serializes concurrent tickets on the last units with no oversell or duplicate receipts', async () => {
    await env.withSecurityRulesDisabled(async ctx => { for (const product of products.slice(0, 2)) await updateDoc(doc(ctx.firestore(), 'products', product.id), { stock: { [branchId]: 1, other: 7 } }); });
    const results = await Promise.allSettled([commit(payload('race-one', 2)), commit(payload('race-two', 2))]);
    assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
    for (const product of products.slice(0, 2)) assert.equal((await inspect(`products/${product.id}`)).data().stock[branchId], 0);
    const receipts = await Promise.all(['race-one', 'race-two'].map(id => inspect(`sales/${id}`)));
    assert.equal(receipts.filter(snapshot => snapshot.exists()).length, 1);
  });
  it('confirms through the native repository; replay, foreign identity and changed input cannot debit twice', async () => {
    const repository = createSparkSalesRepository(database(), { sdk, currentUser: () => ({ uid }) });
    const sale = payload('native-ticket', 2);
    const ack = await repository.submit(sale); assert.deepEqual(ack.stockVersions, { bread: 1, cake: 1 });
    await repository.submit(sale);
    await assert.rejects(repository.submit({ ...sale, total: 99 }));
    await assert.rejects(repository.submit({ ...sale, userId: 'foreign' }));
    assert.equal((await inspect('products/bread')).data().stock[branchId], 9);
  });
  it('links contract advance, later payment, delivery and aggregate-method refunds atomically with idempotence', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', uid), { role: 'dueño' }));
    const contracts = createSparkContractsRepository(database(), { sdk, currentUser: () => ({ uid }) });
    const contractId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const command = { contractId, operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', branchId,
      clientName: 'Cliente sintético', subtotal: 20, deliveryCost: 0, total: 20,
      initialPayment: { operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', amount: 5, method: 'efectivo' } };
    await contracts.create(command); await contracts.create(command);
    await assert.rejects(contracts.create({ ...command, contractId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }));
    const installment = { contractId, branchId, operationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', amount: 3, method: 'yape' };
    await contracts.addPayment(installment); await contracts.addPayment(installment);
    await assert.rejects(contracts.addPayment({ ...installment, amount: 4 }));
    await contracts.deliver(contractId);
    assert.equal((await inspect(`contracts/${contractId}`)).data().status, 'entregado_con_deuda');
    const cancel = { contractId, branchId, operationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', reason: 'Prueba de devolución' };
    await contracts.cancel(cancel); await contracts.cancel(cancel);
    const saved = (await inspect(`contracts/${contractId}`)).data();
    assert.equal(saved.paidTotal, 0); assert.equal(saved.balance, 0); assert.equal(saved.status, 'cancelado');
    const periodContracts = await createContractPeriodReader(database(), { sdk })(businessId, new Date(Date.now() - 60000), new Date(Date.now() + 60000), branchId);
    assert.equal(periodContracts.length, 1); assert.equal(periodContracts[0].status, 'cancelado');
    assert.equal((await inspect(`payments/${cancel.operationId}_efectivo`)).data().amount, -5);
    assert.equal((await inspect(`payments/${cancel.operationId}_yape`)).data().amount, -3);
    await assertFails(updateDoc(doc(database(), 'payments', installment.operationId), { amount: 99 }));
    await assertFails(updateDoc(doc(database(), 'contracts', contractId), { paidTotal: 100 }));
  });
  it('P17 isolates complete contracts by origin and permits only the minimal, bounded pickup projection', async () => {
    const b = 'p17-branch-b', c = 'p17-branch-c';
    await env.withSecurityRulesDisabled(async ctx => {
      const batch = writeBatch(ctx.firestore());
      for (const id of [b, c]) {
        batch.set(doc(ctx.firestore(), 'branches', id), { businessId, status: 'activo', sparkCashVersion: 1 });
        batch.set(doc(ctx.firestore(), 'users', id), { businessId, branchId: id, role: 'cajero', status: 'activo' });
      }
      batch.set(doc(ctx.firestore(), 'users', 'p17-owner'), { businessId, role: 'dueño', status: 'activo' });
      batch.set(doc(ctx.firestore(), 'users', 'p17-foreign'), { businessId: 'foreign', role: 'dueño', status: 'activo' });
      batch.set(doc(ctx.firestore(), 'users', 'p17-admin'), { businessId: 'platform-admin', role: 'superadmin', status: 'activo' });
      batch.set(doc(ctx.firestore(), 'contracts', 'p17-historical-b'), { businessId, branchId: b, clientName: 'Histórico B', status: 'pendiente' });
      batch.set(doc(ctx.firestore(), 'contracts', 'p17-legacy-cross'), { businessId, branchId, deliveryType: b, clientName: 'Legado A', status: 'pendiente' });
      await batch.commit();
    });
    const aDb = database(), bDb = env.authenticatedContext(b).firestore(), cDb = env.authenticatedContext(c).firestore();
    const ownerDb = env.authenticatedContext('p17-owner').firestore();
    const repo = createSparkContractsRepository(aDb, { sdk, currentUser: () => ({ uid }) });
    const repoB = createSparkContractsRepository(bDb, { sdk, currentUser: () => ({ uid: b }) });
    const first = 'a1170001-1111-4111-8111-111111111111', cross = 'a1170002-1111-4111-8111-111111111111';
    const input = { branchId, clientName: 'Cliente reservado', clientPhone: '999123456', details: 'Contenido reservado',
      subtotal: 40, total: 40, deliveryCost: 0 };
    const invalid = 'a1170003-1111-4111-8111-111111111111';
    await assert.rejects(repo.create({ ...input, contractId: invalid, operationId: crypto.randomUUID(), deliveryType: 'no-existe' }));
    assert.equal((await inspect('contracts/' + invalid)).exists(), false);
    await repo.create({ ...input, contractId: first, operationId: crypto.randomUUID(), deliveryType: branchId });
    const command = { ...input, contractId: cross, operationId: crypto.randomUUID(), deliveryType: b,
      initialPayment: { operationId: crypto.randomUUID(), amount: 5, method: 'efectivo' } };
    await repo.create(command); await repo.create(command);
    await assertFails(getDoc(doc(aDb, 'contracts', 'p17-historical-b')));
    await assertFails(getDoc(doc(bDb, 'contracts', first)));
    await assertFails(getDoc(doc(bDb, 'contracts', 'p17-legacy-cross')));
    await assertFails(getDoc(doc(bDb, 'contracts', cross)));
    await assertFails(getDoc(doc(bDb, 'payments', command.initialPayment.operationId)));
    const contracts = (db, branch) => sdk.getDocs(sdk.query(sdk.collection(db, 'contracts'),
      sdk.where('businessId', '==', businessId), ...(branch ? [sdk.where('branchId', '==', branch)] : []), sdk.limit(100)));
    assert.equal((await contracts(aDb, branchId)).size, 3);
    assert.equal((await contracts(bDb, b)).size, 1);
    assert.equal((await contracts(ownerDb)).size, 4);
    await assertFails(contracts(aDb));
    await assertFails(contracts(bDb, branchId));
    for (const actor of ['p17-admin','p17-foreign','p17-invited']) await assertFails(contracts(env.authenticatedContext(actor).firestore()));
    const pickups = (db, branch, size = 51) => sdk.getDocs(sdk.query(sdk.collection(db, 'contract_pickups'),
      sdk.where('businessId', '==', businessId), sdk.where('pickupBranchId', '==', branch), sdk.orderBy('deliveryDate'), sdk.orderBy(sdk.documentId()), sdk.limit(size)));
    const view = await pickups(bDb, b);
    assert.equal(view.size, 1);
    assert.deepEqual(view.docs[0].data(), { businessId, originBranchId: branchId, pickupBranchId: b, contractNumber: 'PED-A1170002', deliveryDate: null });
    await assertFails(pickups(bDb, b, 52));
    await assertFails(getDoc(doc(cDb, 'contract_pickups', cross)));
    await assertFails(updateDoc(doc(bDb, 'contract_pickups', cross), { clientPhone: input.clientPhone }));
    await assertFails(updateDoc(doc(bDb, 'contracts', cross), { deliveryType: b, paidTotal: 0 }));
    await assert.rejects(repoB.addPayment({ contractId: cross, branchId: b, operationId: crypto.randomUUID(), amount: 1, method: 'yape' }));
    await assert.rejects(repoB.cancel({ contractId: cross, branchId: b, operationId: crypto.randomUUID(), reason: 'No permitido' }));
    await assert.rejects(repoB.deliver(cross));
    await assertFails(updateDoc(doc(aDb, 'contracts', cross), { deliveryType: c, updatedAt: serverTimestamp() }));
    const reassignment = await Promise.allSettled([repo.update(cross, { deliveryType: c }), repoB.deliver(cross)]);
    assert.deepEqual(reassignment.map(result => result.status), ['fulfilled', 'rejected']);
    assert.equal((await pickups(bDb, b)).size, 0);
    assert.equal((await pickups(cDb, c)).size, 1);
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'branches', c), { status: 'inactivo' }));
    await assertFails(pickups(cDb, c));
    await assert.rejects(repo.update(cross, { deliveryDate: new Date(Date.now() + 3600000).toISOString() }));
    await repo.deliver(cross);
    assert.equal((await inspect('contract_pickups/' + cross)).data().pickupBranchId, null);
    assert.equal((await inspect('contracts/' + cross)).data().paidTotal, 5);
    assert.equal((await inspect('payments/' + command.initialPayment.operationId)).data().branchId, branchId);
    await assert.rejects(repo.update(cross, { deliveryType: b }));
    // Synthetic backlog only for exercising the query budget. The transaction checks are above.
    await env.withSecurityRulesDisabled(async ctx => {
      const batch = writeBatch(ctx.firestore());
      for (let i = 0; i < 101; i++) batch.set(doc(ctx.firestore(), 'contract_pickups', 'backlog-' + i), {
        businessId, originBranchId: branchId, pickupBranchId: b, contractNumber: 'PED-ABCD0000', deliveryDate: null,
      });
      await batch.commit();
    });
    const backlog = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { stop(); reject(new Error('Agenda de recojos sin confirmar.')); }, 8000);
      const stop = createContractQueryRepository(bDb, { sdk }).subscribeContractPickups(businessId, b, (rows, info) => {
        if (!info.fromCache) { clearTimeout(timeout); stop(); resolve({ rows, info }); }
      }, error => { clearTimeout(timeout); stop(); reject(error); });
    });
    assert.equal(backlog.rows.length, 50);
    assert.equal(backlog.info.limited, true);
  });
  it('P17 permits the owner to close the cashier shift from its physical branch even outside cashier hours', async () => {
    const minutes = (new Date().getUTCHours() * 60 + new Date().getUTCMinutes() + 1140) % 1440;
    const hhmm = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
    await env.withSecurityRulesDisabled(async ctx => {
      await updateDoc(doc(ctx.firestore(), 'users', uid), { shiftStart: hhmm((minutes + 120) % 1440), shiftEnd: hhmm((minutes + 180) % 1440) });
      await setDoc(doc(ctx.firestore(), 'users', 'p17-owner'), { businessId, role: 'dueño', status: 'activo' });
      await updateDoc(doc(ctx.firestore(), 'cash_sessions', sessionId), { durationHours: 14 });
    });
    const close = (db, actor) => createSparkCashClosingRepository(db, { sdk, currentUser: () => ({ uid: actor }), readSales: async () => [], readPayments: async () => [] });
    await assertFails(close(database(), uid).close(sessionId, 10));
    const saved = await close(env.authenticatedContext('p17-owner').firestore(), 'p17-owner').close(sessionId, 10);
    assert.equal(saved.closedBy, 'p17-owner');
    assert.equal(saved.userId, uid);
    assert.equal(saved.branchId, branchId);
    assert.equal(saved.declaredAmount, 10);
  });
  it('P17 projects one owner expiry notice, keeps its acknowledgement separate and reads only that turn ledger', async () => {
    const started = Date.now() - 54000000, occurredAt = Timestamp.fromMillis(started + 3600000);
    const scope = { businessId, branchId, sessionId, userId: uid };
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore(), batch = writeBatch(db);
      batch.update(doc(db, 'cash_sessions', sessionId), { durationHours: 14, openedAt: Timestamp.fromMillis(started) });
      batch.set(doc(db, 'users', 'p17-owner'), { businessId, role: 'dueño', status: 'activo' });
      batch.set(doc(db, 'sales', 'p17-cash'), { ...scope, status: 'confirmed', confirmedAt: occurredAt, total: 20, payment: 'efectivo' });
      batch.set(doc(db, 'sales', 'p17-digital'), { ...scope, status: 'confirmed', confirmedAt: occurredAt, total: 30, payment: 'yape' });
      batch.set(doc(db, 'sales', 'p17-other-branch'), { ...scope, branchId: 'otra', status: 'confirmed', confirmedAt: occurredAt, total: 500, payment: 'efectivo' });
      batch.set(doc(db, 'payments', 'p17-advance'), { ...scope, runtime: 'spark', occurredAt, amount: 6, type: 'advance', method: 'efectivo' });
      batch.set(doc(db, 'payments', 'p17-other-turn'), { ...scope, sessionId: 'p17-next', runtime: 'spark', occurredAt, amount: 100, type: 'payment', method: 'efectivo' });
      batch.set(doc(db, 'pos_voids', 'p17-cash'), { ...scope, authority: 'pos-compensation', protocol: 1, saleId: 'p17-cash',
        occurredAt, cashAmount: -5, digitalAmount: 0, amount: -5 });
      await batch.commit();
    });
    const cashierDb = database(), ownerDb = env.authenticatedContext('p17-owner').firestore();
    const logicalNotices = createNotificationRepository(ownerDb, { sdk, currentUser: () => ({ uid: 'p17-owner' }) });
    const logical = database => new Promise((resolve, reject) => {
      const repository = database === ownerDb ? logicalNotices : createNotificationRepository(database, { sdk });
      const stop = repository.subscribeLogicalCashExpiry(businessId, 'p17-owner', (rows, meta) => {
        if (!meta.stale) { stop(); resolve(rows); }
      }, error => { stop(); reject(error); });
    });
    const observed = await logical(ownerDb);
    assert.equal(observed.length, 1);
    assert.equal(observed[0].authority, 'logical-expiry');
    assert.equal(observed[0].readMarker, undefined);
    await assertFails(logical(cashierDb));
    await assertFails(logical(env.authenticatedContext('p17-foreign').firestore()));
    const lostReply = { ...sdk, runTransaction: async (...args) => {
      await sdk.runTransaction(...args);
      throw Object.assign(new Error('Lost commit response'), { code: 'unavailable' });
    } };
    await createSparkCashRepository(cashierDb, { sdk: lostReply, currentUser: () => ({ uid }) }).finalizeExpired(scope);
    const saved = (await inspect('cash_sessions/' + sessionId)).data();
    const notice = projectFinancialNotice('cash-expiry', { ...saved, id: sessionId }, businessId, 'p17-owner');
    assert.equal(notice.metadata.openingAmount, 10);
    assert.equal(notice.id, observed[0].id);
    assert.deepEqual(await logical(ownerDb), []);
    assert.equal(notice.id, 'read_cash-expiry_' + sessionId + '_p17-owner');
    assert.equal(projectFinancialNotice('cash-expiry', { ...saved, id: sessionId }, 'foreign', 'p17-owner'), null);
    const notices = createNotificationRepository(ownerDb, { sdk, currentUser: () => ({ uid: 'p17-owner' }) });
    const watch = expectExpiry => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { stop(); reject(new Error('El aviso no se confirmó.')); }, 8000);
      const stop = notices.subscribeUnreadNotifications(businessId, 'p17-owner', (rows, state) => {
        if (state.fromCache) return;
        const expiries = rows.filter(row => row.sourceType === 'cash-expiry');
        if (expiries.length === expectExpiry) { clearTimeout(timeout); stop(); resolve(expiries); }
      }, error => { clearTimeout(timeout); stop(); reject(error); }, { owner: true });
    });
    const first = await Promise.all([watch(1), watch(1)]);
    assert.deepEqual(first.map(rows => rows[0].id), [notice.id, notice.id]);
    await assertFails(setDoc(doc(cashierDb, 'notifications', notice.id), { ...notice.readMarker, authority: 'read-marker', readAt: serverTimestamp() }));
    await notices.markNotificationRead(notice);
    await watch(0);
    assert.ok((await inspect('cash_sessions/' + sessionId)).data().recoveredAt.isEqual(saved.recoveredAt));
    const payments = createPaymentRepository(ownerDb, { sdk }), voids = createPosVoidReader(ownerDb, { sdk });
    const reader = createSparkCashClosingRepository(ownerDb, { sdk, currentUser: () => ({ uid: 'p17-owner' }),
      readSales: createSalesSessionReader(ownerDb, { sdk }),
      readPayments: async (session, options) => [
        ...await payments.getPaymentsBySession(businessId, session.id, branchId, options),
        ...voidCashPayments(await voids.bySession(session, options)),
      ],
    });
    const totals = await reader.inspectExpiry(scope);
    assert.deepEqual([totals.posCash, totals.posCashNet, totals.contractCash, totals.digitalTotal, totals.posCompensationCash, totals.expectedCash], [20, 15, 6, 30, -5, 31]);
    await assert.rejects(reader.inspectExpiry({ ...scope, branchId: 'otra' }));
  });
  it('closes a Spark session operationally, releases only its lock and bars subsequent sales and repeated changes', async () => {
    const closing = createSparkCashClosingRepository(database(), { sdk, currentUser: () => ({ uid }), readSales: async () => [], readPayments: async () => [] });
    const result = await closing.close(sessionId, 12, 'Diferencia declarada');
    assert.equal(result.status, 'closed_with_discrepancy'); assert.equal(result.reconciliationPending, true);
    assert.equal(result.closeEstimate.authority, 'client-estimate');
    await closing.close(sessionId, 12, 'Diferencia declarada');
    await assert.rejects(closing.close(sessionId, 13, 'Otro cierre'));
    await assertFails(commit(payload('closed-ticket', 2)));
    const lock = createHash('sha256').update(JSON.stringify([businessId, branchId])).digest('hex');
    assert.equal((await inspect(`active_cash_sessions/${lock}`)).exists(), false);
  });

  it('blocks forged receipts/catalog markers, another branch version and an atomic close-and-sale bypass', async () => {
    const db = database();
    await assertFails(updateDoc(doc(db, 'products', 'bread'), { posLastSaleId: 'fake' }));
    await assertFails(updateDoc(doc(db, 'products', 'bread'), { posStockVersion: { other: 0 } }));
    const batch = writeBatch(db), sale = payload('atomic-close', 1);
    batch.update(doc(db, 'cash_sessions', sessionId), { status: 'closed', closedBy: uid, closedAt: serverTimestamp(),
      declaredAmount: 10, closingNote: '', reconciliationPending: true,
      closeEstimate: { authority: 'client-estimate', reconciliationPending: true, declaredAmount: 10, expectedCash: 10, difference: 0 } });
    batch.delete(doc(db, 'active_cash_sessions', createHash('sha256').update(JSON.stringify([businessId, branchId])).digest('hex')));
    batch.set(doc(db, 'sales', sale.saleId), { ...sale, productIds: ['bread'], stockVersions: { bread: 1 }, status: 'confirmed', confirmedAt: serverTimestamp() });
    batch.update(doc(db, 'products', 'bread'), { stock: { [branchId]: 9, other: 7 }, posStockVersion: { [branchId]: 1, other: 41 }, posLastSaleId: sale.saleId });
    await assertFails(batch.commit());
    assert.equal((await inspect(`cash_sessions/${sessionId}`)).data().status, 'open');
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'products', 'bread'), { posStockVersion: { [branchId]: Number.MAX_SAFE_INTEGER, other: 41 } }));
    await assertFails(commit(payload('unsafe-version', 1)));
    assert.equal((await inspect('products/bread')).data().posStockVersion[branchId], Number.MAX_SAFE_INTEGER);
  });
  it('serializes concurrent installments, rejects aggregate forgery, partial ledgers and historical writes; refunds three methods once with a pickup', async () => {
    const pickup = 'p17-refunds-branch';
    await env.withSecurityRulesDisabled(async ctx => {
      await updateDoc(doc(ctx.firestore(), 'users', uid), { role: 'dueño' });
      await setDoc(doc(ctx.firestore(), 'branches', pickup), { businessId, status: 'activo', sparkCashVersion: 1 });
    });
    const db = database(), contracts = createSparkContractsRepository(db, { sdk, currentUser: () => ({ uid }) });
    const id = '11111111-1111-4111-8111-111111111111';
    await contracts.create({ contractId: id, operationId: '22222222-2222-4222-8222-222222222222', branchId, deliveryType: pickup, total: 10, subtotal: 10, deliveryCost: 0, clientName: 'Prueba' });
    await contracts.update(id, { details: 'Edición permitida', subtotal: 10, total: 10 });
    const command = (op, amount, method = 'efectivo') => ({ contractId: id, branchId, operationId: op, amount, method });
    await contracts.addPayment(command('33333333-3333-4333-8333-333333333333', 2));
    await contracts.addPayment(command('44444444-4444-4444-8444-444444444444', 2, 'yape'));
    await contracts.addPayment(command('55555555-5555-4555-8555-555555555555', 2, 'plin'));
    const race = await Promise.allSettled([
      contracts.addPayment(command('66666666-6666-4666-8666-666666666666', 3)),
      contracts.addPayment(command('77777777-7777-4777-8777-777777777777', 3))]);
    assert.equal(race.filter(value => value.status === 'fulfilled').length, 1);
    await assertFails(updateDoc(doc(db, 'contracts', id), { paidTotal: 10, balance: 0, paidByMethod: { efectivo: 6, yape: 2, plin: 2 }, ledgerVersion: 5, lastPaymentId: 'fake', updatedAt: serverTimestamp() }));
    const saved = (await inspect(`contracts/${id}`)).data(); assert.equal(saved.paidTotal, 9);
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'contracts', 'legacy-contract'), { ...saved, sparkContractVersion: 0 }));
    await assertFails(updateDoc(doc(db, 'contracts', 'legacy-contract'), { details: 'Forbidden', updatedAt: serverTimestamp() }));
    await contracts.cancel({ contractId: id, branchId, operationId: '88888888-8888-4888-8888-888888888888', reason: 'Tres métodos' });
    assert.equal((await inspect(`contracts/${id}`)).data().paidTotal, 0);
    assert.equal((await inspect(`contract_pickups/${id}`)).data().pickupBranchId, null);
    const payments = await createPaymentRepository(db, { sdk }).getPaymentsByContract(businessId, id, branchId);
    assert.equal(payments.filter(row => row.type === 'refund').length, 3);
    assert.equal(payments.reduce((sum, row) => sum + row.amount, 0), 0);
  });
  it('uses confirmed server dates for paginated reports, deterministic historical reads and protected informational notices', async () => {
    const db = database(), repository = createSparkSalesRepository(db, { sdk, currentUser: () => ({ uid }) });
    const sale = { ...payload('report-ticket', 2), createdAt: '2001-01-01T00:00:00.000Z', queuedAt: '2001-01-01T00:00:00.000Z' };
    await repository.submit(sale);
    const rows = await createSalesPeriodReader(db, { sdk })(businessId, new Date(Date.now() - 60000), new Date(Date.now() + 60000), { branchId });
    assert.equal(rows.length, 1); assert.equal(rows[0].id, sale.saleId);
    assert.equal(aggregateReport({ stats: salesToDailyStats(rows) }).summary.posRevenue, sale.total);
    const XLSX = createRequire(new URL('../frontend/package.json', import.meta.url))('xlsx-js-style');
    const workbook = buildSalesWorkbook(XLSX, { sales: rows, businessId, branchId, period: reportPeriod('hoy'), detailed: true }).workbook;
    assert.ok(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }).length > 1000);
    const notice = (await inspect(`notifications/sale_${sale.saleId}`)).data(); assert.equal(notice.authority, 'informational');
    await assertFails(setDoc(doc(db, 'notifications', 'sale_fake'), { ...notice, sourceId: 'fake', createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'notifications', `sale_${sale.saleId}`), { message: 'Certificado falso' }));
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'contracts', 'old-readonly'), {
      businessId, branchId, createdBy: uid, total: 9,
      payments: [{ amount: 2, method: 'yape', type: 'adelanto', branchId, date: '2026-10-23T12:00:00.000Z' }] }));
    const legacy = createSparkLegacyPaymentReader(db, { sdk });
    const first = await legacy(businessId, { contractId: 'old-readonly', branchId });
    const second = await legacy(businessId, { contractId: 'old-readonly', branchId });
    assert.equal(first[0].id, second[0].id); assert.equal(first[0].amount, 2);
    const old = (await inspect('contracts/old-readonly')).data();
    const serverPlan = planLegacyPayments('old-readonly', old, { timestampFromDate: Timestamp.fromDate, digest: value => createHash('sha256').update(JSON.stringify(value)).digest('hex') });
    assert.equal(first[0].id, serverPlan[0].id);
    assert.ok((await inspect('contracts/old-readonly')).data().payments);
  });

  it('rejects cross-tenant/branch payments, cashier refunds, missing payment writes and out-of-shift financial operations', async () => {
    const db = database(), contracts = createSparkContractsRepository(db, { sdk, currentUser: () => ({ uid }) });
    const id = 'a1111111-1111-4111-8111-111111111111';
    await contracts.create({ contractId: id, operationId: 'a2222222-2222-4222-8222-222222222222', branchId, total: 10, subtotal: 10, deliveryCost: 0, clientName: 'Prueba' });
    await assert.rejects(contracts.addPayment({ contractId: id, branchId: 'foreign', operationId: 'a3333333-3333-4333-8333-333333333333', amount: 2, method: 'yape' }));
    await assert.rejects(contracts.cancel({ contractId: id, branchId, operationId: 'a4444444-4444-4444-8444-444444444444', reason: 'Solo dueño' }));
    await assertFails(updateDoc(doc(db, 'contracts', id), { paidTotal: 2, balance: 8, paidByMethod: { efectivo: 2, yape: 0, plin: 0 },
      ledgerVersion: 1, lastPaymentId: 'missing-payment', updatedAt: serverTimestamp() }));
    const foreign = env.authenticatedContext('foreign').firestore();
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'users', 'foreign'), { role: 'dueño', businessId: 'other-tenant', status: 'activo' }));
    await assertFails(getDoc(doc(foreign, 'contracts', id)));
    await assertFails(updateDoc(doc(foreign, 'contracts', id), { details: 'Cruce de tenant', updatedAt: serverTimestamp() }));
    const minute = ((new Date().getUTCHours() * 60 + new Date().getUTCMinutes()) + 1140) % 1440;
    const hhmm = n => `${String(Math.floor((n % 1440) / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', uid), { shiftStart: hhmm(minute + 5), shiftEnd: hhmm(minute + 6) }));
    await assertFails(commit(payload('outside-server-shift', 2)));
    assert.equal((await inspect(`contracts/${id}`)).data().paidTotal, 0);
  });
  it('handles a sale racing a catalog edit or cash close without stale stock writes or post-close acceptance', async () => {
    const db = database();
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', uid), { role: 'dueño' }));
    const repository = createSparkSalesRepository(db, { sdk, currentUser: () => ({ uid }) });
    const results = await Promise.allSettled([
      repository.submit(payload('catalog-race', 1)),
      updateProductTransaction(db, 'bread', { name: 'bread', price: 2.25, cost: 0.25, businessId, stock: { [branchId]: 10, other: 7 }, category: 'Prueba', status: 'activo' }, { [branchId]: 10, other: 7 }, { sdk }),
    ]);
    assert.ok(results.some(row => row.status === 'fulfilled'));
    const applied = (await inspect('sales/catalog-race')).exists();
    assert.equal((await inspect('products/bread')).data().stock[branchId], applied ? 9 : 10);
    const closing = createSparkCashClosingRepository(db, { sdk, currentUser: () => ({ uid }), readSales: async () => [], readPayments: async () => [] });
    const race = await Promise.allSettled([repository.submit(payload('close-race', 1)), closing.close(sessionId, 10, 'Cierre operativo')]);
    assert.equal(race[1].status, 'fulfilled');
    assert.equal((await inspect(`cash_sessions/${sessionId}`)).data().reconciliationPending, true);
    await assertFails(commit(payload('after-racing-close', 1)));
  });

  it('closes the real confirmed sale/contract book with exact opening, cash, mixed and Yape amounts', async () => {
    const db = database();
    const sales = createSparkSalesRepository(db, { sdk, currentUser: () => ({ uid }) });
    const mixed = { ...payload('full-flow-mixed', 2), payment: 'mixto', amountPaid: 3.5, change: 0, splitPayments: { efectivo: 1.5, yape: 2 } };
    await sales.submit(mixed); await sales.submit(payload('full-flow-cash', 1));
    const contracts = createSparkContractsRepository(db, { sdk, currentUser: () => ({ uid }) });
    const id = 'b1111111-1111-4111-8111-111111111111';
    await contracts.create({ contractId: id, operationId: 'b2222222-2222-4222-8222-222222222222', branchId, clientName: 'Flujo completo', total: 20, subtotal: 20, deliveryCost: 0,
      initialPayment: { operationId: 'b3333333-3333-4333-8333-333333333333', amount: 5, method: 'efectivo' } });
    await contracts.addPayment({ contractId: id, branchId, operationId: 'b4444444-4444-4444-8444-444444444444', amount: 3, method: 'yape' });
    const ledger = createPaymentRepository(db, { sdk });
    const close = createSparkCashClosingRepository(db, { sdk, currentUser: () => ({ uid }),
      readSales: createSalesSessionReader(db, { sdk }), readPayments: session => ledger.getPaymentsBySession(businessId, session.id, branchId) });
    const estimate = await close.preview(sessionId, 17.75);
    assert.equal(estimate.openingAmount, 10); assert.equal(estimate.posCash, 2.75);
    assert.equal(estimate.contractCash, 5); assert.equal(estimate.digitalTotal, 5); assert.equal(estimate.difference, 0);
    const saved = await close.close(sessionId, 17.75);
    assert.equal(saved.status, 'closed'); assert.equal(saved.reconciliationPending, true);
    await assert.rejects(contracts.addPayment({ contractId: id, branchId, operationId: 'b5555555-5555-4555-8555-555555555555', amount: 1, method: 'yape' }));
    const noCash = 'c1111111-1111-4111-8111-111111111111';
    await contracts.create({ contractId: noCash, operationId: 'c2222222-2222-4222-8222-222222222222', branchId, clientName: 'Sin cobro', subtotal: 10, deliveryCost: 0, total: 10 });
    await contracts.update(noCash, { details: 'Edición sin alterar el libro' });
    await contracts.deliver(noCash);
    assert.equal((await inspect(`contracts/${noCash}`)).data().status, 'entregado_con_deuda');
  });

});


it('Plan03 rejects sales and new contracts on an inactive or unknown-status branch without touching receipts or stock', async () => {
  const db = database(), contracts = createSparkContractsRepository(db, { sdk, currentUser: () => ({ uid }) });
  for (const status of ['inactivo', 'unknown']) {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'branches', branchId), { status }));
    const sale = payload(`blocked-${status}`, 2);
    await assertFails(commit(sale));
    await assert.rejects(contracts.create({ contractId: '11111111-1111-4111-8111-111111111111', operationId: '22222222-2222-4222-8222-222222222222', branchId, total: 10, subtotal: 10, deliveryCost: 0, clientName: 'Prueba' }), /Sede inactiva/);
    assert.equal((await inspect(`sales/${sale.saleId}`)).exists(), false);
    assert.equal((await inspect('products/bread')).data().stock[branchId], 10);
  }
});

it('P17-RC expires fourteen-hour cash sessions using server time and refuses financial writes and a late manual count', async () => {
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users', uid), { role: 'dueño' }));
  const db = database(), contracts = createSparkContractsRepository(db, { sdk, currentUser: () => ({ uid }) });
  const contractId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const paymentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await contracts.create({ contractId, operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', branchId, clientName: 'Prueba',
    total: 20, subtotal: 20, deliveryCost: 0, initialPayment: { operationId: paymentId, amount: 2, method: 'efectivo' } });
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'cash_sessions', sessionId), {
    durationHours: 14, openedAt: Timestamp.fromMillis(Date.now() - 11 * 3600000),
  }));
  const live = payload('p17-live-at-eleven-hours', 1);
  await commit(live);
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'test_clock/anchor'), { time: serverTimestamp() }));
  const { time } = (await inspect('test_clock/anchor')).data();
  const expiredOpening = time.toMillis() - 14 * 3600000;
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'cash_sessions', sessionId), {
    openedAt: new Timestamp(time.seconds - 50400, time.nanoseconds),
  }));
  // A forged client date inside the old window cannot override request.time in Rules.
  await assertFails(commit({ ...payload('expired-cash-sale', 2), createdAt: new Date(expiredOpening + 1000).toISOString() }));
  const rejectedContractId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  await assert.rejects(contracts.create({ contractId: rejectedContractId, operationId: '99999999-9999-4999-8999-999999999999',
    branchId, clientName: 'Anticipo vencido', total: 10, subtotal: 10, deliveryCost: 0,
    initialPayment: { operationId: '88888888-8888-4888-8888-888888888888', amount: 1, method: 'efectivo' } }));
  await assert.rejects(contracts.addPayment({ contractId, branchId, operationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', amount: 1, method: 'efectivo' }));
  await assert.rejects(contracts.cancel({ contractId, branchId, operationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', reason: 'Reembolso bloqueado' }));
  await assertFails(updateDoc(doc(db, 'cash_sessions', sessionId), { durationHours: 12 }));
  await assertFails(updateDoc(doc(db, 'cash_sessions', sessionId), { openedAt: serverTimestamp() }));
  assert.equal((await inspect('sales/expired-cash-sale')).exists(), false);
  assert.equal((await inspect('products/bread')).data().stock[branchId], 9);
  assert.equal((await inspect('contracts/' + contractId)).data().paidTotal, 2);
  assert.equal((await inspect('contracts/' + rejectedContractId)).exists(), false);
  assert.equal((await inspect('payments/88888888-8888-4888-8888-888888888888')).exists(), false);
  const payment = (await inspect('payments/' + paymentId)).data();
  const closing = createSparkCashClosingRepository(db, { sdk, currentUser: () => ({ uid }), readSales: async () => [], readPayments: async () => [payment] });
  await assert.rejects(closing.close(sessionId, 12));
  await createSparkCashRepository(db, { sdk, currentUser: () => ({ uid }) }).finalizeExpired({ businessId, branchId, sessionId });
  const expired = (await inspect('cash_sessions/' + sessionId)).data();
  assert.equal(expired.status, 'expired_unreconciled');
  assert.ok(expired.expiredAt.isEqual(time));
  assert.equal(expired.declaredAmount, null);
  assert.equal(expired.closedBy, undefined);
  assert.equal((await inspect('payments/' + paymentId)).data().amount, 2);
});
it('Plan04 preserves old-session policy and accepts new sessions before expiry; no-advance orders do not need cash', async () => {
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'cash_sessions', sessionId), { openedAt: Timestamp.fromMillis(Date.now() - 12 * 3600000) }));
  await commit(payload('historical-cash-sale', 1));
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'cash_sessions', sessionId), { durationHours: 10, openedAt: Timestamp.fromMillis(Date.now() - 9 * 3600000) }));
  await commit(payload('valid-cash-sale', 1));
  for (const durationHours of ['10', 12, 0, null]) {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'cash_sessions', sessionId), { durationHours }));
    await assertFails(commit(payload('invalid-duration-sale', 1)));
    assert.equal((await inspect('sales/invalid-duration-sale')).exists(), false);
    assert.equal((await inspect('products/bread')).data().stock[branchId], 8);
  }
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'cash_sessions', sessionId), { durationHours: 10, openedAt: Timestamp.fromMillis(Date.now() - 11 * 3600000) }));
  const contracts = createSparkContractsRepository(database(), { sdk, currentUser: () => ({ uid }) });
  await contracts.create({ contractId: '11111111-1111-4111-8111-111111111111', operationId: '22222222-2222-4222-8222-222222222222',
    branchId, clientName: 'Pedido sin anticipo', total: 10, subtotal: 10, deliveryCost: 0 });
  assert.equal((await inspect('contracts/11111111-1111-4111-8111-111111111111')).data().paidTotal, 0);
});

it('Plan14 verifies a committed recovery after a lost response and accepts sales only in the replacement cash session', async () => {
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'cash_sessions', sessionId), {
    durationHours: 10, openedAt: Timestamp.fromMillis(Date.now() - 5 * 86400000),
  }));
  const db = database();
  let commits = 0;
  const repository = createSparkCashRepository(db, { currentUser: () => ({ uid }), sdk: { ...sdk,
    async runTransaction(...args) {
      await sdk.runTransaction(...args);
      if (++commits === 1) throw Object.assign(new Error('Connection lost after commit'), { code: 'unavailable' });
    },
  } });
  const command = { businessId, branchId, sessionId: 'plan14-new-cash-session', openingAmount: 50 };
  const result = await repository.open(command);
  assert.equal(result.recoveredSession.status, 'expired_unreconciled');
  assert.equal(result.openingAmount, 50);
  assert.ok((await repository.open(command)).openedAt.isEqual(result.openedAt));
  await assertFails(commit(payload('plan14-stale-session-sale', 1)));
  assert.equal((await inspect('sales/plan14-stale-session-sale')).exists(), false);
  await commit({ ...payload('plan14-replacement-session-sale', 1), sessionId: result.id });
  assert.equal((await inspect('sales/plan14-replacement-session-sale')).data().sessionId, result.id);
  assert.equal((await inspect('products/bread')).data().stock[branchId], 9);
  assert.equal((await inspect('cash_sessions/' + sessionId)).data().declaredAmount, null);
});

describe('P18 private contract media', () => {
  const origin = { uid, businessId, branchId };
  const target = 'p18-pickup';
  const create = async (suffix, { initialPayment = false, referenceImages = [], lostResponse = false } = {}) => {
    const contractId = `aaaaaaaa-1111-4111-8111-${suffix.padStart(12, '0')}`;
    const injected = lostResponse ? { ...sdk, async runTransaction(...args) {
      await sdk.runTransaction(...args);
      throw Object.assign(new Error('P18 lost creation response'), { code:'unavailable' });
    } } : sdk;
    const repo = createSparkContractsRepository(database(), { sdk: injected, currentUser: () => ({ uid }) });
    await repo.create({ contractId, operationId: `bbbbbbbb-1111-4111-8111-${suffix.padStart(12, '0')}`,
      branchId, clientName: 'Pedido con fotos', clientPhone: '987654321', deliveryDate: '2026-11-14T17:00:00.000Z',
      deliveryType: target, total: 100, subtotal: 100, deliveryCost: 0, referenceImages,
      ...(initialPayment ? { initialPayment: { operationId: 'cccccccc-1111-4111-8111-000000000001', amount: 20, method: 'yape' } } : {}) });
    return { ...origin, contractId };
  };
  const photo = async (overrides = {}) => {
    const blob = new Blob([Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==','base64')], { type:'image/webp' });
    return { mediaId: crypto.randomUUID(), blob, width: 1, height: 1, sha256: await imageHash(new Uint8Array(await blob.arrayBuffer())), ...overrides };
  };
  const seedAccounts = () => env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore(), batch = writeBatch(db);
    batch.set(doc(db, 'branches', target), { businessId, status:'activo', sparkCashVersion:1 });
    batch.set(doc(db, 'users', 'p18-owner'), { businessId, status:'activo', role:'dueño' });
    batch.set(doc(db, 'users', 'p18-other'), { businessId, branchId:target, status:'activo', role:'cajero' });
    batch.set(doc(db, 'users', 'p18-suspended'), { businessId, branchId, status:'inactivo', role:'cajero' });
    batch.set(doc(db, 'users', 'p18-foreign'), { businessId:'foreign', status:'activo', role:'dueño' });
    await batch.commit();
  });

  it('publishes 0, 1 and 4 independent Bytes after creation with a date and advance; only origin and owner can open them', async () => {
    await seedAccounts();
    const db = database(), counts = { transactionReads:0, serverReads:0, writes:0 };
    const counted = { ...sdk, runTransaction: (db, work) => sdk.runTransaction(db, tx => work({
      get: ref => { counts.transactionReads++; return tx.get(ref); },
      set: (...args) => { counts.writes++; return tx.set(...args); },
      update: (...args) => { counts.writes++; return tx.update(...args); },
    })), getDocFromServer: ref => { counts.serverReads++; return sdk.getDocFromServer(ref); } };
    const repo = createContractMediaRepository(db, { sdk: counted, currentUser: () => ({ uid }) });
    for (const count of [0, 1, 4]) {
      const scope = await create(String(count), { initialPayment: count === 4, lostResponse: count === 4 });
      const ids = [];
      for (let i = 0; i < count; i++) {
        const job = await photo();
        if (i === 3) {
          const atLimit = new Uint8Array(163840);
          atLimit.set(new Uint8Array(await job.blob.arrayBuffer()));
          job.blob = new Blob([atLimit], { type: 'image/webp' });
          job.sha256 = await imageHash(atLimit);
        }
        await repo.upload(scope, job);
        ids.push(job.mediaId);
      }
      const parent = (await getDoc(doc(db, 'contracts', scope.contractId))).data();
      assert.deepEqual(parent.mediaIds ?? [], ids);
      assert.deepEqual(parent.referenceImages, []);
      assert.equal(parent.data, undefined);
      assert.equal(parent.pendingMedia ?? null, null);
      assert.equal(parent.paidTotal, count === 4 ? 20 : 0);
      if (!count) continue;
      const id = ids[0], path = `contracts/${scope.contractId}/media/${id}`;
      const freshOwner = env.authenticatedContext('p18-owner').firestore();
      const owner = createContractMediaRepository(freshOwner, { sdk, currentUser: () => ({ uid:'p18-owner' }) });
      assert.equal((await owner.readPhoto({ ...scope, uid:'p18-owner' }, id)).blob.type, 'image/webp');
      const other = env.authenticatedContext('p18-other').firestore();
      assert.equal((await getDoc(doc(other, 'contract_pickups', scope.contractId))).data().pickupBranchId, target);
      await assertFails(getDoc(doc(other, 'contracts', scope.contractId)));
      await assertFails(getDoc(doc(other, path)));
      await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path)));
      await assertFails(getDoc(doc(env.authenticatedContext('p18-suspended').firestore(), path)));
      await assertFails(getDoc(doc(env.authenticatedContext('p18-foreign').firestore(), path)));
      await assertFails(sdk.getDocs(sdk.collection(freshOwner, 'contracts', scope.contractId, 'media')));
      await assertFails(updateDoc(doc(db, path), { width: 2 }));
      await assertFails(sdk.deleteDoc(doc(db, path)));
    }
    const receipts = await sdk.getDocs(sdk.query(sdk.collection(db, 'payments'), sdk.where('businessId', '==', businessId), sdk.where('branchId', '==', branchId)));
    assert.equal(receipts.size, 1);
    assert.deepEqual(counts, { transactionReads:10, serverReads:10, writes:15 });
  });

  it('keeps product and branch images in bounded Base64 and exposes updates across authorized accounts', async () => {
    await seedAccounts();
    const ownerDb = env.authenticatedContext('p18-owner').firestore();
    const product = doc(ownerDb, 'products', 'bread'), branch = doc(ownerDb, 'branches', branchId);
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'branches', branchId), { name:'Sede origen' }));
    const jpeg = 'data:image/jpeg;base64,/9j/2Q==', png = 'data:image/png;base64,iVBORw0KGgo=';
    await updateDoc(product, { imageUrl:jpeg });
    await updateDoc(branch, { yapeQrUrl:png });
    assert.equal((await getDoc(doc(database(), 'products', 'bread'))).data().imageUrl, jpeg);
    assert.equal((await getDoc(doc(database(), 'branches', branchId))).data().yapeQrUrl, png);
    await assertFails(updateDoc(product, { imageUrl:'data:image/svg+xml;base64,AAAA' }));
    await assertFails(updateDoc(product, { imageUrl:'data:image/jpeg;base64,' + 'A'.repeat(131072) }));
    await assertFails(updateDoc(branch, { yapeQrUrl:'data:image/png;base64,' + 'A'.repeat(393216) }));
    await updateDoc(branch, { yapeQrUrl:jpeg });
    assert.equal((await getDoc(doc(database(), 'branches', branchId))).data().yapeQrUrl, jpeg);
    await updateDoc(branch, { yapeQrUrl:null });
    assert.equal((await getDoc(doc(database(), 'branches', branchId))).data().yapeQrUrl, null);
  });

  it('reuses the same photo after a lost response, requires server proof, preserves legacy refs and denies invalid or excess Bytes', async () => {
    await seedAccounts();
    const contractId = 'aaaaaaaa-1111-4111-8111-000000000020';
    const legacy = Array.from({ length: 20 }, () => `local-image:${businessId}:${contractId}:${crypto.randomUUID()}`);
    await assertFails(create('20', { referenceImages: legacy }));
    const scope = await create('20');
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'contracts', scope.contractId), { referenceImages: legacy }));
    const db = database();
    const repo = createContractMediaRepository(db, { sdk, currentUser: () => ({ uid }) });
    await assertFails(repo.upload(scope, await photo()));
    const job = await photo({ legacyRef: legacy[0] });
    const parent = doc(db, 'contracts', scope.contractId), image = doc(db, 'contracts', scope.contractId, 'media', job.mediaId);
    const raw = async (fields = {}, pending = {}, parentOnly = false) => {
      const batch = writeBatch(db), rawBytes = new Uint8Array(await job.blob.arrayBuffer());
      if (!parentOnly) batch.set(image, { businessId, originBranchId:branchId, version:1, contentType:'image/webp',
        createdAt:serverTimestamp(), createdBy:uid, width:1, height:1, sha256:job.sha256, byteLength:rawBytes.length,
        data:sdk.Bytes.fromUint8Array(rawBytes), ...fields });
      batch.update(parent, { mediaRevision:1, pendingMedia:{ id:job.mediaId, legacyRef:job.legacyRef, sha256:job.sha256, ...pending } });
      return batch.commit();
    };
    await assertFails(raw({}, {}, true));
    await assertFails(raw({ byteLength: 163841 }));
    await assertFails(raw({ data: sdk.Bytes.fromUint8Array(new Uint8Array(163841)), byteLength: 163841 }));
    await assertFails(raw({ data:'AAAA' }));
    await assertFails(raw({ contentType:'image/svg+xml' }));
    await assertFails(raw({ originBranchId:target }));
    await assertFails(raw({ sha256:'a'.repeat(64) }, { sha256:'a'.repeat(64) }));
    await assertFails(updateDoc(parent, { mediaIds:[job.mediaId], pendingMedia:null, mediaRevision:1 }));
    await assertFails(updateDoc(parent, { mediaRevision:1 }));
    const controller = new AbortController();
    const first = createContractMediaRepository(db, { currentUser: () => ({ uid }), sdk: { ...sdk,
      async runTransaction(...args) { await sdk.runTransaction(...args); controller.abort(); },
    } });
    await assert.rejects(first.upload(scope, job, controller.signal), { name:'AbortError' });
    assert.equal((await getDoc(parent)).data().pendingMedia.id, job.mediaId);
    assert.deepEqual((await getDoc(parent)).data().referenceImages, legacy);
    const ownerDb = env.authenticatedContext('p18-owner').firestore();
    const owner = createContractMediaRepository(ownerDb, { currentUser: () => ({ uid:'p18-owner' }), sdk: { ...sdk,
      async runTransaction(...args) { await sdk.runTransaction(...args); throw Object.assign(new Error('lost reply'), { code:'unavailable' }); },
    } });
    await owner.resume({ ...scope, uid:'p18-owner' }, job.mediaId);
    await repo.upload(scope, job);
    const saved = (await getDoc(parent)).data();
    assert.deepEqual(saved.mediaIds, [job.mediaId]);
    assert.deepEqual(saved.referenceImages, legacy.slice(1));
    assert.equal(saved.pendingMedia, null);
    assert.equal(saved.mediaRevision, 2);
    assert.equal(saved.paidTotal, 0);
    await repo.remove(scope, job.mediaId);
    assert.deepEqual((await getDoc(parent)).data().mediaIds, []);
    assert.equal((await inspect(image.path)).exists(), false);
    assert.deepEqual((await getDoc(parent)).data().referenceImages, legacy.slice(1));
  });
});
