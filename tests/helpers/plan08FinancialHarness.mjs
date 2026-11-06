import { cashLockId } from '../../frontend/src/features/cash-register/infrastructure/sparkCashRepository.js';
import { canonicalSale } from '../../frontend/src/features/sales/domain/saleModel.js';

export const plan08Identity = { uid: 'p08-cashier', businessId: 'p08-tenant', branchId: 'p08-branch', role: 'cajero' };
export const plan08Timestamp = () => ({ toDate: () => new Date('2026-11-02T18:00:00.000Z') });
export const unavailable = () => Object.assign(Error('Respuesta perdida en prueba aislada'), { code: 'unavailable' });
export const plan08Sale = (id, overrides = {}) => canonicalSale({ localId: id, businessId: 'p08-tenant', branchId: 'p08-branch', userId: 'p08-cashier',
  sessionId: 'p08-cash-session', items: [{ id: 'p08-product', name: 'Producto de prueba', category: '', qty: 1, price: 70, cost: 3 }],
  total: 70, payment: 'efectivo', amountPaid: 70, change: 0, createdAt: '2026-11-02T17:59:00.000Z', ...overrides });

// Executes the real repository callbacks against an atomic in-memory document store.
// This is transaction/state verification, not a replacement for Firestore Rules tests.
export async function plan08FinancialHarness() {
  const actor = { ...plan08Identity }, documents = new Map(), writes = [], reads = [];
  const state = { afterCommitFailure: false, receiptReadFailure: false, sourceReadFailure: false, beforeRead: () => {}, onCommit: () => {}, transactions: 0 };
  let tail = Promise.resolve();
  documents.set('products/p08-product', { id: 'p08-product', businessId: actor.businessId, name: 'Producto de prueba', category: '',
    price: 70, cost: 3, status: 'activo', stock: { [actor.branchId]: 1 }, posStockVersion: { [actor.branchId]: 0 } });
  documents.set('users/' + actor.uid, { businessId: actor.businessId, branchId: actor.branchId, role: 'cajero', status: 'activo' });
  documents.set('branches/' + actor.branchId, { businessId: actor.businessId, status: 'activo', sparkCashVersion: 1 });
  documents.set('cash_sessions/p08-cash-session', { businessId: actor.businessId, branchId: actor.branchId, userId: actor.uid, status: 'open', runtime: 'spark', durationHours: 10, openedAt: plan08Timestamp() });
  documents.set('active_cash_sessions/' + await cashLockId(actor.businessId, actor.branchId), { businessId: actor.businessId, branchId: actor.branchId,
    userId: actor.uid, sessionId: 'p08-cash-session', status: 'open', runtime: 'spark' });
  const snapshot = ref => ({ id: ref.path.split('/').at(-1), ref, metadata: { fromCache: false, hasPendingWrites: false },
    exists: () => documents.has(ref.path), data: () => documents.get(ref.path) });
  const sdk = { doc: (_db, collection, id) => ({ path: `${collection}/${id}` }), serverTimestamp: plan08Timestamp,
    getDocFromServer: async ref => {
      reads.push(ref.path); state.beforeRead(ref);
      if ((state.receiptReadFailure && /^(sales|pos_voids)\//.test(ref.path)) || (state.sourceReadFailure && ref.path.startsWith('sales/'))) throw unavailable();
      return snapshot(ref);
    },
    runTransaction: (_db, work) => {
      const run = async () => {
      state.transactions++;
      const staged = [];
      const result = await work({ get: async ref => { reads.push(ref.path); return snapshot(ref); },
        set: (ref, data) => staged.push([ref, data]), update: (ref, data) => staged.push([ref, { ...documents.get(ref.path), ...data }]),
        delete: ref => staged.push([ref, null]) });
      for (const [ref, data] of staged) {
        if (data === null) documents.delete(ref.path); else documents.set(ref.path, data);
        writes.push(ref.path);
      }
      if (staged.length) state.onCommit();
      if (state.afterCommitFailure) throw unavailable();
      return result;
      };
      const result = tail.then(run, run); tail = result.catch(() => {}); return result;
    },
  };
  return { sdk, documents, writes, reads, state, actor, currentUser: () => ({ uid: actor.uid }) };
}

export function plan08MemoryStore() {
  const rows = new Map();
  return { rows, get: async id => rows.get(id), list: async () => [...rows.values()],
    insert: async row => { if (rows.has(row.localId)) throw Object.assign(Error('ID repetido'), { name: 'ConstraintError' }); rows.set(row.localId, { ...row }); },
    update: async (id, changes) => Object.assign(rows.get(id), changes) };
}
