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


// Focused lifecycle checks: no browser, account, Firebase writes or offline DB mutations.
const { createSessionResources } = await import('../frontend/src/core/session/sessionResources.js');
it('retains visited listeners/pages during navigation, deduplicates consumers and expires idle resources', () => {
  const timers = new Map(); let sequence = 0, starts = 0, stops = 0, deliver;
  const resources = createSessionResources({ schedule: fn => { timers.set(++sequence, fn); return sequence; }, cancel: id => timers.delete(id) });
  const history = resources.cell('history', []); history.set([{ id: 'page-1' }]);
  const listener = resources.watch('contracts', next => { starts++; deliver = next; return () => stops++; });
  const leave = listener.subscribe(() => {}); deliver([{ id: 'one' }], { fromCache: false });
  leave(); const revisit = resources.watch('contracts', () => { throw new Error('duplicate listener'); });
  const leaveAgain = revisit.subscribe(() => {});
  assert.equal(starts, 1); assert.equal(stops, 0); assert.equal(timers.size, 0);
  assert.equal(revisit.get().data[0].id, 'one'); assert.equal(history.get()[0].id, 'page-1');
  leaveAgain(); [...timers.values()][0](); assert.equal(stops, 1); assert.equal(revisit.get().isStale, true);
  resources.close(); deliver([{ id: 'late' }]); assert.equal(revisit.get().data[0].id, 'one');
  const other = createSessionResources(); assert.deepEqual(other.cell('history', []).get(), []); other.close();
});
it('deduplicates pending reads, invalidates results and cancels subsequent pages after logout', async () => {
  const resources = createSessionResources(); let calls = 0, resolve;
  const loader = () => { calls++; return new Promise(done => { resolve = done; }); };
  const first = resources.read('report:one', loader), second = resources.read('report:one', loader);
  await Promise.resolve(); assert.equal(calls, 1); assert.equal(first, second);
  resolve([1]); await first; assert.deepEqual(await resources.read('report:one', loader), [1]);
  resources.invalidate('report:'); const next = resources.read('report:one', async () => [2]); assert.deepEqual(await next, [2]);
  resources.close(); assert.equal(resources.signal.aborted, true);
  await assert.rejects(resources.read('report:new', loader), /sesión cambió/); assert.equal(calls, 1);
});
it('StrictMode lease replay preserves the active session, but a real unmount closes it', async () => {
  const resources = createSessionResources(); const first = resources.lease(); first(); const second = resources.lease();
  await Promise.resolve(); assert.equal(resources.active, true); second(); await Promise.resolve(); assert.equal(resources.active, false);
});

it('retries a failed shared listener after reconnection or navigation without reviving another identity', () => {
  const resources = createSessionResources(); let starts = 0, fail, deliver;
  const listener = resources.watch('contracts', (next, error) => { starts++; deliver = next; fail = error; return () => {}; });
  const leave = listener.subscribe(() => {}); fail(new Error('offline')); assert.equal(listener.get().data.length, 0);
  resources.retryErrors(); assert.equal(starts,2); deliver([{id:'fresh'}], {fromCache:false}); assert.equal(listener.get().error,null);
  fail(new Error('permission-denied')); leave(); const leaveAgain = listener.subscribe(() => {}); assert.equal(starts,3);
  leaveAgain(); resources.close(); resources.retryErrors(); assert.equal(starts,3);
});


it('waits neutrally through initial cache and invitation discovery, then verifies activation from server', async () => {
  let next, timeout, activations = 0;
  const states = [], user = { uid: 'new-owner', email: 'owner@example.test', emailVerified: true, providerData: [{ providerId: 'google.com' }] };
  const session = createProfileSession({ user, subscribe: (_, onData) => { next = onData; return () => {}; },
    schedule: callback => { timeout = callback; return 1; }, cancel: () => {},
    readInvite: async () => ({ ...owner, email: user.email, firstName: 'Titular' }),
    acceptInvite: async () => { activations++; next(null, cached); },
    readProfile: async () => ({ data: owner, metadata: server }), withinShift: () => true, onState: state => states.push(state) });
  next(null, cached); assert.equal(states.at(-1).status, 'loading');
  timeout(); assert.equal(states.at(-1).status, 'offline-unverified');
  next(null, server); assert.equal(states.at(-1).status, 'loading'); await Promise.resolve();
  assert.equal(states.at(-1).status, 'needs-invite'); assert.equal(states.at(-1).invitation.businessId, 'tenant');
  await session.accept(); assert.equal(activations, 1); assert.equal(states.at(-1).status, 'ready');
  assert.ok(!states.some(state => state.status === 'profile-not-found-confirmed')); session.close();
});
it('retains personnel only inside the same session after index failure and blocks confirmation', () => {
  const resources = createSessionResources(); let deliver, fail;
  const listener = resources.watch('personnel', (next, error) => { deliver = next; fail = error; return () => {}; }, [], { preserveOnError: true });
  const off = listener.subscribe(() => {}); deliver([owner], server); fail({ code: 'failed-precondition', message: 'missing index' });
  assert.equal(listener.get().data.length, 1); assert.equal(listener.get().isStale, true); assert.equal(listener.get().error.code, 'failed-precondition');
  off(); resources.close(); const other = createSessionResources(); assert.deepEqual(other.watch('personnel', () => () => {}).get().data, []); other.close();
});
