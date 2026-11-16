import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createSessionResources } from '../frontend/src/core/session/sessionResources.js';
import { SessionResourcesContext } from '../frontend/src/core/session/sessionResourceHooks.js';
import { TenantContext } from '../frontend/src/features/branches/context/TenantContext.js';
import ExportSales from '../frontend/src/modules/ExportSales.jsx';
import { invalidateReportScope } from '../frontend/src/features/reports/application/reportResource.js';
import { getIdentityKey } from '../frontend/src/core/session/identity.js';
import { registerPwa } from '../frontend/src/features/pwa/registerPwa.js';
import '../frontend/src/index.css';

const fixture = window.__excelFixture = { bootId: crypto.randomUUID(), reads: 0, fault: '', empty: false, compensated: false };
// Preview replaces the app entry, including its mount of the production registrar.
void registerPwa()?.catch(error => { fixture.pwaError = error.message; });
const branch = { id: 'centro', name: 'Centro' };
const secondBranch = { id: 'taller', name: 'Taller' };
const user = { uid: 'RMux1Jm3vl7pofbT54G6YXkT2lP7', businessId: 'qa-excel', role: 'dueño', firstName: 'Ana', lastName: 'Quispe' };
const unknown = 'QvY2SOyq7BnP9aU7cmeGPxaH2uP3';
const recoveredBy = 'RLui5Jm3wl7pofbT54G6YXkT2lP7';
const orderId = 'fe5ef63c-b034-4bdf-9e16-1492bb6c5258';
const extraBranches = ['Norte', 'Sur', 'Este', 'Oeste'].map((name, i) => ({ id: 'extra-' + i, name }));
const at = (day, hour) => `${day}T${hour}:00:00-05:00`;

const readData = async (kind, day, branchId, businessId = user.businessId) => {
  fixture.reads++;
  (fixture.calls ??= []).push({ kind, businessId, branchId });
  if (fixture.fault === 'permission') throw Object.assign(Error('Lectura de ensayo denegada'), { code: 'permission-denied', queryArea: 'sales-period' });
  if (fixture.fault === 'limit') throw Error('Demasiados tickets (máximo 10000). Selecciona un período menor.');
  if (fixture.fault === 'index') throw Object.assign(Error('La consulta requiere un índice'), { code: 'failed-precondition' });
  if (fixture.fault === 'hold') await new Promise(resolve => { (fixture.pending ??= []).push(resolve); });
  if (fixture.empty) return kind === 'contracts' ? { contracts: [], payments: [] } : [];
  const base = { businessId, branchId: branch.id, cashierName: 'Cajera de ensayo' };
  const sale = (id, payment, total, extra = {}) => ({ ...base, id, payment, total, createdAt: at(day, '10'),
    items: [{ id: 'product-' + id, name: '=1+1', qty: 1, price: total }], ...extra });
  const yape = sale('digital', 'yape', 30);
  if (fixture.reference === 'v2') {
    if (kind === 'sales') {
      const item = (id, name, qty, price) => ({ id, name, qty, price });
      const rows = [
        sale('p25v2-01', 'mixto', 53, { branchId: secondBranch.id, ticketNumber: 'T-2101', splitPayments: { efectivo: 22, yape: 31 },
          items: [item('pan', 'Pan dulce', 1, 2), item('torta', 'Torta artesanal de chocolate y frambuesas con cobertura de cacao', 2, 23),
            item('mini', '=1+1', 1, 3), item('roll', 'Enrollado de canela', 1, 2)] }),
        ...[[24, 'efectivo'], [29, 'yape'], [20, 'efectivo'], [17, 'yape'], [14, 'efectivo']].map(([total, method], index) =>
          sale('p25v2-t' + index, method, total, { branchId: secondBranch.id, ticketNumber: 'T-210' + (index + 2),
            items: [item('taller-' + index, ['Milhojas de crema', 'Tarta de manzana', 'Pan integral', 'Empanada de queso', 'Alfajores de vainilla'][index], 1, total)] })),
        ...[[36, 'efectivo'], [18, 'efectivo'], [14, 'plin']].map(([total, method], index) =>
          sale('p25v2-c' + index, method, total, { ticketNumber: 'C-140' + (index + 1),
            items: [item('centro-' + index, ['Torta de vainilla', 'Galletas de avena', 'Brioche de naranja'][index], 1, total)] })),
      ];
      return rows.filter(row => branchId === 'global' || row.branchId === branchId);
    }
    if (kind === 'contracts') return { payments: [] };
    if (kind === 'cash') {
      const taller = { ...base, branchId: secondBranch.id, cashierName: 'María de los Ángeles Valdivia', openingAmount: 100 };
      return [
        { ...base, id: 'p25v2-open', openingAmount: 60, openedAt: new Date().toISOString(), status: 'open', durationHours: 14 },
        { ...taller, id: 'p25v2-expiry', status: 'expired_unreconciled', openedAt: at(day, '07'),
          expiredAt: at(day, '17'), recoveredAt: at(day, '18'), durationHours: 10, recoveredBy },
        ...[0, 7, -4, -2].map((difference, index) => ({ ...taller, id: 'p25v2-close-' + index, status: 'closed',
          openedAt: at(day, '08'), closedAt: at(day, String(12 + index)), closedBy: unknown, declaredAmount: 120 + difference,
          expectedCash: 120, difference, reconciliationPending: index === 3 })),
      ].filter(row => branchId === 'global' || row.branchId === branchId);
    }
    return [];
  }
  if (fixture.reference === 'global') {
    if (kind === 'sales') return [
      sale('reference-a', 'efectivo', 36, { ticketNumber: 'T-1042', items: [{ id: 'cake', name: 'Torta artesanal de chocolate con relleno de frutos rojos', qty: 1, price: 29 },
        { id: 'roll', name: '=1+1', qty: 1, price: 7 }] }),
      sale('reference-b', 'yape', 29, { ticketNumber: 'T-1043', branchId: secondBranch.id }),
      sale('reference-c', 'efectivo', 3, { ticketNumber: 'T-1044', branchId: secondBranch.id }),
    ];
    if (kind === 'contracts') return { payments: [] };
    if (kind !== 'cash') return [];
  }
  if (fixture.reference === 'secondary') {
    const secondary = { ...base, branchId: secondBranch.id, cashierName: 'María de los Ángeles Valdivia' };
    if (kind === 'sales') return [sale('secondary-17', 'mixto', 17, { ...secondary, ticketNumber: 'T-2041',
      splitPayments: { efectivo: 9, yape: 8 }, items: [{ id: 'cake', name: 'Torta de vainilla con frutos rojos', qty: 1, price: 12 },
        { id: 'roll', name: '=1+1', qty: 1, price: 5 }] })];
    if (kind === 'contracts') return { payments: [{ ...secondary, id: 'secondary-11', sourceId: orderId, type: 'advance', amount: 11, method: 'yape', occurredAt: at(day, '11') }] };
    if (kind === 'orders') return [{ ...secondary, id: orderId, contractNumber: 'PED-2026-0034', clientName: 'Clienta de ensayo',
      createdAt: at(day, '08'), total: 25, paidTotal: 11, balance: 14, status: 'pendiente' }];
    if (kind === 'cash') return [{ ...secondary, id: 'secondary-shift', openedAt: at(day, '07'), expiredAt: at(day, '17'),
      status: 'expired_unreconciled', openingAmount: 50, recoveredAt: at(day, '19'), recoveredBy, declaredAmount: null }];
    return [];
  }
  if (kind === 'sales') {
    if (fixture.negative) return [];
    const rows = [sale('cash', 'efectivo', 20), yape, sale('mixed', 'mixto', 20, { splitPayments: { efectivo: 8, yape: 12 } })];
    if (fixture.multi) rows.push(sale('cash-taller', 'efectivo', 12, { branchId: secondBranch.id }));
    if (fixture.dense) return [branch, secondBranch, ...extraBranches].flatMap(site => Array.from({ length: 18 }, (_, index) =>
      sale(`${site.id}-${index}`, 'efectivo', 10, { branchId: site.id, items: [{ id: 'product-' + index % 5,
        name: 'Pan artesanal de semillas con nombre comercial largo ' + index % 5, qty: 1, price: 10 }] })));
    return rows.filter(row => branchId === 'global' || row.branchId === branchId);
  }
  if (kind === 'contracts') return { contracts: [], payments: fixture.negative || fixture.dense ? [] : [{ ...base, id: 'advance', sourceId: orderId,
    type: 'advance', amount: 15, method: 'yape', occurredAt: at(day, '11') }] };
  if (kind === 'audit') return [{ ...base, id: orderId, contractNumber: 'PED-2026-0034', clientName: 'Clienta de ensayo' }];
  if (kind === 'voids') return fixture.compensated || fixture.negative || fixture.fault === 'integrity'
    ? [{ ...base, id: yape.id, saleId: yape.id, userId: user.uid, authority: 'pos-compensation', amount: -30,
      cashAmount: 0, digitalAmount: fixture.fault === 'integrity' ? -29 : -30, items: yape.items, occurredAt: at(day, '12'), reason: 'Motivo de ensayo' }] : [];
  if (fixture.negative) return [];
  if (Number.isInteger(fixture.reviewCount)) return Array.from({ length: fixture.reviewCount }, (_, index) => {
    const openedAt = at(day, '08'), endedAt = at(day, String(12 + index).padStart(2, '0'));
    const session = { ...base, id: 'review-' + index, openedAt, openingAmount: 100 };
    if (index === 3) return { ...session, status: 'expired_unreconciled', expiredAt: endedAt, recoveredBy };
    return { ...session, status: 'closed', closedAt: endedAt, closedBy: unknown, declaredAmount: index === 2 ? null : index ? 100 : 196,
      reconciliationPending: index < 2, difference: index === 4 ? 2 : index === 5 ? -2 : null };
  });
  const cash = [{ ...base, id: 'cash-session', openingAmount: 100, declaredAmount: 128, status: 'closed', reconciliationPending: true, closedBy: unknown,
    openedAt: at(day, '08'), closedAt: at(day, '13') }];
  if (fixture.multi) cash.push({ ...base, id: 'cash-expired', branchId: secondBranch.id, openingAmount: 50, status: 'expired_unreconciled',
    openedAt: at(day, '08'), expiredAt: at(day, '18'), recoveredAt: at(day, '20'), recoveredBy, declaredAmount: null, difference: null });
  return cash;
};
fixture.read = async (...args) => {
  if (!fixture.reference) return readData(...args);
  const started = performance.now(), [kind] = args;
  if (fixture.readDelay) await new Promise(resolve => setTimeout(resolve, fixture.readDelay));
  const snapshot = await readData(...args);
  (fixture.timings ??= []).push({ kind, ms: performance.now() - started, rows: (snapshot.payments ?? snapshot).length });
  return snapshot;
};

function Fixture() {
  const [scope, setScope] = useState({ identityKey: 'original', branchId: branch.id, businessId: user.businessId, mounted: true });
  const resources = useMemo(() => createSessionResources(), [scope.identityKey, scope.businessId]); // ownership boundary
  useEffect(() => () => resources.close(), [resources]);
  fixture.setScope = update => setScope(previous => ({ ...previous, ...update }));
  fixture.resetReads = () => invalidateReportScope(resources, scope.businessId, 'global');
  fixture.loadPersonnel = () => {
    const personnel = resources.watch(`personnel:users:${getIdentityKey(user)}`, next => {
      next([{ id: recoveredBy, businessId: user.businessId, firstName: 'Luis', lastName: 'Quispe' }], { fromCache: false, hasPendingWrites: false });
      return () => {};
    }, []);
    personnel.subscribe(() => {})();
  };
  return <SessionResourcesContext.Provider value={resources}>
    <TenantContext.Provider value={{ activeBranchId: scope.branchId, identityKey: scope.identityKey, businessBranches: [branch, secondBranch, ...(fixture.dense ? extraBranches : [])],
      settings: { companyData: { razonSocial: fixture.reference ? 'Pastelería Nube de ensayo' : 'Pan de ensayo <img src="https://no-network.invalid/">' } } }}>
      <main className="mx-auto max-w-5xl px-3 py-6 sm:px-6"><h1 className="sr-only">Historial de ventas</h1>
        {scope.mounted && <ExportSales user={{ ...user, businessId: scope.businessId }} />}
      </main>
    </TenantContext.Provider>
  </SessionResourcesContext.Provider>;
}

createRoot(document.getElementById('root')).render(<Fixture />);
await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
if (navigator.onLine) await fetch('/__phase4-report', { method: 'POST', body: JSON.stringify({ ok: true }) });
