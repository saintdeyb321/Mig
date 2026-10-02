import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, beforeEach, after, describe, it } from 'node:test';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, Timestamp, serverTimestamp, deleteField,
  increment, writeBatch, setLogLevel,
} from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

const projectId = 'demo-migapos';
assert.match(projectId, /^demo-/);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'Run npm run test:rules; a local Firestore Emulator is required.');
assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1:9199',
  'A local Storage Emulator is required.');
setLogLevel('silent');

let env;
const isoDate = '2026-10-02T12:00:00.000Z';
const now = Timestamp.fromDate(new Date(isoDate));
const item = { id: 'product-a', name: 'Pan', qty: 1, price: 10 };
const invitation = {
  email: 'invited@example.test', businessId: 'tenant-a', role: 'cajero',
  firstName: 'Ana', lastName: 'Invitada', branchId: 'a-1',
  shiftStart: '08:00', shiftEnd: '16:00', status: 'activo', createdAt: isoDate,
};
const invitedUser = { ...invitation };
const sale = (businessId = 'tenant-a', branchId = 'a-1', userId = 'cashier-a', id = 'new') => ({
  businessId, branchId, userId, total: 10, items: [item], createdAt: now,
  voided: false, sessionId: 'session-a', payment: 'efectivo',
  saleId: id, localId: id, idempotencyKey: id, version: 1, amountPaid: 10, change: 0,
});
const contract = (businessId = 'tenant-a', branchId = 'a-1') => ({
  businessId, branchId, contractId: 'PED-TEST', clientName: 'Cliente',
  deliveryDate: now, deliveryType: 'a-2', total: 10, payments: [], status: 'pendiente',
});
const profile = (businessId, role, branchId = 'global', status = 'activo') => ({
  businessId, role, branchId, status, email: `${role}-${businessId}@example.test`,
  firstName: 'Nombre', lastName: 'Apellido', createdAt: isoDate,
  shiftStart: null, shiftEnd: null,
});
function context(uid, token = {}) {
  return env.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: true, ...token });
}
const db = (uid, token) => context(uid, token).firestore();
const ownerDb = () => db('owner-a');
const cashierDb = () => db('cashier-a');
const adminDb = () => db('admin');
const ownDb = () => db('invited');

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
    storage: { host: '127.0.0.1', port: 9199, rules: readFileSync('storage.rules', 'utf8') },
  });
  await env.withSecurityRulesDisabled(async ctx => {
    await uploadBytes(ref(ctx.storage(), 'private/fixture.txt'), new Uint8Array([1, 2, 3]));
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const fixtureDb = ctx.firestore();
    const fixtures = {
      'users/owner-a': profile('tenant-a', 'dueño'),
      'users/owner-b': profile('tenant-b', 'dueño'),
      'users/cashier-a': profile('tenant-a', 'cajero', 'a-1'),
      'users/cashier-a2': profile('tenant-a', 'cajero', 'a-2'),
      'users/cashier-b': profile('tenant-b', 'cajero', 'b-1'),
      'users/suspended': profile('tenant-a', 'cajero', 'a-1', 'inactivo'),
      'users/admin': profile('platform', 'superadmin'),
      'users/legacy-owner': profile('legacy-tenant', 'dueño'),
      'branches/a-1': { businessId: 'tenant-a', name: 'Sede A1', status: 'activo' },
      'branches/a-2': { businessId: 'tenant-a', name: 'Sede A2', status: 'activo' },
      'branches/b-1': { businessId: 'tenant-b', name: 'Sede B1', status: 'activo' },
      'products/product-a': {
        businessId: 'tenant-a', name: 'Pan', price: 10, category: 'pan',
        status: 'activo', stock: { 'a-1': 10, 'a-2': 20 },
      },
      'products/product-b': { businessId: 'tenant-b', name: 'Torta', price: 20, stock: { 'b-1': 15 } },
      'categories/category-a': { businessId: 'tenant-a', name: 'Pan' },
      'categories/category-b': { businessId: 'tenant-b', name: 'Torta' },
      'customers/customer-a': { businessId: 'tenant-a', name: 'Cliente A' },
      'customers/customer-b': { businessId: 'tenant-b', name: 'Cliente B' },
      'settings/tenant-a': { businessId: 'tenant-a', companyData: { razonSocial: 'A' } },
      'settings/tenant-b': { businessId: 'tenant-b', companyData: { razonSocial: 'B' } },
      'settings/legacy-tenant': { companyData: { razonSocial: 'Legacy' } },
      'licenses/tenant-a': { businessId: 'tenant-a', status: 'activa', expiry: now },
      'licenses/tenant-b': { businessId: 'tenant-b', status: 'activa', expiry: now },
      'sales/sale-a': sale(),
      'sales/sale-a2': sale('tenant-a', 'a-2', 'cashier-a2'),
      'sales/sale-b': sale('tenant-b', 'b-1', 'cashier-b'),
      'contracts/contract-a': contract(),
      'contracts/contract-b': contract('tenant-b', 'b-1'),
      'daily_stats/stat-a': { businessId: 'tenant-a', branchId: 'a-1', date: '2026-10-02', totalOrders: 1 },
      'daily_stats/stat-a2': { businessId: 'tenant-a', branchId: 'a-2', date: '2026-10-02', totalOrders: 1 },
      'daily_stats/stat-b': { businessId: 'tenant-b', branchId: 'b-1', date: '2026-10-02', totalOrders: 1 },
      'cash_sessions/session-a': { businessId: 'tenant-a', branchId: 'a-1', userId: 'cashier-a', status: 'open', openedAt: isoDate },
      'cash_sessions/session-a2': { businessId: 'tenant-a', branchId: 'a-2', userId: 'cashier-a2', status: 'open', openedAt: isoDate },
      'cash_sessions/session-b': { businessId: 'tenant-b', branchId: 'b-1', userId: 'cashier-b', status: 'open', openedAt: isoDate },
      'alerts/alert-a': { businessId: 'tenant-a', branchId: 'a-1', read: false },
      'alerts/alert-b': { businessId: 'tenant-b', branchId: 'b-1', read: false },
      'invites/invited@example.test': invitation,
      'invites/other@example.test': { ...invitation, email: 'other@example.test', businessId: 'tenant-b', branchId: 'b-1' },
      'invites/owner-invited@example.test': {
        businessId: 'tenant-a', email: 'owner-invited@example.test',
        role: 'dueño', firstName: 'Dueña', lastName: 'Invitada', status: 'activo',
      },
      'invites/platform-invited@example.test': { ...invitation, email: 'platform-invited@example.test', role: 'superadmin' },
      'system/status': { maintenanceEnabled: false },
      'unknown/secret': { businessId: 'tenant-a', secret: 'fixture' },
    };
    const batch = writeBatch(fixtureDb);
    for (const [path, data] of Object.entries(fixtures)) batch.set(doc(fixtureDb, path), data);
    await batch.commit();
  });
});

after(async () => { if (env) await env.cleanup(); });

describe('Identity and invitations', () => {
  it('unauthenticated users cannot read private data', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'products/product-a')));
  });
  it('profiles without authorization cannot access tenant data or forge claims', async () => {
    await assertFails(getDoc(doc(db('stranger', { role: 'superadmin', businessId: 'tenant-a' }), 'products/product-a')));
  });
  it('suspended users read their profile but cannot access business data', async () => {
    await assertSucceeds(getDoc(doc(db('suspended'), 'users/suspended')));
    await assertFails(getDoc(doc(db('suspended'), 'products/product-a')));
    await assertFails(updateDoc(doc(db('suspended'), 'products/product-a'), { 'stock.a-1': 0 }));
  });
  it('self-registration as superadmin is rejected', async () => {
    await assertFails(setDoc(doc(db('stranger'), 'users/stranger'), { ...profile('platform', 'superadmin') }));
  });
  it('a user without invitation cannot create a profile', async () => {
    await assertFails(setDoc(doc(db('stranger'), 'users/stranger'), { ...invitedUser, email: 'stranger@example.test' }));
  });
  it('a new user reads only their exact authenticated invitation', async () => {
    await assertSucceeds(getDoc(doc(ownDb(), 'invites/invited@example.test')));
    await assertFails(getDoc(doc(ownDb(), 'invites/other@example.test')));
    await assertFails(getDocs(collection(ownDb(), 'invites')));
  });
  it('an unverified email cannot claim or read an invitation', async () => {
    const unverified = db('invited', { email_verified: false });
    await assertFails(getDoc(doc(unverified, 'invites/invited@example.test')));
    await assertFails(setDoc(doc(unverified, 'users/invited'), invitedUser));
  });
  it('a valid invitation creates only its correct profile and can then be deleted', async () => {
    const actor = ownDb();
    await assertFails(deleteDoc(doc(actor, 'invites/invited@example.test')));
    await assertSucceeds(setDoc(doc(actor, 'users/invited'), invitedUser));
    await assertSucceeds(getDoc(doc(actor, 'users/invited')));
    await assertFails(deleteDoc(doc(actor, 'invites/other@example.test')));
    await assertSucceeds(deleteDoc(doc(actor, 'invites/invited@example.test')));
  });
  for (const [field, value] of Object.entries({
    email: 'other@example.test', businessId: 'tenant-b', role: 'dueño',
    branchId: 'a-2', shiftStart: '00:00', shiftEnd: '23:59', status: 'inactivo',
  })) {
    it(`invited profile cannot choose ${field}`, async () => {
      await assertFails(setDoc(doc(ownDb(), 'users/invited'), { ...invitedUser, [field]: value }));
    });
  }
  it('an invited user cannot create someone else or add privileged fields', async () => {
    await assertFails(setDoc(doc(ownDb(), 'users/another'), invitedUser));
    await assertFails(setDoc(doc(ownDb(), 'users/invited'), { ...invitedUser, platformAdmin: true }));
  });
  it('even a legacy superadmin invitation cannot bootstrap platform privileges', async () => {
    const actor = db('platform-invited');
    await assertFails(setDoc(doc(actor, 'users/platform-invited'), {
      ...invitedUser, email: 'platform-invited@example.test', role: 'superadmin',
    }));
  });
  it('platform owner invitations with omitted branch and shift fields remain compatible', async () => {
    await assertSucceeds(setDoc(doc(db('owner-invited'), 'users/owner-invited'), {
      email: 'owner-invited@example.test', businessId: 'tenant-a', role: 'dueño',
      firstName: 'Dueña', lastName: 'Invitada', status: 'activo', branchId: null,
      shiftStart: null, shiftEnd: null, createdAt: isoDate,
    }));
  });
  it('owners create and manage invitations only inside their tenant', async () => {
    const actor = ownerDb();
    await assertSucceeds(setDoc(doc(actor, 'invites/new@example.test'), { ...invitation, email: 'new@example.test' }));
    await assertSucceeds(updateDoc(doc(actor, 'invites/invited@example.test'), { firstName: 'Nuevo nombre' }));
    await assertFails(setDoc(doc(actor, 'invites/foreign@example.test'), { ...invitation, email: 'foreign@example.test', businessId: 'tenant-b', branchId: 'b-1' }));
    await assertFails(updateDoc(doc(actor, 'invites/other@example.test'), { firstName: 'Ataque' }));
    await assertFails(deleteDoc(doc(actor, 'invites/other@example.test')));
  });
  it('owners cannot invite superadmins or assign a foreign branch', async () => {
    await assertFails(setDoc(doc(ownerDb(), 'invites/new@example.test'), { ...invitation, email: 'new@example.test', role: 'superadmin' }));
    await assertFails(updateDoc(doc(ownerDb(), 'invites/invited@example.test'), { branchId: 'b-1' }));
  });
  it('superadmins administer invitations cross-tenant', async () => {
    await assertSucceeds(updateDoc(doc(adminDb(), 'invites/other@example.test'), { firstName: 'Actualizado' }));
    await assertSucceeds(deleteDoc(doc(adminDb(), 'invites/other@example.test')));
  });
  it('own personal names and terms acceptance can be changed safely', async () => {
    await assertSucceeds(updateDoc(doc(cashierDb(), 'users/cashier-a'), { firstName: 'Nuevo', lastName: 'Nombre' }));
    await assertSucceeds(updateDoc(doc(cashierDb(), 'users/cashier-a'), {
      hasAcceptedTerms: true, termsAcceptedAt: serverTimestamp(), termsVersion: '1.1',
    }));
  });
  for (const [field, value] of Object.entries({
    businessId: 'tenant-b', role: 'dueño', status: 'inactivo', branchId: 'a-2',
    shiftStart: '00:00', shiftEnd: '23:59', email: 'another@example.test', platformAdmin: true,
  })) {
    it(`cashiers cannot self-edit protected field ${field}`, async () => {
      await assertFails(updateDoc(doc(cashierDb(), 'users/cashier-a'), { [field]: value }));
    });
  }
  it('deleting protected fields cannot bypass the self-edit whitelist', async () => {
    await assertFails(updateDoc(doc(cashierDb(), 'users/cashier-a'), { branchId: deleteField() }));
  });
  it('owners cannot promote themselves or others to superadmin', async () => {
    await assertFails(updateDoc(doc(ownerDb(), 'users/owner-a'), { role: 'superadmin' }));
    await assertFails(updateDoc(doc(ownerDb(), 'users/cashier-a'), { role: 'superadmin' }));
    await assertFails(updateDoc(doc(ownerDb(), 'users/admin'), { firstName: 'Ataque' }));
  });
  it('owners administrate ordinary users only in their tenant without changing identity', async () => {
    await assertSucceeds(updateDoc(doc(ownerDb(), 'users/cashier-a'), { role: 'dueño' }));
    await assertFails(updateDoc(doc(ownerDb(), 'users/cashier-b'), { status: 'inactivo' }));
    await assertFails(updateDoc(doc(ownerDb(), 'users/cashier-a'), { businessId: 'tenant-b' }));
    await assertFails(updateDoc(doc(ownerDb(), 'users/cashier-a'), { email: 'changed@example.test' }));
    await assertFails(updateDoc(doc(adminDb(), 'users/cashier-a'), { email: 'changed@example.test' }));
  });
  it('owner A cannot read users from B and cashiers cannot list arbitrary users', async () => {
    await assertFails(getDoc(doc(ownerDb(), 'users/cashier-b')));
    await assertFails(getDoc(doc(cashierDb(), 'users/cashier-a2')));
    await assertSucceeds(getDoc(doc(cashierDb(), 'users/cashier-a')));
    await assertSucceeds(getDocs(query(collection(ownerDb(), 'users'), where('businessId', '==', 'tenant-a'), where('role', '!=', 'superadmin'))));
    await assertFails(getDocs(collection(ownerDb(), 'users')));
  });
});

describe('Tenant collections and stock', () => {
  it('tenant A reads its product but cannot read tenant B', async () => {
    await assertSucceeds(getDoc(doc(cashierDb(), 'products/product-a')));
    await assertFails(getDoc(doc(cashierDb(), 'products/product-b')));
  });
  it('owners create their categories but cannot create foreign or tenant-less categories', async () => {
    await assertSucceeds(setDoc(doc(ownerDb(), 'categories/new'), { businessId: 'tenant-a', name: 'Nuevo' }));
    await assertFails(setDoc(doc(ownerDb(), 'categories/foreign'), { businessId: 'tenant-b', name: 'Ataque' }));
    await assertFails(setDoc(doc(ownerDb(), 'categories/no-tenant'), { name: 'Ataque' }));
  });
  it('business IDs are immutable on branches, categories, products and customers', async () => {
    for (const path of ['branches/a-1', 'categories/category-a', 'products/product-a', 'customers/customer-a']) {
      await assertFails(updateDoc(doc(ownerDb(), path), { businessId: 'tenant-b' }));
    }
  });
  it('cashiers cannot write settings', async () => {
    await assertFails(updateDoc(doc(cashierDb(), 'settings/tenant-a'), { companyData: { razonSocial: 'Ataque' } }));
  });
  it('settings use the canonical tenant path and support legacy documents without a tenant field', async () => {
    await assertFails(getDoc(doc(ownerDb(), 'settings/tenant-b')));
    await assertFails(updateDoc(doc(ownerDb(), 'settings/tenant-a'), { businessId: 'tenant-b' }));
    await assertSucceeds(setDoc(doc(db('legacy-owner'), 'settings/legacy-tenant'), {
      businessId: 'legacy-tenant', companyData: { razonSocial: 'Actualizado' },
    }, { merge: true }));
  });
  for (const [field, value] of Object.entries({ price: 1, name: 'Ataque', category: 'otra', status: 'inactivo' })) {
    it(`cashiers cannot change product ${field}`, async () => {
      await assertFails(updateDoc(doc(cashierDb(), 'products/product-a'), { [field]: value }));
    });
  }
  it('cashiers update only the stock key of their own branch', async () => {
    await assertSucceeds(updateDoc(doc(cashierDb(), 'products/product-a'), { 'stock.a-1': increment(-1) }));
    await assertFails(updateDoc(doc(cashierDb(), 'products/product-a'), { 'stock.a-2': increment(-1) }));
    await assertFails(updateDoc(doc(cashierDb(), 'products/product-a'), { 'stock.a-1': 1, 'stock.a-2': 1 }));
  });
  it('stock key additions, removals and extra top-level fields cannot bypass the whitelist', async () => {
    await assertFails(updateDoc(doc(cashierDb(), 'products/product-a'), { 'stock.a-2': deleteField() }));
    await assertFails(updateDoc(doc(cashierDb(), 'products/product-a'), { 'stock.b-1': 100 }));
    await assertFails(updateDoc(doc(cashierDb(), 'products/product-a'), { stock: 5 }));
    await assertFails(updateDoc(doc(cashierDb(), 'products/product-a'), { 'stock.a-1': 5, privileged: true }));
  });
  it('tenant filters are required and sufficient for catalog, customers, contracts and branches queries', async () => {
    for (const name of ['products', 'categories', 'customers', 'contracts', 'branches']) {
      await assertSucceeds(getDocs(query(collection(cashierDb(), name), where('businessId', '==', 'tenant-a'))));
      await assertFails(getDocs(collection(cashierDb(), name)));
    }
  });
  it('cashiers read same-tenant customers but only owners or admins write them', async () => {
    await assertSucceeds(getDoc(doc(cashierDb(), 'customers/customer-a')));
    await assertFails(updateDoc(doc(cashierDb(), 'customers/customer-a'), { name: 'Ataque' }));
    await assertFails(getDoc(doc(ownerDb(), 'customers/customer-b')));
    await assertSucceeds(updateDoc(doc(ownerDb(), 'customers/customer-a'), { name: 'Actualizado' }));
  });
});

describe('Licenses', () => {
  it('users read only their own tenant license', async () => {
    await assertSucceeds(getDoc(doc(cashierDb(), 'licenses/tenant-a')));
    await assertFails(getDoc(doc(cashierDb(), 'licenses/tenant-b')));
    await assertFails(getDocs(collection(ownerDb(), 'licenses')));
  });
  it('ordinary users cannot create, change or delete licenses', async () => {
    await assertFails(updateDoc(doc(ownerDb(), 'licenses/tenant-a'), { status: 'activa', expiry: now }));
    await assertFails(deleteDoc(doc(ownerDb(), 'licenses/tenant-a')));
    await assertFails(setDoc(doc(ownerDb(), 'licenses/new'), { businessId: 'tenant-a', status: 'activa', expiry: now }));
  });
  it('superadmins administer licenses cross-tenant', async () => {
    await assertSucceeds(getDocs(collection(adminDb(), 'licenses')));
    await assertSucceeds(updateDoc(doc(adminDb(), 'licenses/tenant-b'), { expiry: now }));
    await assertSucceeds(setDoc(doc(adminDb(), 'licenses/tenant-c'), { businessId: 'tenant-c', status: 'activa', expiry: now }));
    await assertSucceeds(deleteDoc(doc(adminDb(), 'licenses/tenant-c')));
  });
});

describe('Financial collections and query compatibility', () => {
  it('sales require the actor tenant, actor UID and permitted branch', async () => {
    await assertSucceeds(setDoc(doc(cashierDb(), 'sales/new'), sale()));
    await assertFails(setDoc(doc(cashierDb(), 'sales/foreign'), sale('tenant-b', 'b-1', 'cashier-a', 'foreign')));
    await assertFails(setDoc(doc(cashierDb(), 'sales/other-branch'), sale('tenant-a', 'a-2', 'cashier-a', 'other-branch')));
    await assertFails(setDoc(doc(cashierDb(), 'sales/other-user'), sale('tenant-a', 'a-1', 'owner-a', 'other-user')));
    await assertFails(setDoc(doc(ownerDb(), 'sales/foreign-branch'), sale('tenant-a', 'b-1', 'owner-a', 'foreign-branch')));
  });
  for (const [label, override] of Object.entries({
    'negative total': { total: -1 }, 'empty items': { items: [] },
    'non-list items': { items: {} },
    'non-numeric total': { total: '10' },
    'non-timestamp creation': { createdAt: isoDate },
    'pre-voided sale': { voided: true },
  })) {
    it(`sales reject ${label}`, async () => {
      await assertFails(setDoc(doc(cashierDb(), 'sales/invalid'), { ...sale('tenant-a', 'a-1', 'cashier-a', 'invalid'), ...override }));
    });
  }
  it('sales accept more than 20 distinct products without an artificial limit', async () => {
    const items = Array.from({ length: 30 }, (_, index) => ({ ...item, id: `product-${index}` }));
    await assertSucceeds(setDoc(doc(cashierDb(), 'sales/many-lines'), {
      ...sale('tenant-a', 'a-1', 'cashier-a', 'many-lines'), items, total: 300, amountPaid: 300,
    }));
  });
  it('cashier sales queries need the assigned branch while owners can query their whole tenant', async () => {
    await assertSucceeds(getDocs(query(collection(cashierDb(), 'sales'),
      where('businessId', '==', 'tenant-a'), where('branchId', '==', 'a-1'), orderBy('createdAt', 'desc'), limit(50))));
    await assertFails(getDocs(query(collection(cashierDb(), 'sales'), where('businessId', '==', 'tenant-a'))));
    await assertSucceeds(getDocs(query(collection(ownerDb(), 'sales'), where('businessId', '==', 'tenant-a'))));
    await assertFails(getDoc(doc(cashierDb(), 'sales/sale-a2')));
  });
  it('cash reconciliation query is authorized with tenant, branch and session filters', async () => {
    await assertSucceeds(getDocs(query(collection(cashierDb(), 'sales'),
      where('businessId', '==', 'tenant-a'), where('branchId', '==', 'a-1'), where('sessionId', '==', 'session-a'))));
  });
  it('voiding accepts only expected audit fields and blocks repeated voids', async () => {
    const change = { voided: true, voidedAt: now, voidReason: 'Error', voidedByName: 'Cajera', voidedByRole: 'cajero' };
    await assertSucceeds(updateDoc(doc(cashierDb(), 'sales/sale-a'), change));
    await assertFails(updateDoc(doc(cashierDb(), 'sales/sale-a'), change));
    await assertFails(updateDoc(doc(cashierDb(), 'sales/sale-a2'), change));
  });
  for (const [field, value] of Object.entries({
    total: 1, items: [{ ...item, price: 0 }], businessId: 'tenant-b',
    branchId: 'a-2', userId: 'owner-a', unexpected: true,
  })) {
    it(`voiding cannot change or add protected field ${field}`, async () => {
      await assertFails(updateDoc(doc(cashierDb(), 'sales/sale-a'), {
        voided: true, voidedAt: now, voidReason: 'Error', voidedByName: 'Cajera', voidedByRole: 'cajero', [field]: value,
      }));
    });
  }
  it('online POS and voiding batches remain authorized', async () => {
    const actor = cashierDb();
    const create = writeBatch(actor);
    create.set(doc(actor, 'sales/new'), sale());
    create.update(doc(actor, 'products/product-a'), { 'stock.a-1': increment(-1) });
    create.set(doc(actor, 'daily_stats/stat-a'), { businessId: 'tenant-a', branchId: 'a-1', totalOrders: increment(1) }, { merge: true });
    await assertSucceeds(create.commit());
    const cancel = writeBatch(actor);
    cancel.update(doc(actor, 'sales/new'), { voided: true, voidedAt: now, voidReason: 'Error', voidedByName: 'Cajera', voidedByRole: 'cajero' });
    cancel.update(doc(actor, 'products/product-a'), { 'stock.a-1': increment(1) });
    cancel.set(doc(actor, 'daily_stats/stat-a'), { totalOrders: increment(-1) }, { merge: true });
    cancel.set(doc(actor, 'alerts/new'), { businessId: 'tenant-a', branchId: 'a-1', read: false });
    await assertSucceeds(cancel.commit());
  });
  it('contracts remain cross-branch within a tenant and reject cross-tenant accesses', async () => {
    await assertSucceeds(setDoc(doc(cashierDb(), 'contracts/new'), contract('tenant-a', 'a-2')));
    await assertSucceeds(updateDoc(doc(cashierDb(), 'contracts/new'), { deliveryType: 'a-1', status: 'entregado' }));
    await assertFails(setDoc(doc(cashierDb(), 'contracts/foreign'), contract('tenant-b', 'b-1')));
    await assertFails(getDoc(doc(cashierDb(), 'contracts/contract-b')));
    await assertFails(updateDoc(doc(cashierDb(), 'contracts/contract-a'), { businessId: 'tenant-b' }));
    await assertFails(deleteDoc(doc(cashierDb(), 'contracts/contract-a')));
    await assertSucceeds(deleteDoc(doc(ownerDb(), 'contracts/contract-a')));
  });
  it('delivered contracts support debt transitions and reject unknown statuses', async () => {
    const target = doc(cashierDb(), 'contracts/contract-a');
    await assertSucceeds(updateDoc(target, { status: 'entregado' }));
    await assertSucceeds(updateDoc(target, { status: 'entregado_con_deuda' }));
    await assertSucceeds(updateDoc(target, { status: 'entregado' }));
    await assertFails(updateDoc(target, { status: 'invalid' }));
  });
  it('more than 20 products remain authorized in complete POS and voiding batches', async () => {
    const items = Array.from({ length: 30 }, (_, index) => ({ ...item, id: `line-${index}` }));
    await env.withSecurityRulesDisabled(async ctx => {
      const fixtures = writeBatch(ctx.firestore());
      for (const line of items) fixtures.set(doc(ctx.firestore(), 'products', line.id), {
        businessId: 'tenant-a', name: line.name, price: line.price, stock: { 'a-1': 10 },
      });
      await fixtures.commit();
    });
    const actor = cashierDb();
    const create = writeBatch(actor);
    create.set(doc(actor, 'sales/max-batch'), {
      ...sale('tenant-a', 'a-1', 'cashier-a', 'max-batch'), items, total: 300, amountPaid: 300,
    });
    for (const line of items) create.update(doc(actor, 'products', line.id), { 'stock.a-1': increment(-1) });
    create.set(doc(actor, 'daily_stats/stat-a'), { totalOrders: increment(1) }, { merge: true });
    await assertSucceeds(create.commit());
    const cancel = writeBatch(actor);
    cancel.update(doc(actor, 'sales/max-batch'), {
      voided: true, voidedAt: now, voidReason: 'Error', voidedByName: 'Cajera', voidedByRole: 'cajero',
    });
    for (const line of items) cancel.update(doc(actor, 'products', line.id), { 'stock.a-1': increment(1) });
    cancel.set(doc(actor, 'daily_stats/stat-a'), { totalOrders: increment(-1) }, { merge: true });
    cancel.set(doc(actor, 'alerts/max-batch'), { businessId: 'tenant-a', branchId: 'a-1', read: false });
    await assertSucceeds(cancel.commit());
  });
  it('daily stats are isolated by tenant and assigned branch', async () => {
    await assertSucceeds(updateDoc(doc(cashierDb(), 'daily_stats/stat-a'), { totalOrders: increment(1) }));
    await assertFails(getDoc(doc(cashierDb(), 'daily_stats/stat-a2')));
    await assertFails(updateDoc(doc(cashierDb(), 'daily_stats/stat-a2'), { totalOrders: 0 }));
    await assertFails(setDoc(doc(cashierDb(), 'daily_stats/new'), { businessId: 'tenant-b', branchId: 'b-1' }));
    await assertFails(updateDoc(doc(ownerDb(), 'daily_stats/stat-a'), { branchId: 'a-2' }));
    await assertSucceeds(getDocs(query(collection(cashierDb(), 'daily_stats'), where('businessId', '==', 'tenant-a'), where('branchId', '==', 'a-1'))));
    await assertFails(getDocs(query(collection(cashierDb(), 'daily_stats'), where('businessId', '==', 'tenant-a'))));
  });
  it('cash sessions reject cross-tenant, cross-branch and false actor identity', async () => {
    await assertSucceeds(setDoc(doc(cashierDb(), 'cash_sessions/new'), { businessId: 'tenant-a', branchId: 'a-1', userId: 'cashier-a', status: 'open' }));
    await assertFails(setDoc(doc(cashierDb(), 'cash_sessions/foreign'), { businessId: 'tenant-b', branchId: 'b-1', userId: 'cashier-a' }));
    await assertFails(setDoc(doc(cashierDb(), 'cash_sessions/wrong-user'), { businessId: 'tenant-a', branchId: 'a-1', userId: 'owner-a' }));
    await assertFails(getDoc(doc(cashierDb(), 'cash_sessions/session-a2')));
    await assertFails(updateDoc(doc(cashierDb(), 'cash_sessions/session-a'), { userId: 'owner-a' }));
    await assertSucceeds(updateDoc(doc(cashierDb(), 'cash_sessions/session-a'), { status: 'closed', closedAt: isoDate }));
    await assertSucceeds(updateDoc(doc(ownerDb(), 'cash_sessions/session-a2'), { status: 'closed' }));
  });
  it('offline session merge and sale batches use the same authorized schema', async () => {
    const actor = cashierDb();
    await assertSucceeds(setDoc(doc(actor, 'cash_sessions/offline'), {
      businessId: 'tenant-a', branchId: 'a-1', userId: 'cashier-a',
      status: 'closed', openedAt: isoDate, closedAt: isoDate, syncedAt: isoDate,
    }, { merge: true }));
    const batch = writeBatch(actor);
    batch.set(doc(actor, 'sales/offline'), { ...sale('tenant-a', 'a-1', 'cashier-a', 'offline'), sync: true, syncedAt: now });
    batch.update(doc(actor, 'products/product-a'), { 'stock.a-1': increment(-1) });
    batch.set(doc(actor, 'daily_stats/new-offline'), {
      businessId: 'tenant-a', branchId: 'a-1', date: '2026-10-02',
      totalRevenue: increment(10), totalOrders: increment(1),
      paymentMethods: { efectivo: increment(10) },
    }, { merge: true });
    await assertSucceeds(batch.commit());
  });
});

describe('Alerts, platform and Storage', () => {
  it('other tenant alerts cannot be read or updated', async () => {
    await assertFails(getDoc(doc(ownerDb(), 'alerts/alert-b')));
    await assertFails(updateDoc(doc(ownerDb(), 'alerts/alert-b'), { read: true }));
    await assertFails(getDoc(doc(cashierDb(), 'alerts/alert-a')));
    await assertSucceeds(getDoc(doc(ownerDb(), 'alerts/alert-a')));
    await assertSucceeds(updateDoc(doc(ownerDb(), 'alerts/alert-a'), { read: true }));
  });
  it('alert creation is tenant scoped and deletion stays blocked', async () => {
    await assertSucceeds(setDoc(doc(cashierDb(), 'alerts/new'), { businessId: 'tenant-a', read: false }));
    await assertFails(setDoc(doc(cashierDb(), 'alerts/foreign'), { businessId: 'tenant-b', read: false }));
    await assertFails(deleteDoc(doc(ownerDb(), 'alerts/alert-a')));
    await assertFails(deleteDoc(doc(adminDb(), 'alerts/alert-a')));
  });
  it('notification query proves tenant ownership', async () => {
    await assertSucceeds(getDocs(query(collection(ownerDb(), 'alerts'), where('businessId', '==', 'tenant-a'), where('read', '==', false))));
    await assertFails(getDocs(query(collection(ownerDb(), 'alerts'), where('read', '==', false))));
  });
  it('public maintenance reads remain available while writes require a superadmin', async () => {
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'system/status')));
    await assertFails(updateDoc(doc(ownerDb(), 'system/status'), { maintenanceEnabled: true }));
    await assertSucceeds(updateDoc(doc(adminDb(), 'system/status'), { maintenanceEnabled: true }));
  });
  it('the final wildcard denies undeclared collections', async () => {
    await assertFails(getDoc(doc(adminDb(), 'unknown/secret')));
    await assertFails(setDoc(doc(adminDb(), 'unknown/new'), { businessId: 'tenant-a' }));
  });
  it('superadmins retain cross-tenant administrative reads', async () => {
    for (const path of ['products/product-b', 'sales/sale-b', 'contracts/contract-b', 'cash_sessions/session-b', 'alerts/alert-b']) {
      await assertSucceeds(getDoc(doc(adminDb(), path)));
    }
    await assertSucceeds(deleteDoc(doc(adminDb(), 'sales/sale-b')));
  });
  it('Storage denies reads and writes even for authenticated platform users', async () => {
    for (const actor of [env.unauthenticatedContext(), context('cashier-a'), context('admin')]) {
      await assertFails(getBytes(ref(actor.storage(), 'private/fixture.txt')));
      await assertFails(uploadBytes(ref(actor.storage(), 'private/new.txt'), new Uint8Array([1])));
    }
  });
});
