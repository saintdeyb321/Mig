import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';
import { mapDocuments } from '../../../core/firebase/documents';
import { callBackend } from '../../../core/firebase/callable.js';
import offlineDB from '../../../offlineDB.js';
import { encrypt, decrypt } from '../../../crypto.js';

function sessionDTO(session) {
  return { ...session, ...(session.financialWindow ? {
    financialWindow: Object.fromEntries(Object.entries(session.financialWindow).map(([key, value]) =>
      [key, value?.toDate ? value.toDate().toISOString() : value])),
  } : {}) };
}
export async function cacheSession(session) {
  const dto = sessionDTO(session);
  await offlineDB.cash_sessions.put({ localId: session.id, data: await encrypt(JSON.stringify(dto), session.userId), sync: true });
  return dto;
}
export async function reserveOfflineSession(user, branchId) {
  const records = await offlineDB.cash_sessions.toArray();
  for (const record of records) {
    try {
      const session = JSON.parse(await decrypt(record.data, user.uid));
      if (session.userId === user.uid && session.businessId === user.businessId && session.branchId === branchId
        && session.status === 'reserved' && new Date(session.financialWindow?.expiresAt).getTime() > Date.now()) return session;
    } catch { /* Another user's encrypted session is not reusable. */ }
  }
  return cacheSession(await callBackend('saveCashSession', { action: 'reserve', sessionId: crypto.randomUUID(), branchId }));
}

export const findOpenSession = async (businessId, branchId, userId = null) => {
  const snapshot = await getDocs(query(collection(db, 'cash_sessions'),
    where('businessId', '==', businessId), where('branchId', '==', branchId),
    ...(userId ? [where('userId', '==', userId)] : []), where('status', '==', 'open'), limit(1)));
  const session = mapDocuments(snapshot)[0];
  return session ? sessionDTO(session) : null;
};
export const findLastClosedSession = async (businessId, branchId) => {
  const snapshot = await getDocs(query(collection(db, 'cash_sessions'),
    where('businessId', '==', businessId), where('branchId', '==', branchId),
    where('status', '==', 'closed'), orderBy('closedAt', 'desc'), limit(1)));
  return mapDocuments(snapshot)[0] || null;
};
export const createSession = async data => cacheSession(await callBackend('saveCashSession', {
  action: 'open', sessionId: crypto.randomUUID(), branchId: data.branchId, session: data,
}));
export const updateSession = async (id, data, branchId) => cacheSession(await callBackend('saveCashSession', {
  action: 'close', sessionId: id, branchId, session: data,
}));
export async function syncLocalSession(id, session) {
  if (session.offlineAuthorized) await callBackend('saveCashSession', {
    action: 'open', sessionId: id, branchId: session.branchId, session, offline: true,
  });
  const saved = session.status === 'open' ? await callBackend('saveCashSession', {
    action: 'open', sessionId: id, branchId: session.branchId, session, offline: true,
  }) : await callBackend('saveCashSession', {
    action: 'close', sessionId: id, branchId: session.branchId, session, offline: true,
  });
  return cacheSession(saved);
}

export const getSessionsOpenedInPeriod = async (businessId, startDate, endDate) => mapDocuments(await getDocs(query(
  collection(db, 'cash_sessions'), where('businessId', '==', businessId),
  where('openedAt', '>=', startDate), where('openedAt', '<=', endDate),
)));
