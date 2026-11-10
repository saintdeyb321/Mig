import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createSessionResources } from '../frontend/src/core/session/sessionResources.js';
import { SessionResourcesContext } from '../frontend/src/core/session/sessionResourceHooks.js';
import { TenantContext } from '../frontend/src/features/branches/context/TenantContext.js';
import ExportSales from '../frontend/src/modules/ExportSales.jsx';
import '../frontend/src/index.css';

const fixture = window.__excelFixture = { reads: 0, fault: '', empty: false, compensated: false };
const branch = { id: 'centro', name: 'Centro' };
const user = { uid: 'qa-excel-owner', businessId: 'qa-excel', role: 'dueño' };
const resources = createSessionResources();
const base = { businessId: user.businessId, branchId: branch.id, cashierName: 'Cajera de ensayo' };
const at = (day, hour) => `${day}T${hour}:00:00-05:00`;

fixture.read = async (kind, day) => {
  fixture.reads++;
  if (fixture.fault === 'permission') throw Object.assign(Error('Lectura de ensayo denegada'), { code: 'permission-denied', queryArea: 'sales-period' });
  if (fixture.fault === 'limit') throw Error('Demasiados tickets (máximo 10000). Selecciona un período menor.');
  if (fixture.fault === 'hold') await new Promise(resolve => { (fixture.pending ??= []).push(resolve); });
  if (fixture.empty) return kind === 'contracts' ? { contracts: [], payments: [] } : [];
  const sale = (id, payment, total, extra = {}) => ({ ...base, id, payment, total, createdAt: at(day, '10'),
    items: [{ id: 'product-' + id, name: '=1+1', qty: 1, price: total }], ...extra });
  const yape = sale('digital', 'yape', 30);
  if (kind === 'sales') return [sale('cash', 'efectivo', 20), yape, sale('mixed', 'mixto', 20, { splitPayments: { efectivo: 8, yape: 12 } })];
  if (kind === 'contracts') return { contracts: [], payments: [{ ...base, id: 'advance', sourceId: 'pedido', type: 'advance', amount: 15, method: 'yape', occurredAt: at(day, '11') }] };
  if (kind === 'voids') return fixture.compensated || fixture.fault === 'integrity'
    ? [{ ...base, id: yape.id, saleId: yape.id, userId: user.uid, authority: 'pos-compensation', amount: -30,
      cashAmount: 0, digitalAmount: fixture.fault === 'integrity' ? -29 : -30, items: yape.items, occurredAt: at(day, '12'), reason: 'Motivo de ensayo' }] : [];
  return [{ ...base, id: 'cash-session', openingAmount: 100, declaredAmount: 128, status: 'closed', reconciliationPending: true,
    openedAt: at(day, '08'), closedAt: at(day, '13') }];
};

function Fixture() {
  const [scope, setScope] = useState({ identityKey: 'original', branchId: branch.id, mounted: true });
  fixture.setScope = update => setScope(previous => ({ ...previous, ...update }));
  return <SessionResourcesContext.Provider value={resources}>
    <TenantContext.Provider value={{ activeBranchId: scope.branchId, identityKey: scope.identityKey, businessBranches: [branch] }}>
      <main className="mx-auto max-w-5xl px-3 py-6 sm:px-6"><h1 className="sr-only">Historial de ventas</h1>
        {scope.mounted && <ExportSales user={user} />}
      </main>
    </TenantContext.Provider>
  </SessionResourcesContext.Provider>;
}

createRoot(document.getElementById('root')).render(<Fixture />);
await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
if (navigator.onLine) await fetch('/__phase4-report', { method: 'POST', body: JSON.stringify({ ok: true }) });
