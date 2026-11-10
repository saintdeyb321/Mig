import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createSessionResources } from '../frontend/src/core/session/sessionResources.js';
import { SessionResourcesContext } from '../frontend/src/core/session/sessionResourceHooks.js';
import { TenantContext } from '../frontend/src/features/branches/context/TenantContext.js';
import ExportSales from '../frontend/src/modules/ExportSales.jsx';
import { invalidateReportScope } from '../frontend/src/features/reports/application/reportResource.js';
import { getIdentityKey } from '../frontend/src/core/session/identity.js';
import '../frontend/src/index.css';

const fixture = window.__excelFixture = { bootId: crypto.randomUUID(), reads: 0, fault: '', empty: false, compensated: false };
const branch = { id: 'centro', name: 'Centro' };
const secondBranch = { id: 'taller', name: 'Taller' };
const user = { uid: 'RMux1Jm3vl7pofbT54G6YXkT2lP7', businessId: 'qa-excel', role: 'dueño', firstName: 'Ana', lastName: 'Quispe' };
const unknown = 'QvY2SOyq7BnP9aU7cmeGPxaH2uP3';
const recoveredBy = 'RLui5Jm3wl7pofbT54G6YXkT2lP7';
const orderId = 'fe5ef63c-b034-4bdf-9e16-1492bb6c5258';
const extraBranches = ['Norte', 'Sur', 'Este', 'Oeste'].map((name, i) => ({ id: 'extra-' + i, name }));
const at = (day, hour) => `${day}T${hour}:00:00-05:00`;

fixture.read = async (kind, day, branchId, businessId = user.businessId) => {
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
  const cash = [{ ...base, id: 'cash-session', openingAmount: 100, declaredAmount: 128, status: 'closed', reconciliationPending: true, closedBy: unknown,
    openedAt: at(day, '08'), closedAt: at(day, '13') }];
  if (fixture.multi) cash.push({ ...base, id: 'cash-expired', branchId: secondBranch.id, openingAmount: 50, status: 'expired_unreconciled',
    openedAt: at(day, '08'), expiredAt: at(day, '18'), recoveredAt: at(day, '20'), recoveredBy, declaredAmount: null, difference: null });
  return cash;
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
      settings: { companyData: { razonSocial: 'Pan de ensayo <img src="https://no-network.invalid/">' } } }}>
      <main className="mx-auto max-w-5xl px-3 py-6 sm:px-6"><h1 className="sr-only">Historial de ventas</h1>
        {scope.mounted && <ExportSales user={{ ...user, businessId: scope.businessId }} />}
      </main>
    </TenantContext.Provider>
  </SessionResourcesContext.Provider>;
}

createRoot(document.getElementById('root')).render(<Fixture />);
await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
if (navigator.onLine) await fetch('/__phase4-report', { method: 'POST', body: JSON.stringify({ ok: true }) });
