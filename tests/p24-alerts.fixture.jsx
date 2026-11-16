import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import AppLayout from '../frontend/src/layouts/AppLayout.jsx';
import { createSessionResources } from '../frontend/src/core/session/sessionResources.js';
import { SessionResourcesContext } from '../frontend/src/core/session/sessionResourceHooks.js';

const listeners = [];
window.p24Subscribe = (kind, key, next, error) => {
  const listener = { kind, key, next, error, active: true };
  listeners.push(listener);
  return () => { listener.active = false; };
};
const resources = createSessionResources();
const owner = { uid: 'owner-a', businessId: 'tenant-a', role: 'dueño' };
let switchUser;
function Fixture() {
  const [user, setUser] = useState(owner);
  switchUser = setUser;
  return <SessionResourcesContext.Provider value={resources}>
    <AppLayout user={user} tab="pos" setTab={() => {}} handleLogout={() => {}}><p>POS</p></AppLayout>
  </SessionResourcesContext.Provider>;
}
const root = createRoot(document.getElementById('root'));
const check = (condition, message) => { if (!condition) throw Error(message); };
const find = kind => listeners.findLast(entry => entry.kind === kind);
const counts = () => ['inbox', 'profiles', 'expiry'].map(kind => listeners.filter(entry => entry.kind === kind && entry.active).length).join('/');
const bell = section => document.querySelector(`${section} button[aria-label="Notificaciones"]`);
const badge = () => bell('aside')?.parentElement.querySelector('[role="status"]')?.textContent ?? '';
const dialog = () => document.querySelector('[role="dialog"]');
const act = fn => flushSync(fn);
const notices = Array.from({ length: 14 }, (_, index) => ({ id: 'notice-' + index, title: 'Aviso confirmado', message: 'Información', businessId: owner.businessId }));

async function run() {
  act(() => root.render(<Fixture />));
  const first = find('inbox');
  check(counts() === '1/0/0', 'Closed bell starts only the inbox');
  act(() => first.next(notices, { fromCache: true }));
  check(badge().startsWith('–') && !badge().includes('14'), 'Cache does not expose fourteen unread');
  act(() => first.next([], { fromCache: false }));
  check(badge() === '', 'Server zero clears the checking state');
  act(() => first.next(notices.slice(0, 1), { fromCache: false }));
  check(badge().includes('1 avisos sin leer'), 'New server notice is shown');
  act(() => first.next([], { fromCache: true }));
  check(badge().includes('último recuento confirmado'), 'Offline retains the verified count');
  act(() => first.error(Object.assign(Error('offline'), { code: 'unavailable' })));
  check(badge().includes('1 avisos sin leer'), 'Errors preserve the last verified count');
  act(() => bell('aside').click());
  check(dialog() && counts() === '1/1/1', 'Desktop opens only one set of detail streams');
  act(() => dialog().querySelector('button[aria-label="Cerrar diálogo"]').click());
  check(!dialog() && counts() === '1/0/0', 'Closing the bell releases detail streams');
  act(() => bell('header').click());
  check(dialog() && counts() === '1/1/1', 'The mobile bell shares the same unread stream');
  act(() => switchUser({ uid: 'cashier-b', businessId: 'tenant-b', branchId: 'branch-b', role: 'cajero' }));
  check(!dialog() && counts() === '1/0/0', 'Identity change closes details and releases the old inbox');
  check(!first.active && find('inbox').key === 'tenant-b' && badge().startsWith('–') && !badge().includes('1 avisos'), 'Identity change clears the previous count');
  act(() => first.next(notices, { fromCache: false }));
  check(!badge().includes('14'), 'Late callback from the previous user is ignored');
  act(() => find('inbox').next([], { fromCache: false }));
  check(badge() === '', 'Cashier receives their own server result');
  act(() => root.unmount());
  check(counts() === '0/0/0', 'Unmount releases all streams');
  resources.close();
}

run().then(() => ({ ok: true }), error => ({ ok: false, error: error.message })).then(result =>
  fetch('/__phase4-report', { method: 'POST', body: JSON.stringify(result) }));
