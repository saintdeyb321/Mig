import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDocFromServer, getDocs, query, collection, where, limit, deleteDoc, terminate } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import XLSX from 'xlsx-js-style';
import fixture from 'virtual:browser-fixture';
import { createOfflineDatabase } from '../frontend/src/offlineDB.js';
import { createSaleQueue } from '../frontend/src/features/sales/application/saleQueue.js';
import { canonicalSale } from '../frontend/src/features/sales/domain/saleModel.js';
import { dexieSaleStore, createQueueLock } from '../frontend/src/features/sales/infrastructure/saleQueueStore.js';
import { encrypt, decrypt } from '../frontend/src/crypto.js';
import { aggregateReport } from '../frontend/src/features/reports/domain/reportTotals.js';
import { reportPeriod } from '../frontend/src/features/reports/domain/reportPeriod.js';
import { buildSalesWorkbook } from '../frontend/src/features/reports/application/salesWorkbook.js';

const checks = [], check = (condition, name) => { if (!condition) throw new Error(name); checks.push(name); };
const app = initializeApp({ projectId: 'demo-migapos', apiKey: 'demo-key', authDomain: 'demo-migapos.firebaseapp.com' });
const auth = getAuth(app), db = getFirestore(app), functions = getFunctions(app, 'us-central1');
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); connectFirestoreEmulator(db, '127.0.0.1', 8080); connectFunctionsEmulator(functions, '127.0.0.1', 5001);
const local = createOfflineDatabase('migapos-e2e-' + crypto.randomUUID());
const rpc = (name, data) => httpsCallable(functions, name)(data).then(result => result.data);
const scopedRows = async name => (await getDocs(query(collection(db, name), where('businessId', '==', fixture.businessId), where('branchId', '==', fixture.branchId), limit(100)))).docs.map(doc => ({ id: doc.id, ...doc.data() }));
const denied = async promise => { try { await promise; return false; } catch (error) { return error.code === 'permission-denied'; } };
let report;
try {
  await signInWithEmailAndPassword(auth, fixture.owner.email, fixture.password);
  const productId = crypto.randomUUID();
  await setDoc(doc(db, 'products', productId), { businessId: fixture.businessId, name: 'Fixture product', price: 10, cost: 3, status: 'activo', stock: { [fixture.branchId]: 10 } });
  check((await getDocFromServer(doc(db, 'products', productId))).data().price === 10, 'Owner login and product creation');
  const invitation = { email: fixture.cashier.email, businessId: fixture.businessId, branchId: fixture.branchId, role: 'cajero', status: 'activo', firstName: 'Fixture', lastName: '', shiftStart: null, shiftEnd: null };
  await setDoc(doc(db, 'invites', invitation.email), invitation); await signOut(auth);
  await signInWithEmailAndPassword(auth, fixture.cashier.email, fixture.password);
  const saved = (await getDocFromServer(doc(db, 'invites', invitation.email))).data();
  await setDoc(doc(db, 'users', auth.currentUser.uid), { ...saved, createdAt: new Date().toISOString() }); await deleteDoc(doc(db, 'invites', invitation.email));
  check((await getDocFromServer(doc(db, 'users', auth.currentUser.uid))).data().role === 'cajero', 'Verified invitation creates only assigned cashier profile');
  const sessionId = crypto.randomUUID();
  const session = await rpc('openCashSession', { sessionId, branchId: fixture.branchId, openingAmount: 0 });
  check(session.status === 'open' && !!session.financialWindow, 'Server-authorized cash opening');
  const identity = { uid: fixture.cashier.uid, businessId: fixture.businessId, branchId: fixture.branchId, role: 'cajero' };
  const ticket = overrides => canonicalSale({ localId: crypto.randomUUID(), businessId: fixture.businessId, branchId: fixture.branchId, userId: identity.uid,
    sessionId, items: [{ id: productId, name: 'Fixture product', qty: 1, price: 10 }], total: 10, payment: 'efectivo', amountPaid: 10, change: 0,
    createdAt: new Date().toISOString(), queuedAt: new Date().toISOString(), origin: 'online', ...overrides });
  const cash = ticket(); check((await rpc('submitSale', cash)).status === 'APPLIED', 'Cash sale');
  const mixed = ticket({ payment: 'mixto', splitPayments: { efectivo: 4, yape: 6 } });
  check((await rpc('submitSale', mixed)).status === 'APPLIED', 'Mixed sale');
  let online = false, writes = 0;
  const queue = createSaleQueue({ store: dexieSaleStore(local), encrypt, decrypt, online: () => online, currentIdentity: value => value.uid === auth.currentUser?.uid,
    withLock: createQueueLock(local), syncSessions: async () => new Set(), apply: sale => { writes++; return rpc('submitSale', sale); } });
  const offline = ticket({ origin: 'offline' }); await queue.submit(offline, identity);
  check(writes === 0 && (await local.sales.get(offline.saleId)).status === 'pending', 'Offline ticket remains durably encrypted before network sync');
  online = true; await queue.flush(identity);
  check(writes === 1 && (await local.sales.get(offline.saleId)).status === 'synced', 'Offline sync receives a server confirmation');
  check((await rpc('submitSale', offline)).status === 'ALREADY_APPLIED', 'Retry is idempotent');
  await rpc('voidSale', { saleId: cash.saleId, reason: 'Fixture void' });
  check((await getDocFromServer(doc(db, 'products', productId))).data().stock[fixture.branchId] === 8, 'Void restores stock exactly once');
  const contractId = crypto.randomUUID();
  const created = await rpc('createContract', { contractId, operationId: crypto.randomUUID(), branchId: fixture.branchId, clientName: 'Fixture', subtotal: 100, total: 100,
    initialPayment: { operationId: crypto.randomUUID(), amount: 20, method: 'efectivo' } });
  check(created.balance === 80, 'Contract advance');
  check((await rpc('addContractPayment', { contractId, operationId: crypto.randomUUID(), branchId: fixture.branchId, amount: 30, method: 'yape' })).balance === 50, 'Later contract installment');
  const cancelled = await rpc('cancelContract', { contractId, operationId: crypto.randomUUID(), branchId: fixture.branchId, reason: 'Fixture refund' });
  check(cancelled.paidTotal === 0 && cancelled.balance === 0, 'Cancellation creates signed refunds and zero fictitious debt');
  const closing = await rpc('closeCashSession', { sessionId, declaredAmount: 14 });
  check(closing.expectedCash === 14 && closing.difference === 0, 'Cash closing and reconciliation');
  const [sales, payments, stats] = await Promise.all(['sales', 'payments', 'daily_stats'].map(scopedRows));
  const period = reportPeriod('hoy'), model = aggregateReport({ sales, payments, businessId: fixture.businessId, branchId: fixture.branchId, period });
  check(model.summary.posRevenue === 20 && model.summary.contractRevenue === 0, 'Dashboard reconciles sales and signed ledger');
  const { workbook } = buildSalesWorkbook(XLSX, { period, detailed: true, sales, payments, stats, contracts: [{ id: contractId, ...(await getDocFromServer(doc(db, 'contracts', contractId))).data() }], sessions: [{ id: sessionId, ...closing }], businessId: fixture.businessId, branchId: fixture.branchId });
  check(new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }))[0] === 0x50, 'Real report workbook generated from confirmed emulator data');
  check(await denied(getDocFromServer(doc(db, 'branches', fixture.otherBranch))), 'Cashier cannot read a foreign tenant branch');
  await signOut(auth); await signInWithEmailAndPassword(auth, fixture.other.email, fixture.password);
  check(await denied(getDocFromServer(doc(db, 'products', productId))), 'Changing tenant does not expose prior tenant documents');
  report = { ok: true, checks };
} catch (error) { report = { ok: false, checks, error: `${checks.length} checks: ${error.stack || error}` }; }
finally { local.close(); await local.delete(); await signOut(auth); await terminate(db); await deleteApp(app); }
await fetch('/__phase4-report', { method: 'POST', body: JSON.stringify(report) });
