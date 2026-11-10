import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { useAuthManager } from '../frontend/src/hooks/useAuthManager.js';
import LicenseGuard from '../frontend/src/components/LicenseGuard.jsx';
import RestrictedAccess from '../frontend/src/components/RestrictedAccess.jsx';
import { assertConfirmedWrite } from '../frontend/src/core/session/operationAccess.js';
import offlineDB from '../frontend/src/offlineDB.js';

const server = { fromCache: false, hasPendingWrites: false };
const makeUser = uid => ({ uid, emailVerified: true, providerData: [{ providerId: 'google.com' }],
  getIdToken: async force => {
    if (force) fixture.token++;
    if (fixture.tokenError) throw Object.assign(Error('credencial sintética'), { code: fixture.tokenError });
    return 'synthetic';
  } });
const owner = { role: 'dueño', businessId: 'tenant-a', status: 'activo', hasAcceptedTerms: true };
const boot = sessionStorage.getItem('p15:boot') || 'healthy';
const fixture = window.__p15 = { bootId: crypto.randomUUID(), user: makeUser('owner-a'), profile: owner, watchMode: boot, readMode: 'healthy',
  online: true, visible: true, reads: [], token: 0, logouts: 0, observers: new Set(), watches: [], recoverStream: true };
Object.defineProperty(navigator, 'onLine', { get: () => fixture.online });
Object.defineProperty(document, 'visibilityState', { get: () => fixture.visible ? 'visible' : 'hidden' });
const clock = Date.now;
Date.now = () => clock() + (fixture.elapsed ?? 0);
const records = (kind, id, mode) => {
  if (mode === 'permission') throw Object.assign(Error('datos sintéticos'), { code: 'permission-denied' });
  if (mode === 'network') throw Object.assign(Error('datos sintéticos'), { code: 'unavailable' });
  if (kind === 'profile') return fixture.profile;
  if (mode === 'stale' || mode === 'absent' || kind === 'license' && mode === 'license-missing') return null;
  return kind === 'tenant' ? { businessId: id, status: 'active' } : { businessId: id,
    status: mode === 'suspended' ? 'inactiva' : 'activa', expiry: mode === 'expired' ? '2020-01-01' : '2099-01-01' };
};
const emit = (watch, mode = fixture.watchMode) => {
  try { watch.next(records(watch.kind, watch.id, mode), mode === 'cache' ? { ...server, fromCache: true } : server); }
  catch (error) { watch.fail(error); }
};
fixture.observe = next => {
  fixture.observers.add(next);
  queueMicrotask(() => { if (fixture.observers.has(next)) next(fixture.user); });
  return () => fixture.observers.delete(next);
};
fixture.switchUser = (uid, profile = owner) => {
  fixture.user = uid ? makeUser(uid) : null;
  fixture.profile = profile;
  for (const next of fixture.observers) next(fixture.user);
};
fixture.changeProfile = profile => {
  fixture.profile = profile;
  fixture.watches.filter(watch => watch.kind === 'profile' && watch.active).forEach(watch => watch.next(profile, server));
};
fixture.subscribe = (kind, id, next, fail) => {
  const watch = { kind, id, next, fail, active: true };
  fixture.watches.push(watch);
  queueMicrotask(() => { if (watch.active) emit(watch, kind === 'profile' ? 'healthy' : fixture.watchMode); });
  return () => { watch.active = false; };
};
fixture.publish = mode => {
  fixture.watchMode = mode;
  fixture.watches.filter(watch => watch.active && watch.kind !== 'profile').forEach(watch => emit(watch, mode));
};
fixture.read = async (kind, id) => {
  fixture.reads.push({ kind, id });
  if (kind !== 'profile' && fixture.hold) await new Promise(resolve => (fixture.pending ??= []).push(resolve));
  const mode = kind === 'profile' ? (fixture.profileMode ?? 'healthy') : fixture.readMode;
  const data = records(kind, id, mode);
  if (kind !== 'profile' && fixture.recoverStream && mode === 'healthy') fixture.watchMode = 'healthy';
  return { data, metadata: mode === 'cache' ? { ...server, fromCache: true }
    : mode === 'pending' ? { ...server, hasPendingWrites: true } : server };
};
fixture.canWrite = () => {
  try { assertConfirmedWrite({ uid: fixture.user?.uid, online: fixture.online }); return true; }
  catch { return false; }
};
fixture.draft = () => offlineDB.sales.get('p15-unique-draft');
if (!await fixture.draft()) await offlineDB.sales.put({ localId: 'p15-unique-draft', businessId: owner.businessId, userId: fixture.user.uid,
  status: 'draft_offline', data: 'synthetic-encrypted-sentinel' });

function Fixture() {
  const { user, authLoading, authIssue, retryAuth, handleLogout, recheckProfile } = useAuthManager();
  if (authLoading) return createElement('p', null, 'Verificando perfil');
  if (authIssue) return createElement(RestrictedAccess, { licenseState: authIssue, onRetry: retryAuth, onLogout: handleLogout });
  if (!user) return createElement('h1', null, 'Sin sesión');
  return createElement(LicenseGuard, { user, handleLogout, recheckProfile },
    createElement('p', { id: 'business-ready' }, user.businessId));
}

createRoot(document.getElementById('root')).render(createElement(Fixture));
await fetch('/__phase4-report', { method: 'POST', body: JSON.stringify({ ok: true }) });
