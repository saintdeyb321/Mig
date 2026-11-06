
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import fixture from 'virtual:browser-fixture';
import AppLayout from '/src/layouts/AppLayout.jsx';
import POS from '/src/modules/POS.jsx';
import Auth from '/src/modules/Auth.jsx';
import Categories from '/src/modules/CategoryManager.jsx';
import Products from '/src/modules/ProductCatalog.jsx';
import Agenda from '/src/modules/AgendaManager.jsx';
import Reports from '/src/modules/Reports.jsx';
import ExportSales from '/src/modules/ExportSales.jsx';
import Settings from '/src/modules/Settings.jsx';
import Users from '/src/modules/UserManagement.jsx';
import Branches from '/src/modules/BranchManager.jsx';
import Contracts from '/src/modules/contracts/ContractManager.jsx';
import History from '/src/modules/SalesHistory.jsx';
import SuperAdmin from '/src/modules/SuperAdmin.jsx';
import BackupPanel from '/src/features/backups/components/BackupPanel.jsx';
import ContractFormModal from '/src/modules/contracts/components/ContractFormModal.jsx';
import ContractDetailsModal from '/src/modules/contracts/components/ContractDetailsModal.jsx';
import ContractCancelModal from '/src/modules/contracts/components/ContractCancelModal.jsx';
import { ContractPhotoViewer } from '/src/modules/contracts/components/ContractPhotoViewer.jsx';
import { CashRegisterModals, CashCountSummary } from '/src/modules/CashRegisterModals.jsx';
import { BranchQuotaModal } from '/src/modules/admin/BranchQuotaModal.jsx';
import { BusinessDetailsDialog } from '/src/modules/admin/BusinessDetailsDialog.jsx';
import { Dialog, DialogFooter, ConfirmDialog, Button, FormField, Input, Alert, EmptyState, LoadingState } from '/src/shared/ui/index.js';
import { TenantContext } from '/src/features/branches/context/TenantContext.js';
import { CatalogContext } from '/src/features/catalog/context/CatalogContext.js';
import { SessionResourcesContext } from '/src/core/session/sessionResourceHooks.js';
import { createSessionResources } from '/src/core/session/sessionResources.js';

const style = document.createElement('style'); style.textContent = fixture.css; document.head.append(style);
const noop = () => {}, forbidden = () => { throw Error('This fixture cannot perform business writes'); };
const branch = { id: 'p09-branch', name: 'Sede de simulación', status: 'activo', sparkCashVersion: 1 };
const products = Array.from({ length: 40 }, (_, i) => ({ id: 'p09-product-' + i, name: 'Producto de prueba ' + i, price: 5, cost: 1, category: 'Panes', status: 'activo', businessId: 'p09-tenant', stock: { [branch.id]: 100 }, posStockVersion: { [branch.id]: 0 } }));
const owner = { uid: 'p09-user', businessId: 'p09-tenant', branchId: branch.id, role: 'dueño', firstName: 'María', lastName: 'Simulación', email: 'fixture@example.test' };
const sale = (id, state) => ({ id, saleId: id, localId: id, userId: owner.uid, businessId: owner.businessId, branchId: branch.id, total: 5, payment: 'efectivo', amountPaid: 5, change: 0, createdAt: '2026-11-04T13:00:00Z', items: [{ ...products[0], qty: 1 }], atomicProtocol: 2, isOffline: state !== 'confirmed', financialState: state, queueStatus: state === 'rejected' ? 'failed' : 'pending' });
const contract = { id: 'p09-contract', contractId: 'PEDIDO-DE-SIMULACION-IDENTIFICADOR-LARGO', clientName: 'Cliente de simulación', clientPhone: '000000000', status: 'pendiente', total: 106.3, subtotal: 100, deliveryCost: 6.3, balance: 86.3, paidTotal: 20, createdAt: '2026-11-04T13:00:00Z', deliveryDate: '2026-11-05T15:00:00Z', deliveryType: branch.id, details: 'Un pedido de prueba con una descripción extensa que debe conservar su legibilidad y estructura.' };
const base = { isLoading: false, isProcessing: false, error: null, retry: noop, searchTerm: '', setSearchTerm: noop, showFormModal: false, setShowFormModal: noop, name: '', setName: noop, status: 'activo', setStatus: noop, editing: null, showInactive: false, setShowInactive: noop, openAddForm: noop, openEditForm: noop, handleSave: forbidden };
window.__p09 = {
  cash: { currentSession: { id: 'p09-session', userId: owner.uid, runtime: 'spark', serverConfirmed: true }, isExpired: false, expiresAt: null, remainingMinutes: 300, isLoadingSession: false, checkSession: noop, openRegister: forbidden, calculateClose: forbidden, confirmClose: forbidden },
  categories: { ...base, filteredCategories: [{ id: 'category', name: 'Categoría de simulación', status: 'activo' }] },
  products: { ...base, categories: [{id:'pan',name:'Panes',status:'activo'}], businessBranches: [branch], filteredProducts: products.slice(0, 4), branchStocks: {}, setBranchStocks: noop, setImageUrl: noop, imageUrl: '', price: 5, setPrice: noop, category: 'Panes', setCategory: noop },
  agenda: { ...base, filteredContacts: [{ id: 'contact', name: 'Contacto de prueba', phone: '000000000' }], phone: '', setPhone: noop, handleDelete: forbidden },
  settings: { companyData: { razonSocial: 'Negocio de simulación', ruc: '00000000000', direccion: 'Dirección de prueba', telefono: '000000000' }, handleCompanyDataChange: noop, saveCompanyData: forbidden, isSavingData: false },
  branches: { ...base, branches: [branch], branchQuota: { registeredBranchQuotaVersion: 1, activeBranchIds: [branch.id], registeredBranchIds: [branch.id], maxActiveBranches: 2, maxRegisteredBranches: 5 }, address: '', setAddress: noop, phone: '', setPhone: noop, handleImageChange: noop, removeQrImage: noop },
  users: { ...base, filteredUsers: [{ ...owner, id: owner.uid }], branches: [branch], canManage: true, firstName: '', lastName: '', emailPrefix: '', role: 'cajero', shiftStart: '', shiftEnd: '', branchId: branch.id },
  reports: { summary: { netRevenue: 106.3, cashRevenue: 70, digitalRevenue: 36.3, posTicketCount: 3, posRevenue: 106.3, contractRevenue: 0, posAverageTicket: 35.43, voidedTicketCount: 0, contractPaymentCount: 0,
    channels: {
      cash: { collections: 70, posCompensations: 0, contractRefunds: 0, net: 70 },
      digital: { collections: 36.3, posCompensations: 0, contractRefunds: 0, net: 36.3 },
    },
  }, contractCounts: { pending: 1, delivered: 0, cancelled: 0, withDebt: 1 }, topProducts: [{ name: 'Pan de prueba', qty: 3 }], chartData: [{ ventas: 106.3, date: '04 nov' }], isLoading: false, hasData: true, timeFilter: 'hoy', setTimeFilter: noop, refreshReport: noop, maxProductQty: 3 },
  contracts: { ...base, updatedAt: Date.now(), historyUpdatedAt: Date.now(), contracts: [contract], createContract: forbidden, updateContract: forbidden, cancelContract: forbidden, addPayment: forbidden, markDelivered: forbidden },
  history: { ...base, sales: [sale('confirmed', 'confirmed'), sale('draft', 'draft_offline'), sale('uncertain', 'submitted_uncertain'), { ...sale('voided', 'confirmed'), voided: true, voidReason: 'Motivo de prueba' }], rejected: [sale('rejected', 'rejected')], businessBranches: [branch], confirmedVoid: () => null, formatDate: () => '04 nov · 08:00 a. m.', anularVentaConfirmada: forbidden, verificarPendiente: noop, verificarAnulacion: noop },
  admin: { ...base, filteredLicenses: [{ id: 'p09-tenant', businessName: 'Negocio de simulación', ownerFirstName: 'María', ownerLastName: 'Simulación', ownerEmail: owner.email, expiry: '2099-01-01', status: 'activa', maxActiveBranches: 2, maxRegisteredBranches: 5, branchQuotaVersion: 1, registeredBranchQuotaVersion: 1, activeBranchIds: [branch.id], registeredBranchIds: [branch.id] }], licenses: [], refresh: noop, handleCreateClient: forbidden, handleExtendLicense: forbidden, handleToggleStatus: forbidden, handleSetBranchQuota: forbidden },
  backup: { busy: false, exportBackup: forbidden, checkBackup: forbidden, cancel: noop },
  forbidden, calls: 0,
};
const model = window.__p09, watchers = new Map();
model.revisions = {};
model.watch = (key, callback) => { if (!watchers.has(key)) watchers.set(key, new Set()); watchers.get(key).add(callback); return () => watchers.get(key).delete(callback); };
model.notify = key => { model.revisions[key] = (model.revisions[key] ?? 0) + 1; watchers.get(key)?.forEach(next => next()); };
for (const key of ['agenda', 'branches', 'products', 'categories', 'users']) {
  const state = model[key];
  state.setShowFormModal = value => { state.showFormModal = value; model.notify(key); };
  state.openAddForm = () => { state.showFormModal = true; state.editing = null; state.editingBranch = null; model.notify(key); };
  state.openEditForm = row => { Object.assign(state, row, { editing: row.id, editingBranch: row, showFormModal: true }); model.notify(key); };
  for (const field of ['name', 'phone', 'address', 'status', 'firstName', 'lastName', 'emailPrefix', 'role', 'shiftStart', 'shiftEnd', 'branchId']) {
    state['set' + field[0].toUpperCase() + field.slice(1)] = value => { state[field] = value; model.notify(key); };
  }
}
model.ledger = [{id:'p0907-payment',method:'efectivo',type:'advance',amount:20,occurredAt:'2026-11-04T13:00:00Z',cashierName:'Responsable de simulación'}];
model.exportCalls = [];
model.export = {isExporting:false, queryError:null, exportData:async (...args) => {model.exportCalls.push(args);}};
model.makeSale = sale;
model.platformDetail = { complete: true, branches: [branch], warnings: [], licenses: model.admin.filteredLicenses[0], tenants: {businessName:'Negocio de simulación',status:'active'},
  sections: [{name:'users',status:'complete',count:1},{name:'invites',status:'complete',count:0}], people: {users:[owner],invites:[]}, inventory:[{name:'contracts',status:'sample-only',count:1}] };
const resources = createSessionResources();
let control;
const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
window.addEventListener('error', event => { window.__p09.renderError = event.error?.stack ?? event.message; });
class RenderBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { window.__p09.renderError = error.stack; }
  render() { return this.state.error ? <p role="alert">Render fallido</p> : this.props.children; }
}
function DialogProbe() {
  const [open, setOpen] = useState(false), [nested, setNested] = useState(false), [busy, setBusy] = useState(false), [value, setValue] = useState('Valor conservado');
  window.__p09.dialog = { setBusy, setNested, setOpen };
  return <><Button id="p09-trigger" onClick={() => setOpen(true)}>Abrir formulario largo</Button>
    {open && <Dialog title="Formulario de prueba" description="Foco, scroll y estados ocupados." onClose={() => setOpen(false)} busy={busy}>
      <form onSubmit={event => event.preventDefault()} className="space-y-4">
        <FormField label="Dato conservado"><Input autoFocus id="p09-value" value={value} onChange={event => setValue(event.target.value)} /></FormField>
        {Array.from({ length: 12 }, (_, i) => <FormField key={i} label={'Campo ' + i}><Input defaultValue={'Dato ' + i} /></FormField>)}
        <Button id="p09-nested" variant="secondary" onClick={() => setNested(true)}>Abrir confirmación</Button>
        <DialogFooter><Button variant="secondary" onClick={() => setOpen(false)}>Volver</Button><Button id="p09-submit" type="submit">Guardar prueba</Button></DialogFooter>
      </form>
    </Dialog>}
    {nested && <ConfirmDialog title="Confirmación anidada" description="Una prueba visual sin operaciones financieras." onClose={() => setNested(false)} onConfirm={async () => { window.__p09.calls++; await new Promise((resolve, reject) => { window.__p09.confirmResolve = resolve; window.__p09.confirmReject = reject; }); }} />}
  </>;
}
function SpecializedModal({ kind, user }) {
  const [open, setOpen] = useState(true), [busy, setBusy] = useState(false);
  const [cashOpen, setCashOpen] = useState(kind === 'cash-open'), [cashClose, setCashClose] = useState(kind === 'cash-close');
  model.specialized = { setBusy };
  const close = () => setOpen(false), current = { ...contract, sparkContractVersion: 1, contractId: 'P09-' + 'IDENTIFICADOR'.repeat(9) };
  const props = { contract: current, user, onClose: close, isProcessing: busy, onConfirm: forbidden, onAddPayment: forbidden, onEditRequest: forbidden, onCancelRequest: forbidden, onMarkDelivered: forbidden };
  return <><Button onClick={() => setOpen(true)}>Abrir modal especializado</Button>{open && (kind === 'details' ? <ContractDetailsModal {...props} />
    : kind === 'cancel' ? <ContractCancelModal {...props} />
    : kind === 'photo' ? <ContractPhotoViewer images={['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6F8kAAAAASUVORK5CYII=']} index={0} busy={busy} onClose={close} />
    : kind === 'quota' ? <BranchQuotaModal user={user} license={model.admin.filteredLicenses[0]} onClose={close} onSave={forbidden} busy={busy} />
    : kind === 'business' ? <BusinessDetailsDialog user={user} license={model.admin.filteredLicenses[0]} onClose={close} onQuota={forbidden} />
    : kind === 'cash-summary' ? <Dialog title="Revisa el conteo" onClose={close} busy={busy}><CashCountSummary summary={model.countSummary ?? {openingAmount:11,posCash:106.3,contractCash:0,posCompensationCount:1,posCompensationCash:-106.3,posCompensationDigital:0,posCompensationTotal:-106.3,expectedAmount:11,declaredAmount:11,difference:0,hasUnverifiedDisbursements:true}} /></Dialog>
    : <CashRegisterModals showOpenModal={cashOpen} showCloseModal={cashClose} setShowOpenModal={setCashOpen} setShowCloseModal={setCashClose} isLoadingSession={busy} openRegister={model.openRegister ?? forbidden} calculateClose={model.calculateClose ?? forbidden} confirmClose={model.confirmClose ?? forbidden} />)}</>;
}
function Fixture() {
  const [view, setView] = useState('pos'), [role, setRole] = useState('dueño'), [revision, update] = useState(0), [branchId, setBranchId] = useState(branch.id);
  const user = role === 'superadmin' ? { ...owner, role, businessId: null } : { ...owner, role };
  control = { show: async (name, nextRole = role) => { window.__p09.renderError = null; setView(name); setRole(nextRole); update(n => n + 1); await frames(); }, setBranchId };
  const views = { pos: POS, auth: Auth, categories: Categories, products: Products, agenda: Agenda, reports: Reports, export: ExportSales, settings: Settings, users: Users, branches: Branches, contracts: Contracts, history: History, superadmin: SuperAdmin, backup: BackupPanel, dialogs: DialogProbe,
    operationalHistory: () => <><ExportSales user={user} /><History user={user} /></>,
    contractform: () => <ContractFormModal activeLocations={[branch]} onClose={() => setView('contracts')} onSubmit={forbidden} isProcessing={false} /> };
  for (const kind of ['details','cancel','photo','quota','business','cash-open','cash-close','cash-summary']) views[kind] = props => <SpecializedModal {...props} kind={kind} />;
  const View = views[view];
  const page = <RenderBoundary key={view + ':' + role + ':' + (view === 'pos' ? '' : revision)}><View user={user} businessId="p09-tenant" /></RenderBoundary>;
  return <SessionResourcesContext.Provider value={resources}><TenantContext.Provider value={{ user, identityKey: user.uid + role, activeBranchId: branchId, setActiveBranchId: setBranchId, businessBranches: [branch], settings: {}, branchesLoading: false }}><CatalogContext.Provider value={{ products, categories: [{ id: 'pan', name: 'Panes', status: 'activo' }], isLoading: false }}>
    {view === 'auth' ? page : <AppLayout user={user} tab={role === 'superadmin' ? 'superadmin' : view === 'operationalHistory' ? 'history' : view} setTab={setView} handleLogout={noop}>{page}</AppLayout>}
  </CatalogContext.Provider></TenantContext.Provider></SessionResourcesContext.Provider>;
}
const root = createRoot(document.getElementById('root')); root.render(<Fixture />);
await frames(); window.__p09.show = (...args) => control.show(...args); window.__p09.frames = frames;
window.__p09.setBranch = id => control.setBranchId(id);
window.__p09.stop = () => { root.unmount(); resources.close(); };
await fetch('/__phase4-report', { method: 'POST', body: JSON.stringify({ ok: true }) });
