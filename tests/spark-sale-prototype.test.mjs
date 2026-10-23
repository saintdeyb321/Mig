import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, beforeEach, after, describe, it } from 'node:test';
import { createHash } from 'node:crypto';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch, runTransaction, serverTimestamp, Timestamp, setLogLevel } from 'firebase/firestore';
import { canonicalSale, sameSaleOperation } from '../functions/src/sales/domain/saleModel.js';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-migapos');
setLogLevel('silent');
let env;
const uid = 'cashier', businessId = 'prototype-tenant', branchId = 'prototype-branch', sessionId = 'prototype-session';
const products = ['bread', 'cake', 'milk', 'tea', 'extra'].map((id, index) => ({ id, businessId, name: id, category: 'Prueba', price: index + 1.25, cost: 0.25, stock: { [branchId]: 10, other: 7 }, status: 'activo' }));
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
    const sale = mutate({ ...data, productIds: data.items.map(item => item.id), confirmedAt: serverTimestamp(), status: 'confirmed' });
    if (receipt) tx.set(ref, sale);
    for (const [index, item] of data.items.entries()) if (item.id !== omitProduct) {
      const product = rows[index].data();
      tx.update(doc(db, 'products', item.id), { stock: { ...product.stock, [data.branchId]: product.stock[data.branchId] - item.qty }, posLastSaleId: data.saleId, posStockVersion: (product.posStockVersion ?? 0) + 1 });
    }
    return sale;
  });
}
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-migapos', firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('tests/fixtures/spark-sale-prototype.rules', 'utf8') } }); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore(), batch = writeBatch(db);
    const entries = { [`users/${uid}`]: { role: 'cajero', businessId, branchId, status: 'activo' }, [`tenants/${businessId}`]: { businessId, status: 'active' },
      [`licenses/${businessId}`]: { businessId, status: 'activa', expiry: Timestamp.fromMillis(Date.now() + 86400000) },
      [`branches/${branchId}`]: { businessId, status: 'activo', sparkCashVersion: 1 },
      [`cash_sessions/${sessionId}`]: { businessId, branchId, userId: uid, status: 'open', runtime: 'spark', openedAt: Timestamp.fromMillis(Date.now() - 1000) },
      [`active_cash_sessions/${createHash('sha256').update(JSON.stringify([businessId, branchId])).digest('hex')}`]: { businessId, branchId, userId: uid, sessionId, status: 'open' } };
    for (const product of products) entries[`products/${product.id}`] = product;
    for (const [path, value] of Object.entries(entries)) batch.set(doc(db, path), value);
    await batch.commit();
  });
});
after(async () => env?.cleanup());

describe('SPARK-3 bounded sale feasibility — emulator-only Rules, never operational', () => {
  it('confirms a complete two-product ticket within Rules limits and retries without a second debit', async () => {
    const sale = payload('ticket-two', 2); await commit(sale); const first = (await inspect('sales/ticket-two')).data();
    assert.ok(first.confirmedAt instanceof Timestamp);
    await commit(sale);
    for (const product of products.slice(0, 2)) { const saved = (await inspect(`products/${product.id}`)).data(); assert.equal(saved.stock[branchId], 9); assert.equal(saved.stock.other, 7); assert.equal(saved.posStockVersion, 1); }
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
});
