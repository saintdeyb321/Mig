import assert from 'node:assert/strict';
import { it } from 'node:test';
import { profileAccess, licenseAccess, accessErrorState } from '../frontend/src/core/session/accessState.js';
import { createProfileSession } from '../frontend/src/core/session/profileSession.js';

const server = { fromCache: false, hasPendingWrites: false };
const cached = { fromCache: true, hasPendingWrites: false };
const owner = { role: 'dueño', businessId: 'tenant', status: 'activo' };
const record = (data, metadata = server) => ({ received: true, data, metadata });
const license = { businessId: 'tenant', status: 'activa', expiry: '2030-01-01T00:00:00Z' };
const access = (licenseDoc, tenantDoc) => licenseAccess({ license: licenseDoc, tenant: tenantDoc, businessId: 'tenant', now: new Date('2026-10-24') });

it('never interprets a cache miss or pending local profile as account deletion or authorization', () => {
  for (const data of [null, owner]) {
    assert.equal(profileAccess(data, cached, () => true), 'offline-unverified');
    assert.equal(profileAccess(data, { ...server, hasPendingWrites: true }, () => true), 'offline-unverified');
  }
  assert.equal(profileAccess(null, server, () => true), 'profile-not-found-confirmed');
  assert.equal(profileAccess(owner, server, () => true), 'ready');
  assert.equal(profileAccess({ ...owner, role: 'cajero' }, server, () => true), 'profile-incomplete');
  assert.equal(profileAccess({ ...owner, status: 'inactivo' }, server, () => true), 'suspended');
  assert.equal(profileAccess(owner, server, () => false), 'shift-denied');
});

it('distinguishes missing license/tenant, permissions, cache and historical tenant compatibility', () => {
  assert.equal(access(record(null, cached), record({ status: 'active' })), 'offline-unverified');
  assert.equal(access(record(null), record({ status: 'active' })), 'license-missing-confirmed');
  assert.equal(access(record(null), record(null)), 'tenant-missing-confirmed');
  assert.equal(access(record(license), record(null)), 'active');
  assert.equal(access(record(license), record({ status: 'suspended' })), 'suspended');
  assert.equal(access(record({ ...license, expiry: '2020-01-01' }), record(null)), 'expired');
  assert.equal(access(record({ ...license, businessId: 'other' }), record(null)), 'configuration-error');
  assert.equal(access({ error: { code: 'permission-denied' } }, record(null)), 'permission-denied');
  assert.equal(accessErrorState({ code: 'firestore/unavailable' }), 'network-error');
});

it('requires explicit acceptance and discards callbacks/invitation reads from a closed identity', async () => {
  let next, fail, resolveInvite, accepted = 0, stopped = 0;
  const states = [], user = { uid: 'owner', email: 'owner@example.test', emailVerified: true, providerData: [{ providerId: 'google.com' }] };
  const session = createProfileSession({ user, subscribe: (_uid, onData, onError) => { next = onData; fail = onError; return () => stopped++; },
    readInvite: () => new Promise(resolve => { resolveInvite = resolve; }), acceptInvite: async () => accepted++,
    withinShift: () => true, onState: state => states.push(state) });
  next(null, cached);
  assert.equal(resolveInvite, undefined);
  next(null, server);
  assert.equal(accepted, 0);
  session.close();
  const count = states.length;
  resolveInvite({ email: user.email, ...owner }); await Promise.resolve();
  next(owner, server); fail({ code: 'permission-denied' });
  assert.equal(states.length, count); assert.equal(stopped, 1); assert.equal(accepted, 0);
});

it('keeps confirmed permissions distinct from connection errors and accepts an invitation only once', async () => {
  let next, fail, finish, accepted = 0;
  const states = [], user = { uid: 'cashier', email: 'cashier@example.test', emailVerified: true, providerData: [{ providerId: 'google.com' }] };
  const session = createProfileSession({ user, subscribe: (_uid, onData, onError) => { next = onData; fail = onError; return () => {}; },
    readInvite: async () => ({ ...owner, email: user.email }),
    acceptInvite: () => { accepted++; return new Promise(resolve => { finish = resolve; }); },
    withinShift: () => true, onState: state => states.push(state) });
  next(null, server); await Promise.resolve();
  assert.equal(states.at(-1).status, 'needs-invite'); assert.equal(accepted, 0);
  const first = session.accept(); await session.accept(); assert.equal(accepted, 1);
  finish(); await first; next(owner, server); assert.equal(states.at(-1).status, 'ready');
  fail({ code: 'permission-denied' }); assert.equal(states.at(-1).status, 'permission-denied');
  assert.equal(states.at(-1).profile, null); session.close();
});
