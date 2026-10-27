import { createSparkCashClosingRepository } from '../frontend/src/features/cash-register/infrastructure/sparkCashClosingRepository.js';
import { createBranchWriter } from '../frontend/src/features/branches/infrastructure/branchWrites.js';
import { isBranchOperational, resolveOperationalBranch } from '../frontend/src/features/branches/domain/branchPolicy.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, beforeEach, after, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { createSparkAdministrationRepository } from '../frontend/src/features/licenses/infrastructure/sparkAdministrationRepository.js';
import { acceptInvitation } from '../frontend/src/features/users/infrastructure/acceptInvitation.js';
import { updateProductTransaction } from '../frontend/src/features/catalog/infrastructure/productWrites.js';
import { cashLockId, createSparkCashRepository } from '../frontend/src/features/cash-register/infrastructure/sparkCashRepository.js';
import { createCashStateReader, createCashPeriodReader } from '../frontend/src/features/cash-register/infrastructure/cashQueryRepository.js';
import { createHash } from 'node:crypto';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080', 'Only the local demo-migapos Firestore Emulator is allowed.');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-migapos');
const { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, deleteDoc, deleteField, writeBatch, serverTimestamp, Timestamp, setLogLevel } = sdk;
setLogLevel('silent');
let env;
const claims = email => ({ email, email_verified: true, firebase: { sign_in_provider: 'google.com' } });
const dbFor = (uid, email = `${uid}@gmail.com`, extra = {}) => env.authenticatedContext(uid, { ...claims(email), ...extra }).firestore();
const repository = (uid = 'admin', database = dbFor(uid)) => createSparkAdministrationRepository(database, { currentUser: () => ({ uid, email: `${uid}@gmail.com` }), sdk });
const input = (suffix = 'one') => ({ operationId: `operation_${suffix}_123456789`, businessName: 'MigaPOS Laboratorio', ownerEmail: `${suffix}@gmail.com`, firstName: 'Dueña', lastName: 'Prueba', months: 1 });
const seed = async entries => env.withSecurityRulesDisabled(async ctx => { for (const [path, value] of Object.entries(entries)) await setDoc(doc(ctx.firestore(), path), value); });
const dump = async path => {
  let result;
  await env.withSecurityRulesDisabled(async ctx => { result = await getDoc(doc(ctx.firestore(), path)); });
  return result;
};
const create = async (suffix = 'one') => { const data = input(suffix); const result = await repository().createTenant(data); return { ...result, data }; };
const googleUser = (uid = 'owner', email = 'one@gmail.com') => ({ uid, email, emailVerified: true, providerData: [{ providerId: 'google.com' }] });
const businessOwner = async () => {
  const created = await create(), user = googleUser(), database = dbFor(user.uid, user.email);
  await acceptInvitation(database, user, { sdk });
  return { ...created, database, user };
};
const rawBundle = (database, data, { omit, mutate = entries => entries } = {}) => {
  const businessId = data.operationId, branchId = `main_${businessId}`, time = serverTimestamp();
  const entries = {
    [`platform_operations/admin_${businessId}`]: { ...data, maxActiveBranches: data.maxActiveBranches ?? 1, maxRegisteredBranches: data.maxRegisteredBranches ?? Math.max(5, data.maxActiveBranches ?? 1), actorId: 'admin', operation: 'createTenant', businessId, branchId, expiry: Timestamp.fromMillis(Date.now() + 30 * 86400000), createdAt: time },
    [`tenants/${businessId}`]: { businessId, businessName: data.businessName, ownerEmail: data.ownerEmail, status: 'active', schemaVersion: 1, operationId: businessId, createdAt: time },
  };
  const op = entries[`platform_operations/admin_${businessId}`];
  entries[`licenses/${businessId}`] = { businessId, businessName: data.businessName, status: 'activa', tenantStatus: 'active', expiry: op.expiry, maxActiveBranches: op.maxActiveBranches, maxRegisteredBranches: op.maxRegisteredBranches, activeBranchIds: [branchId], registeredBranchIds: [branchId], branchQuotaVersion: 1, registeredBranchQuotaVersion: 1, operationId: businessId, createdAt: time };
  entries[`branches/${branchId}`] = { businessId, name: 'Sede Principal', address: 'Dirección por definir', phone: '', status: 'activo', sparkCashVersion: 1, branchLifecycleVersion: 1, operationId: businessId, createdAt: time };
  entries[`settings/${businessId}`] = { businessId, operationId: businessId, companyData: { razonSocial: data.businessName, ruc: '', direccion: 'Dirección por definir', telefono: '' } };
  entries[`invites/${data.ownerEmail}`] = { businessId, email: data.ownerEmail, firstName: data.firstName, lastName: data.lastName, role: 'dueño', branchId: 'global', shiftStart: null, shiftEnd: null, status: 'activo', createdAt: time, operationId: businessId };
  entries[`owner_email_claims/${data.ownerEmail}`] = { businessId, email: data.ownerEmail, operationId: businessId, createdAt: time };
  const batch = writeBatch(database);
  for (const [path, value] of Object.entries(mutate(entries))) if (!path.startsWith(`${omit}/`)) batch.set(doc(database, path), value);
  return batch.commit();
};
const cashRepository = (database, uid = 'owner') => createSparkCashRepository(database, { currentUser: () => ({ uid }), sdk });
const rawCash = async (database, businessId, branchId, { userId = 'owner', sessionId = 'cash-opening-123456789', session = {}, lock = {}, omit, omitDuration = false } = {}) => {
  const id = await cashLockId(businessId, branchId), timestamp = serverTimestamp(), batch = writeBatch(database);
  const opening = { businessId, branchId, userId, status: 'open', openingAmount: 20, openingNote: '', cashierName: 'Dueña Prueba', openedAt: timestamp, syncedAt: timestamp, runtime: 'spark', durationHours: 10, ...session };
  if (omitDuration) delete opening.durationHours;
  if (omit !== 'session') batch.set(doc(database, 'cash_sessions', sessionId), opening);
  if (omit !== 'lock') batch.set(doc(database, 'active_cash_sessions', id), { businessId, branchId, userId, sessionId, status: 'open', runtime: 'spark', updatedAt: timestamp, ...lock });
  return batch.commit();
};

before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-migapos', firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') } }); });
beforeEach(async () => { await env.clearFirestore(); await seed({ 'users/admin': { role: 'superadmin', businessId: 'platform-admin', email: 'admin@gmail.com', status: 'activo' },
  'users/admin2': { role: 'superadmin', businessId: 'platform-admin', email: 'admin2@gmail.com', status: 'activo' } }); });
after(async () => env?.cleanup());

describe('SPARK-1 provisioning, identity and license authority', () => {
  it('creates every linked document and replays exactly once, including after invitation acceptance', async () => {
    const { businessId, branchId, data } = await create();
    for (const path of [`tenants/${businessId}`, `licenses/${businessId}`, `branches/${branchId}`, `settings/${businessId}`, 'invites/one@gmail.com', 'owner_email_claims/one@gmail.com']) assert.equal((await dump(path)).exists(), true, path);
    assert.deepEqual(await repository().createTenant(data), { businessId, branchId, status: 'active' });
    const owner = googleUser();
    assert.equal((await acceptInvitation(dbFor(owner.uid, owner.email), owner, { sdk })).role, 'dueño');
    assert.equal((await dump('invites/one@gmail.com')).exists(), false);
    assert.deepEqual(await repository().createTenant(data), { businessId, branchId, status: 'active' });
    await assert.rejects(repository().createTenant({ ...data, businessName: 'Changed' }), { code: 'operation-conflict' });
    assert.equal((await repository().administrationPage()).rows[0].ownerEmail, 'one@gmail.com');
  });
  it('paginates existing licenses, including tenants without metadata or a registered owner', async () => {
    await create('one'); await create('two');
    await seed({ 'licenses/legacy': { businessId: 'legacy', businessName: 'Anterior', status: 'activa', expiry: Timestamp.fromMillis(Date.now() + 86400000) } });
    const first = await repository().administrationPage({ limit: 1 });
    const next = await repository().administrationPage({ limit: 2, cursor: first.cursor });
    assert.equal(first.rows.length, 1); assert.equal(first.rows[0].businessName, 'Anterior'); assert.equal(next.rows.length, 2);
  });
  it('rejects every incomplete provisioning bundle without leaving any tenant', async () => {
    for (const omit of ['tenants', 'licenses', 'branches', 'settings', 'invites', 'owner_email_claims', 'platform_operations']) {
      const data = input(omit); await assertFails(rawBundle(dbFor('admin'), data, { omit }));
      assert.equal((await dump(`tenants/${data.operationId}`)).exists(), false, omit);
    }
  });
  it('rejects foreign document links, extra privileged fields and forged invitation roles', async () => {
    for (const [collectionName, field, value] of [['branches', 'businessId', 'foreign'], ['settings', 'businessId', 'foreign'], ['invites', 'role', 'superadmin'], ['licenses', 'status', 'inactiva'], ['tenants', 'maintenanceJobId', 'fake']]) {
      await assertFails(rawBundle(dbFor('admin'), input(collectionName), { mutate: entries => Object.fromEntries(Object.entries(entries).map(([path, data]) => [path, path.startsWith(`${collectionName}/`) ? { ...data, [field]: value } : data])) }));
    }
  });
  it('serializes two admins reserving one owner email and refuses legacy/own emails', async () => {
    const data = input('race');
    const results = await Promise.allSettled([repository().createTenant(data), repository('admin2').createTenant({ ...data, operationId: input('race2').operationId })]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    await seed({ 'users/legacy-user': { email: 'legacy@gmail.com', businessId: 'old', role: 'dueño' } });
    await assert.rejects(repository().createTenant({ ...input('legacy'), ownerEmail: 'legacy@gmail.com' }), { code: 'email-in-use' });
    await assert.rejects(repository().createTenant({ ...input('self'), ownerEmail: 'admin@gmail.com' }), /distinta/);
  });
  it('refuses client provisioning, license forgery, profile escalation and overwriting SuperAdmin', async () => {
    const { businessId } = await create();
    const user = googleUser(); await acceptInvitation(dbFor(user.uid, user.email), user, { sdk });
    await assertFails(rawBundle(dbFor(user.uid, user.email), input('forged')));
    await assertFails(updateDoc(doc(dbFor(user.uid, user.email), 'licenses', businessId), { expiry: Timestamp.fromMillis(Date.now() + 864000000) }));
    await assertFails(updateDoc(doc(dbFor(user.uid, user.email), 'users', user.uid), { role: 'superadmin' }));
    const existing = await acceptInvitation(dbFor('admin'), googleUser('admin', 'admin@gmail.com'), { sdk });
    assert.equal(existing.role, 'superadmin');
    await assertFails(setDoc(doc(dbFor('stranger'), 'users', 'stranger'), { role: 'superadmin', businessId: 'platform-admin' }));
  });
  it('requires verified Google identity, matching invitation and atomic consumption', async () => {
    await create(); const user = googleUser();
    await assertFails(acceptInvitation(dbFor(user.uid, user.email, { email_verified: false }), user, { sdk }));
    await assertFails(acceptInvitation(dbFor(user.uid, user.email, { firebase: { sign_in_provider: 'password' } }), user, { sdk }));
    await assertFails(acceptInvitation(dbFor('foreign', 'foreign@gmail.com'), googleUser('foreign'), { sdk }));
    await assertFails(setDoc(doc(dbFor(user.uid, user.email), 'users', user.uid), { email: user.email, firstName: 'Dueña', lastName: 'Prueba', role: 'dueño', businessId: input().operationId,
      branchId: 'global', shiftStart: null, shiftEnd: null, status: 'activo', createdAt: new Date().toISOString() }));
    assert.equal((await dump('users/owner')).exists(), false);
  });
  it('renews and changes status idempotently, but never without a linked immutable receipt', async () => {
    const { businessId } = await create(), repo = repository(), before = (await dump(`licenses/${businessId}`)).data().expiry.toMillis();
    const command = { businessId, operationId: input('renew').operationId, months: 2 };
    await repo.extendTenantLicense(command); const expiry = (await dump(`licenses/${businessId}`)).data().expiry.toMillis();
    assert.ok(expiry > before); await repo.extendTenantLicense(command); assert.equal((await dump(`licenses/${businessId}`)).data().expiry.toMillis(), expiry);
    await repo.setTenantLicenseStatus({ businessId, operationId: input('suspend').operationId, status: 'inactiva' });
    assert.equal((await dump(`licenses/${businessId}`)).data().status, 'inactiva');
    await repo.setTenantLicenseStatus({ businessId, operationId: input('enable').operationId, status: 'activa' });
    await assertFails(updateDoc(doc(dbFor('admin'), 'licenses', businessId), { status: 'inactiva', updatedAt: serverTimestamp(), operationId: input('no-receipt').operationId }));
    await assertFails(deleteDoc(doc(dbFor('admin'), 'owner_email_claims', 'one@gmail.com')));
  });
});

describe('SPARK-2 tenant operations and catalog invariants', () => {
  it('lets the owner administer category/product/branch/contact/settings, and a Google-invited cashier only read its business', async () => {
    const { database, businessId, branchId } = await businessOwner();
    await setDoc(doc(database, 'categories', 'bread'), { businessId, name: 'Pan', status: 'activo' });
    await setDoc(doc(database, 'products', 'bread'), { businessId, name: 'Pan', price: 1.25, category: 'Pan', stock: { [branchId]: 20 }, status: 'activo' });
    await repository().setTenantBranchQuota({ businessId, operationId: input('more').operationId, maxActiveBranches: 2, maxRegisteredBranches: 5 });
    await createBranchWriter(database, { sdk, currentUser: () => ({ uid: 'owner' }) })('second', { businessId, name: 'Segunda', address: '', phone: '', status: 'activo' }, { create: true });
    await setDoc(doc(database, 'customers', 'contact'), { businessId, name: 'Contacto', phone: '999000111' });
    await updateDoc(doc(database, 'settings', businessId), { companyData: { razonSocial: 'Laboratorio', ruc: '', direccion: '', telefono: '' } });
    const invite = { businessId, email: 'cashier@gmail.com', firstName: 'Caja', lastName: 'Prueba', role: 'cajero', branchId, shiftStart: null, shiftEnd: null, status: 'activo', createdAt: new Date().toISOString() };
    await setDoc(doc(database, 'invites', invite.email), invite);
    const cashier = dbFor('cashier', invite.email); await acceptInvitation(cashier, googleUser('cashier', invite.email), { sdk });
    assert.equal((await getDocs(query(collection(cashier, 'products'), where('businessId', '==', businessId)))).size, 1);
    assert.equal((await getDocs(query(collection(database, 'categories'), where('businessId', '==', businessId)))).size, 1);
    for (const [path, value] of [['products/bread', { price: 0 }], [`settings/${businessId}`, { companyData: {} }], ['users/cashier', { role: 'dueño' }], ['users/cashier', { businessId: 'foreign' }]]) await assertFails(updateDoc(doc(cashier, path), value));
    await assertFails(setDoc(doc(cashier, 'invites', 'new@gmail.com'), { ...invite, email: 'new@gmail.com' }));
  });
  it('rejects foreign tenants, platform business access, inactive/expired licenses and disabled tenant metadata', async () => {
    const { database, businessId, branchId } = await businessOwner();
    await setDoc(doc(database, 'products', 'bread'), { businessId, name: 'Pan', price: 1, stock: { [branchId]: 5 } });
    await create('foreign');
    await assertFails(getDoc(doc(dbFor('admin'), 'products', 'bread')));
    await assertFails(setDoc(doc(database, 'categories', 'foreign'), { businessId: input('foreign').operationId, name: 'Falso' }));
    for (const patch of [{ status: 'inactiva' }, { status: 'activa', expiry: Timestamp.fromMillis(Date.now() - 1000) }]) {
      await seed({ [`licenses/${businessId}`]: { businessId, expiry: Timestamp.fromMillis(Date.now() + 86400000), ...patch } });
      await assertFails(updateDoc(doc(database, 'products', 'bread'), { price: 2 }));
      await assertFails(getDoc(doc(database, 'products', 'bread')));
    }
    await seed({ [`licenses/${businessId}`]: { businessId, status: 'activa', expiry: Timestamp.fromMillis(Date.now() + 86400000) }, [`tenants/${businessId}`]: { businessId, status: 'deleting' } });
    await assertFails(updateDoc(doc(database, 'products', 'bread'), { price: 2 }));
  });
  it('validates every initial stock entry, rejects bad prices/foreign branches, and supports the six-branch limit within Rules access budgets', async () => {
    const { database, businessId, branchId } = await businessOwner();
    await repository().setTenantBranchQuota({ businessId, operationId: input('six').operationId, maxActiveBranches: 6, maxRegisteredBranches: 6 });
    const save = createBranchWriter(database, { sdk, currentUser: () => ({ uid: 'owner' }) });
    const stock = { [branchId]: 5 };
    for (let index = 1; index < 6; index++) {
      await save(`stock-${index}`, { businessId, name: `Sede ${index}`, status: 'activo' }, { create: true }); stock[`stock-${index}`] = index;
    }
    await setDoc(doc(database, 'products', 'six'), { businessId, name: 'Seis sedes', price: 0.29, stock });
    for (const [key, value] of [['negative', { stock: { [branchId]: -1 } }], ['fraction', { stock: { [branchId]: 1.5 } }], ['foreign', { stock: { foreign: 5 } }], ['price', { price: -1 }], ['precision', { price: 0.001 }], ['nan', { price: NaN }], ['infinite', { price: Infinity }], ['version', { posStockVersion: 0 }]]) {
      await assertFails(setDoc(doc(database, 'products', key), { businessId, name: 'Inválido', price: 1, stock: { [branchId]: 5 }, ...value }));
    }
    await assertFails(updateDoc(doc(database, 'products', 'six'), { businessId: 'foreign' }));
    await assertFails(updateDoc(doc(database, 'products', 'six'), { posStockVersion: 999 }));
  });
  it('does not lose a concurrent stock adjustment through a stale catalog editor', async () => {
    const { database, businessId, branchId } = await businessOwner();
    const previous = { [branchId]: 10 }, product = { businessId, name: 'Pan', price: 2, stock: previous };
    await setDoc(doc(database, 'products', 'race'), product);
    const results = await Promise.allSettled([12, 15].map(quantity => updateProductTransaction(database, 'race', { ...product, stock: { [branchId]: quantity } }, previous, { sdk })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1, JSON.stringify(results.map(row => row.reason?.message ?? row.status)));
    assert.ok([12, 15].includes((await getDoc(doc(database, 'products', 'race'))).data().stock[branchId]));
  });
  it('retains scoped notifications and the index required by the actual unread query', async () => {
    const { database, businessId, branchId } = await businessOwner();
    await seed({ 'notifications/owner': { businessId, branchId, userId: 'owner', createdAt: Timestamp.now(), readAt: null },
      'notifications/other': { businessId, branchId, userId: 'another', createdAt: Timestamp.now(), readAt: null } });
    const page = await getDocs(query(collection(database, 'notifications'), where('businessId', '==', businessId), where('userId', '==', 'owner'), where('readAt', '==', null), sdk.orderBy('createdAt', 'desc'), sdk.limit(30)));
    assert.equal(page.size, 1); await assertFails(getDoc(doc(database, 'notifications', 'other')));
    const indexes = JSON.parse(readFileSync('firestore.indexes.json', 'utf8')).indexes;
    assert.ok(indexes.some(index => index.collectionGroup === 'notifications' && ['businessId', 'userId', 'readAt', 'createdAt'].every(field => index.fields.some(value => value.fieldPath === field))));
  });
});

describe('SPARK-3 online cash opening', () => {
  it('reads ISO historical and server Timestamp sessions together without rewriting either format', async () => {
    const { database, businessId, branchId } = await businessOwner(), iso = '2026-10-23T12:00:00.000Z';
    await seed({ 'cash_sessions/iso-history': { businessId, branchId, userId: 'owner', status: 'closed', openedAt: iso },
      'cash_sessions/server-history': { businessId, branchId, userId: 'owner', status: 'closed', openedAt: Timestamp.fromDate(new Date(iso)) } });
    const read = createCashPeriodReader(database, { sdk });
    for (const convert of [value => value, value => new Date(value), value => Timestamp.fromDate(new Date(value))]) {
      const rows = await read('openedAt', businessId, convert('2026-10-23T00:00:00.000Z'), convert('2026-10-24T00:00:00.000Z'), branchId);
      assert.deepEqual(rows.map(row => row.id).sort(), ['iso-history', 'server-history']);
    }
    assert.equal((await dump('cash_sessions/iso-history')).data().openedAt, iso);
    assert.ok((await dump('cash_sessions/server-history')).data().openedAt instanceof Timestamp);
  });
  it('opens a server-confirmed session and the historical canonical SHA-256 lock idempotently', async () => {
    const { database, businessId, branchId } = await businessOwner(), repo = cashRepository(database);
    const command = { businessId, branchId, sessionId: 'cash-opening-123456789', openingAmount: 20.25, openingNote: 'Fondo' };
    const session = await repo.open(command), repeated = await repo.open(command);
    assert.equal(session.durationHours, 10);
    assert.ok(session.openedAt.isEqual(session.syncedAt));
    assert.equal(session.openedAt.toMillis(), repeated.openedAt.toMillis());
    assert.ok(Math.abs(session.openedAt.toMillis() - Date.now()) < 10000);
    const lockId = await cashLockId(businessId, branchId);
    assert.equal(lockId, createHash('sha256').update(JSON.stringify([businessId, branchId])).digest('hex'));
    const lock = (await dump(`active_cash_sessions/${lockId}`)).data();
    assert.equal(lock.sessionId, session.id);
    assert.ok(lock.updatedAt.isEqual(session.openedAt));
    assert.equal(lock.businessId, session.businessId); assert.equal(lock.branchId, session.branchId); assert.equal(lock.userId, session.userId);
    await assert.rejects(repo.open({ ...command, openingAmount: 30 }), /distinta/);
    assert.equal(session.financialWindow, undefined);
  });
  it('serializes concurrent openings into one active session per branch', async () => {
    const { database, businessId, branchId } = await businessOwner(), repo = cashRepository(database);
    const results = await Promise.allSettled(['one', 'two'].map(suffix => repo.open({ businessId, branchId, sessionId: `cash-race-${suffix}-123456789`, openingAmount: 0 })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const sessions = await getDocs(query(collection(database, 'cash_sessions'), where('businessId', '==', businessId), where('branchId', '==', branchId), where('status', '==', 'open')));
    assert.equal(sessions.size, 1);
  });
  it('rejects partial openings, invalid amounts, arbitrary edits, forged windows and foreign actor/branch', async () => {
    const { database, businessId, branchId } = await businessOwner();
    const lockId = await cashLockId(businessId, branchId);
    for (const patch of [{ omit: 'session' }, { omit: 'lock' }, { userId: 'another' }, { omitDuration: true },
      ...[12, 0, -1, 10.5, '10', null, true].map(durationHours => ({ session: { durationHours } })),
      { session: { openingAmount: -1 } }, { session: { openingAmount: 0.001 } },
      { session: { financialWindow: { expiresAt: Timestamp.fromMillis(Date.now() + 86400000) } } }, { session: { expiresAt: serverTimestamp() } },
      { session: { openedAt: Timestamp.fromMillis(Date.now() + 86400000) } }, { session: { syncedAt: Timestamp.fromMillis(Date.now() - 1000) } },
      { lock: { branchId: 'foreign' } }, { lock: { durationHours: 10 } }]) {
      await assertFails(rawCash(database, businessId, branchId, patch));
      assert.equal((await dump('cash_sessions/cash-opening-123456789')).exists(), false);
      assert.equal((await dump(`active_cash_sessions/${lockId}`)).exists(), false);
    }
    await assertFails(rawCash(dbFor('admin'), businessId, branchId, { userId: 'admin' }));
    await rawCash(database, businessId, branchId);
    await assertFails(updateDoc(doc(database, 'cash_sessions', 'cash-opening-123456789'), { openingAmount: 0 }));
    for (const changes of [{ durationHours: 12 }, { durationHours: deleteField() }, { openedAt: serverTimestamp() }]) {
      await assertFails(updateDoc(doc(database, 'cash_sessions', 'cash-opening-123456789'), changes));
    }
    await assertFails(deleteDoc(doc(database, 'cash_sessions', 'cash-opening-123456789')));
    await assertFails(deleteDoc(doc(database, 'active_cash_sessions', await cashLockId(businessId, branchId))));
  });
  it('requires an active assigned branch, valid license and server-checked cashier shift', async () => {
    const { businessId, branchId, database, user } = await businessOwner();
    await repository().setTenantBranchQuota({ businessId, operationId: input('cash-quota').operationId, maxActiveBranches: 2, maxRegisteredBranches: 3 });
    const save = createBranchWriter(database, { sdk, currentUser: () => user });
    await save('cash-alternate', { businessId, name: 'Alternativa', status: 'activo' }, { create: true });
    const profile = { businessId, role: 'cajero', branchId, email: 'cashier@gmail.com', firstName: 'Caja', status: 'activo', shiftStart: null, shiftEnd: null };
    await seed({ 'users/cashier': profile });
    const cashier = dbFor('cashier'), repo = cashRepository(cashier, 'cashier'), command = { businessId, branchId, sessionId: 'cash-cashier-123456789', openingAmount: 10 };
    await assertFails(repo.open({ ...command, branchId: 'cash-alternate' }));
    const minute = (new Date().getUTCHours() * 60 + new Date().getUTCMinutes() + 1140) % 1440;
    const time = offset => { const value = (minute + offset) % 1440; return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; };
    await seed({ 'users/cashier': { ...profile, shiftStart: time(10), shiftEnd: time(20) } });
    await assertFails(repo.open(command));
    await seed({ 'users/cashier': { ...profile, status: 'inactivo' } });
    await assertFails(repo.open(command));
    await seed({ 'users/cashier': profile });
    const license = (await dump(`licenses/${businessId}`)).data();
    for (const patch of [{ status: 'inactiva' }, { expiry: Timestamp.fromMillis(Date.now() - 1000) }]) {
      await seed({ [`licenses/${businessId}`]: { ...license, ...patch } });
      await assertFails(repo.open(command));
    }
    await seed({ [`licenses/${businessId}`]: license });
    assert.equal((await repo.open(command)).userId, 'cashier');
    await createSparkCashClosingRepository(cashier, { sdk, currentUser: () => ({ uid: 'cashier' }), readSales: async () => [], readPayments: async () => [] }).close(command.sessionId, 10);
    const branch = { businessId, name: 'Sede Principal', status: 'inactivo' };
    await assertFails(updateDoc(doc(database, 'branches', branchId), { status: 'inactivo' }));
    await save(branchId, branch);
    const recovered = { ...command, sessionId: 'cash-cashier-recovered-123456789' };
    await assert.rejects(repo.open(recovered), /Sede inactiva/);
    await assertFails(rawCash(cashier, businessId, branchId, { userId: 'cashier', sessionId: recovered.sessionId }));
    await assertFails(updateDoc(doc(database, 'branches', branchId), { status: 'activo' }));
    await save(branchId, { ...branch, status: 'activo' });
    assert.equal((await repo.open(recovered)).userId, 'cashier');
    assert.equal((await dump(`licenses/${businessId}`)).data().registeredBranchIds.length, 2);
  });
  it('keeps historical sessions readable and refuses to activate an unchecked historical branch or replace its lock', async () => {
    const { database, businessId, branchId } = await businessOwner();
    await seed({ 'branches/historical': { businessId, name: 'Anterior', status: 'activo' }, 'cash_sessions/historical-session': { businessId, branchId: 'historical', userId: 'owner', status: 'open', openedAt: '2026-01-01T12:00:00.000Z', openingAmount: 10 } });
    assert.equal((await createCashStateReader(database, { sdk })(businessId, 'historical')).openedAt, '2026-01-01T12:00:00.000Z');
    await assert.rejects(cashRepository(database).open({ businessId, branchId: 'historical', sessionId: 'cash-historical-123456789', openingAmount: 5 }), /histórica/);
    await assertFails(rawCash(database, businessId, 'historical'));
    await assertFails(updateDoc(doc(database, 'branches', 'historical'), { sparkCashVersion: 1 }));
    const lockId = await cashLockId(businessId, branchId);
    await seed({ [`active_cash_sessions/${lockId}`]: { businessId, branchId, userId: 'owner', sessionId: 'old', status: 'open' } });
    await assert.rejects(cashRepository(database).open({ businessId, branchId, sessionId: 'cash-historical-lock-123456789', openingAmount: 0 }), /candado histórico/);
    await assertFails(rawCash(database, businessId, branchId));
  });
});


describe('Plan03 branch authority and quota concurrency', () => {
  const ownerWithQuota = async (maximum, registeredMaximum = Math.max(maximum, 5)) => {
    const data = { ...input('quota'), maxActiveBranches: maximum, maxRegisteredBranches: registeredMaximum };
    const created = await repository().createTenant(data), user = googleUser();
    const database = dbFor(user.uid, data.ownerEmail);
    await acceptInvitation(database, googleUser(user.uid, data.ownerEmail), { sdk });
    return { ...created, database, save: createBranchWriter(database, { sdk, currentUser: () => user }) };
  };
  const branchData = businessId => ({ businessId, name: 'Sede adicional', address: '', phone: '', status: 'activo' });
  it('Plan03 serializes the last slot and rejects owner quota forgery or missing roster writes', async () => {
    const { businessId, database, save } = await ownerWithQuota(2);
    const results = await Promise.allSettled([save('second', branchData(businessId), { create: true }), save('third', branchData(businessId), { create: true })]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await dump(`licenses/${businessId}`)).data().activeBranchIds.length, 2);
    await assertFails(updateDoc(doc(database, 'licenses', businessId), { maxActiveBranches: 100 }));
    await assertFails(setDoc(doc(database, 'branches', 'bypass'), { ...branchData(businessId), sparkCashVersion: 1, branchLifecycleVersion: 1 }));
    await assertFails(updateDoc(doc(database, 'licenses', businessId), { activeBranchIds: ['invented'], branchQuotaBranchId: 'invented', branchQuotaUpdatedAt: serverTimestamp() }));
  });
  it('Plan03 protects concurrent reactivation and lets inactive branches release their slot', async () => {
    const { businessId, database, save } = await ownerWithQuota(2);
    for (const id of ['inactive1', 'inactive2']) await save(id, { ...branchData(businessId), status: 'inactivo' }, { create: true });
    const results = await Promise.allSettled(['inactive1', 'inactive2'].map(id => save(id, branchData(businessId))));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const id = (await dump('branches/inactive1')).data().status === 'activo' ? 'inactive1' : 'inactive2';
    await save(id, { ...branchData(businessId), status: 'inactivo' });
    assert.equal((await dump(`licenses/${businessId}`)).data().activeBranchIds.length, 1);
    assert.equal((await getDoc(doc(database, 'branches', id))).data().status, 'inactivo');
  });
  it('Plan03 blocks closing an active cash branch, even with direct batch writes', async () => {
    const { businessId, database, save } = await ownerWithQuota(2);
    await save('second', branchData(businessId), { create: true });
    const lockId = await cashLockId(businessId, 'second');
    await seed({ [`active_cash_sessions/${lockId}`]: { businessId, branchId: 'second', status: 'open', userId: 'owner' } });
    await assert.rejects(save('second', { ...branchData(businessId), status: 'inactivo' }), /Cierra la caja/);
    const batch = writeBatch(database);
    const ids = (await dump(`licenses/${businessId}`)).data().activeBranchIds;
    batch.update(doc(database, 'licenses', businessId), { activeBranchIds: ids.filter(id => id !== 'second'), branchQuotaBranchId: 'second', branchQuotaUpdatedAt: serverTimestamp() });
    batch.update(doc(database, 'branches', 'second'), { status: 'inactivo' });
    await assertFails(batch.commit());
  });
  it('Plan03 preserves inactive stock, forbids its adjustment and cashier assignment, and prevents last-branch closure', async () => {
    const { businessId, branchId, database, save } = await ownerWithQuota(2);
    await save('second', branchData(businessId), { create: true });
    await setDoc(doc(database, 'products', 'stock'), { businessId, name: 'Pan', price: 1.25, stock: { [branchId]: 2, second: 7 } });
    await save('second', { ...branchData(businessId), status: 'inactivo' });
    await updateDoc(doc(database, 'products', 'stock'), { stock: { [branchId]: 3, second: 7 } });
    await assertFails(updateDoc(doc(database, 'products', 'stock'), { stock: { [branchId]: 3, second: 8 } }));
    await assertFails(setDoc(doc(database, 'invites', 'staff@gmail.com'), { businessId, email: 'staff@gmail.com', role: 'cajero', branchId: 'second' }));
    await assert.rejects(save(branchId, { ...branchData(businessId), status: 'inactivo' }), /al menos una/);
    assert.equal((await dump('products/stock')).data().stock.second, 7);
  });
  it('Plan03 keeps historical tenants operational and requires explicit SuperAdmin regularization', async () => {
    const database = dbFor('legacy-owner');
    await seed({ 'users/legacy-owner': { role: 'dueño', businessId: 'legacy', status: 'activo' },
      'licenses/legacy': { businessId: 'legacy', status: 'activa', expiry: Timestamp.fromMillis(Date.now() + 86400000) },
      'branches/legacy-main': { ...branchData('legacy'), sparkCashVersion: 1 } });
    const save = createBranchWriter(database, { sdk, currentUser: () => ({ uid: 'legacy-owner' }) });
    await save('legacy-main', { ...branchData('legacy'), name: 'Nombre actualizado' });
    await assert.rejects(save('new', branchData('legacy'), { create: true }), /Regulariza/);
    await assert.rejects(repository().setTenantBranchQuota({ businessId: 'legacy', operationId: input('reg').operationId, maxActiveBranches: 2, maxRegisteredBranches: 5, activeBranchIds: ['legacy-main'], registeredBranchIds: ['legacy-main'] }), /Confirma/);
    const command = { businessId: 'legacy', operationId: input('reg').operationId, maxActiveBranches: 2, maxRegisteredBranches: 5, activeBranchIds: ['legacy-main'], registeredBranchIds: ['legacy-main'], confirmHistoricalReview: true };
    await repository().setTenantBranchQuota(command); await repository().setTenantBranchQuota(command);
    await save('new', branchData('legacy'), { create: true });
    await assert.rejects(save('legacy-main', { ...branchData('legacy'), status: 'inactivo' }), /Sede histórica/);
    await assert.rejects(repository().setTenantBranchQuota({ businessId: 'legacy', operationId: input('lower').operationId, maxActiveBranches: 1, maxRegisteredBranches: 5 }), /menor/);
  });
  it('Plan03 registered quota serializes inactive creation into the last permanent slot', async () => {
    const { businessId, database, save } = await ownerWithQuota(1, 2);
    const inactive = { ...branchData(businessId), status: 'inactivo' };
    await assertFails(setDoc(doc(database, 'branches', 'direct-inactive'), { ...inactive, sparkCashVersion: 1, branchLifecycleVersion: 1 }));
    const results = await Promise.allSettled(['inactive-a', 'inactive-b'].map(id => save(id, inactive, { create: true })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const license = (await dump(`licenses/${businessId}`)).data();
    assert.equal(license.activeBranchIds.length, 1); assert.equal(license.registeredBranchIds.length, 2);
    assert.equal((await getDocs(query(collection(database, 'branches'), where('businessId', '==', businessId)))).size, 2);
    await assert.rejects(save('overflow', inactive, { create: true }), /máximo de sedes registradas/);
    const batch = writeBatch(database);
    batch.set(doc(database, 'branches', 'raw-overflow'), { ...inactive, sparkCashVersion: 1, branchLifecycleVersion: 1 });
    batch.update(doc(database, 'licenses', businessId), { registeredBranchIds: [...license.registeredBranchIds, 'raw-overflow'], branchQuotaBranchId: 'raw-overflow', branchQuotaUpdatedAt: serverTimestamp() });
    await assertFails(batch.commit());
    await assertFails(updateDoc(doc(database, 'licenses', businessId), { maxRegisteredBranches: 200 }));
    await assertFails(updateDoc(doc(database, 'licenses', businessId), { registeredBranchIds: [], registeredBranchQuotaVersion: 0 }));
  });
  it('Plan03 registered slots survive deactivation and authorized quota edits, without deleting or reusing IDs', async () => {
    const { businessId, database, save } = await ownerWithQuota(2, 2);
    await save('permanent', branchData(businessId), { create: true });
    await save('permanent', { ...branchData(businessId), status: 'inactivo' });
    let license = (await dump(`licenses/${businessId}`)).data();
    assert.equal(license.activeBranchIds.length, 1); assert.equal(license.registeredBranchIds.length, 2);
    await assert.rejects(save('third', { ...branchData(businessId), status: 'inactivo' }, { create: true }), /registradas/);
    await save('permanent', branchData(businessId));
    assert.equal((await dump(`licenses/${businessId}`)).data().activeBranchIds.length, 2);
    await save('permanent', { ...branchData(businessId), status: 'inactivo' });
    await assert.rejects(repository().setTenantBranchQuota({ businessId, operationId: input('invalid-limits').operationId, maxActiveBranches: 2, maxRegisteredBranches: 1 }), /cupo de sedes registradas/);
    await repository().setTenantBranchQuota({ businessId, operationId: input('raise-registered').operationId, maxActiveBranches: 2, maxRegisteredBranches: 3, registeredBranchIds: [] });
    license = (await dump(`licenses/${businessId}`)).data();
    assert.equal(license.maxRegisteredBranches, 3); assert.ok(license.registeredBranchIds.includes('permanent'));
    await assertFails(deleteDoc(doc(database, 'branches', 'permanent')));
    // A privileged historical deletion cannot make its registered ID reusable through the web SDK.
    await env.withSecurityRulesDisabled(ctx => deleteDoc(doc(ctx.firestore(), 'branches', 'permanent')));
    await assert.rejects(save('permanent', { ...branchData(businessId), status: 'inactivo' }, { create: true }), /no se puede reutilizar/);
    await assertFails(setDoc(doc(database, 'branches', 'permanent'), { ...branchData(businessId), status: 'inactivo', sparkCashVersion: 1, branchLifecycleVersion: 1 }));
    const id = input('erase-roster').operationId, time = serverTimestamp(), admin = dbFor('admin'), batch = writeBatch(admin);
    const changed = { maxActiveBranches: 2, maxRegisteredBranches: 3, activeBranchIds: license.activeBranchIds, registeredBranchIds: license.activeBranchIds };
    batch.update(doc(admin, 'licenses', businessId), { ...changed, quotaOperationId: id, branchQuotaUpdatedAt: time });
    batch.set(doc(admin, 'platform_operations', `admin_${id}`), { ...changed, actorId: 'admin', businessId, operationId: id, operation: 'setTenantBranchQuota', regularization: false, createdAt: time });
    await assertFails(batch.commit());
  });
  it('Plan03 registered Rules reject forged limits and multi-branch writes beyond a single reservation', async () => {
    for (const [index, limits] of [[2, 1], [1, 201], [1, 1.5]].entries()) {
      await assertFails(rawBundle(dbFor('admin'), { ...input(`invalid-registered-${index}`), maxActiveBranches: limits[0], maxRegisteredBranches: limits[1] }));
    }
    const { businessId, branchId, database } = await ownerWithQuota(1, 2);
    const batch = writeBatch(database);
    for (const id of ['fake-a', 'fake-b']) batch.set(doc(database, 'branches', id), { ...branchData(businessId), status: 'inactivo', sparkCashVersion: 1, branchLifecycleVersion: 1 });
    batch.update(doc(database, 'licenses', businessId), { registeredBranchIds: [branchId, 'fake-a'], branchQuotaBranchId: 'fake-a', branchQuotaUpdatedAt: serverTimestamp() });
    await assertFails(batch.commit());
    assert.equal((await dump(`licenses/${businessId}`)).data().registeredBranchIds.length, 1);
    assert.equal((await dump('branches/fake-a')).exists(), false); assert.equal((await dump('branches/fake-b')).exists(), false);
  });
  it('Plan03 requires explicit review of active-only historical quotas before registered inventory is complete', async () => {
    const { businessId, branchId, database, save } = await ownerWithQuota(2, 3);
    const previous = (await dump(`licenses/${businessId}`)).data();
    delete previous.registeredBranchQuotaVersion; delete previous.registeredBranchIds; delete previous.maxRegisteredBranches;
    await seed({ [`licenses/${businessId}`]: previous, 'branches/legacy-inactive': { ...branchData(businessId), status: 'inactivo', sparkCashVersion: 1 } });
    await save(branchId, { ...branchData(businessId), name: 'Se conserva la operación' });
    assert.equal((await cashRepository(database).open({ businessId, branchId, sessionId: 'legacy-quota-cash-123456789', openingAmount: 0 })).status, 'open');
    await assert.rejects(save('new-inactive', { ...branchData(businessId), status: 'inactivo' }, { create: true }), /Regulariza/);
    await assertFails(setDoc(doc(database, 'branches', 'direct-history'), { ...branchData(businessId), status: 'inactivo', sparkCashVersion: 1, branchLifecycleVersion: 1 }));
    const command = { businessId, operationId: input('registered-review').operationId, maxActiveBranches: 2, maxRegisteredBranches: 2, registeredBranchIds: [branchId, 'legacy-inactive'] };
    await assert.rejects(repository().setTenantBranchQuota(command), /Confirma/);
    assert.equal((await dump(`licenses/${businessId}`)).data().registeredBranchQuotaVersion, undefined);
    await repository().setTenantBranchQuota({ ...command, confirmHistoricalReview: true });
    const license = (await dump(`licenses/${businessId}`)).data();
    assert.equal(license.registeredBranchQuotaVersion, 1); assert.equal(license.registeredBranchIds.length, 2);
    assert.deepEqual(license.activeBranchIds, previous.activeBranchIds);
    await assert.rejects(save('new-inactive', { ...branchData(businessId), status: 'inactivo' }, { create: true }), /registradas/);
  });
  it('Plan03 resolves only operational assignments and global read-only owner context', () => {
    const rows = [{ id: 'a', status: 'activo' }, { id: 'b', status: 'inactivo' }, { id: 'unknown' }];
    assert.equal(isBranchOperational(rows[2]), false);
    assert.equal(resolveOperationalBranch({ role: 'dueño' }, rows, 'b'), 'a');
    assert.equal(resolveOperationalBranch({ role: 'dueño' }, rows, 'global'), 'global');
    assert.equal(resolveOperationalBranch({ role: 'cajero', branchId: 'b' }, rows, 'a'), null);
  });
});
