import { checkedRead } from '../../../core/firebase/readDiagnostics.js';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../../../core/firebase/client';
import { mapDocuments } from '../../../core/firebase/documents';
import { callBackend } from '../../../core/firebase/callable.js';
import offlineDB from '../../../offlineDB.js';
import { encrypt, decrypt } from '../../../crypto.js';
import { persistCashSession } from '../application/sessionCache.js';
import { createCashStateReader, createCashPeriodReader } from './cashQueryRepository.js';
import { createSparkCashRepository } from './sparkCashRepository.js';
import { createSparkCashClosingRepository } from './sparkCashClosingRepository.js';
import { getSessionSales } from '../../sales/infrastructure/salesRepository.js';
import { getPaymentsBySession } from '../../payments/infrastructure/paymentRepository.js';
import { runtimeCapabilities, requireCapability } from '../../../config/runtimeCapabilities.js';

const sparkCash = createSparkCashRepository(db, { currentUser: () => auth.currentUser });

function sessionDTO(session) {
  return { ...session, ...Object.fromEntries(['openedAt', 'closedAt', 'syncedAt'].filter(key => session[key]?.toDate).map(key => [key, session[key].toDate().toISOString()])), ...(session.financialWindow ? { financialWindow: Object.fromEntries(Object.entries(session.financialWindow)
    .map(([key, value]) => [key, value?.toDate ? value.toDate().toISOString() : value])) } : {}) };
}
export const cacheSession = (session, options = {}) => persistCashSession(offlineDB, sessionDTO(session), { encrypt, decrypt, ...options });
export async function reserveOfflineSession(user, branchId) {
  requireCapability('offlineSync', 'Autorizar apertura offline');
  if (auth.currentUser?.uid !== user.uid) throw new Error('La sesión cambió.');
  for (const record of await offlineDB.cash_sessions.toArray()) {
    let session;
    try {
      session = JSON.parse(await decrypt(record.data, user.uid));
    } catch { /* Encrypted records belonging to another identity are never reusable. */ }
    if (session?.userId !== user.uid || session.businessId !== user.businessId || session.branchId !== branchId) continue;
    if (record.sync === false && ['open', 'closed', 'closed_with_discrepancy'].includes(session.status)) {
      throw new Error('Espera a que se sincronice la caja offline antes de abrir otro turno.');
    }
    if (session.status === 'reserved' && new Date(session.financialWindow?.expiresAt).getTime() > Date.now()) return session;
  }
  return cacheSession(await callBackend('reserveOfflineCashSession', { sessionId: crypto.randomUUID(), branchId }), { preservePending: true });
}
const readOpenSession = createCashStateReader(db);
export const findOpenSession = async (...args) => {
  const session = await readOpenSession(...args);
  return session ? sessionDTO(session) : null;
};
export const findLastClosedSession = async (businessId, branchId) => mapDocuments(await checkedRead(getDocs, 'cash-last-closed')(query(collection(db, 'cash_sessions'),
  where('businessId', '==', businessId), where('branchId', '==', branchId),
  where('status', 'in', ['closed', 'closed_with_discrepancy']), orderBy('closedAt', 'desc'), limit(1))))[0] ?? null;
// This is called only by the explicit opening action; checking state never acquires a lock.
export async function createSession(data) {
  if (runtimeCapabilities.cashOpening) {
    if (auth.currentUser?.uid !== data.userId) throw new Error('La sesión cambió.');
    const historical = await findOpenSession(data.businessId, data.branchId);
    if (historical && historical.id !== data.sessionId) throw new Error('Ya existe una caja abierta en la sede. Revisa el turno anterior.');
    return sessionDTO(await sparkCash.open(data));
  }
  const reserved = await reserveOfflineSession({ uid: data.userId, businessId: data.businessId }, data.branchId);
  if (reserved.status !== 'reserved') throw new Error('La caja anterior aún se está sincronizando.');
  return cacheSession(await callBackend('openCashSession', { sessionId: reserved.id, branchId: data.branchId,
    openingAmount: data.openingAmount, notes: data.openingNote }));
}
const closing = createSparkCashClosingRepository(db, { currentUser: () => auth.currentUser,
  readSales: getSessionSales, readPayments: session => getPaymentsBySession(session.businessId, session.id, session.branchId, { sparkOnly: session.runtime === 'spark' }) });
export const previewSessionClose = (id, declaredAmount) => closing.preview(id, declaredAmount);
export const updateSession = async (id, data) => sessionDTO(await closing.close(id, data.declaredAmount, data.closingNote));
export async function syncLocalSession(id, session, acknowledgedData) {
  requireCapability('offlineSync', 'Sincronizar caja histórica');
  const saved = session.status === 'open'
    ? await callBackend('openCashSession', { sessionId: id, branchId: session.branchId, openingAmount: session.openingAmount,
      notes: session.openingNote, openedAt: session.openedAt, offline: true })
    : await callBackend('closeCashSession', { sessionId: id, declaredAmount: session.declaredAmount, notes: session.closingNote,
      openingAmount: session.openingAmount, openedAt: session.openedAt, closedAt: session.closedAt, offline: true });
  return cacheSession(saved, { acknowledgedData });
}
export async function reconcilePendingSessions(identity) {
  requireCapability('cashReconciliation', 'Conciliación financiera');
  const waiting = await offlineDB.sales.where('[businessId+userId+status]').anyOf([
    [identity.businessId, identity.uid, 'pending'], [identity.businessId, identity.uid, 'syncing'],
  ]).toArray();
  const blocked = new Set();
  for (const record of waiting) {
    try { blocked.add(JSON.parse(await decrypt(record.data, identity.uid)).sessionId); }
    catch { return; }
  }
  const jobs = await offlineDB.settings.where('id').startsWith(`cash-reconcile:${identity.businessId}:${identity.uid}:`).toArray();
  for (const job of jobs) {
    if (auth.currentUser?.uid !== identity.uid) return;
    if (blocked.has(job.sessionId)) continue;
    const record = await offlineDB.cash_sessions.get(job.sessionId);
    if (!record) continue;
    let session;
    try { session = JSON.parse(await decrypt(record.data, identity.uid)); } catch { continue; }
    if (!record.sync || session.userId !== identity.uid || session.businessId !== identity.businessId || !session.reconciliationPending) continue;
    await cacheSession(await callBackend('reconcileCashSession', { sessionId: job.sessionId }));
  }
}
const readSessionsByDate = createCashPeriodReader(db, { project: sessionDTO });
export const getSessionsOpenedInPeriod = (...args) => readSessionsByDate('openedAt', ...args);
export const getSessionsInPeriod = async (...args) => {
  const [opened, closed] = await Promise.all([readSessionsByDate('openedAt', ...args), readSessionsByDate('closedAt', ...args)]);
  const sessions = [...new Map([...opened, ...closed].map(session => [session.id, session])).values()];
  if (sessions.length > 10000) throw new Error('Demasiadas cajas. Selecciona un período menor.');
  return sessions;
};
