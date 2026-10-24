import { isBranchOperational } from '../../branches/domain/branchPolicy.js';
import * as firestore from 'firebase/firestore';

export async function cashLockId(businessId, branchId) {
  if (![businessId, branchId].every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value))) throw new Error('Identificadores de sede/negocio no compatibles con el protocolo de caja Spark.');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([businessId, branchId])));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createSparkCashRepository(database, { currentUser, sdk = firestore } = {}) {
  const { doc, runTransaction, getDocFromServer, serverTimestamp } = sdk;
  return {
    async open({ sessionId, businessId, branchId, openingAmount, openingNote = '' }) {
      const userId = currentUser()?.uid;
      if (!userId) throw new Error('Inicia sesión de nuevo.');
      if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(sessionId)) throw new Error('ID de apertura inválido.');
      if (!Number.isFinite(openingAmount) || openingAmount < 0 || openingAmount > 1000000000 || Math.round(openingAmount * 100) / 100 !== openingAmount) throw new Error('El fondo inicial debe ser un importe válido con máximo dos decimales.');
      if (typeof openingNote !== 'string' || openingNote.length > 2000) throw new Error('La nota de apertura supera el límite permitido.');
      const ref = doc(database, 'cash_sessions', sessionId), lockRef = doc(database, 'active_cash_sessions', await cashLockId(businessId, branchId));
      await runTransaction(database, async tx => {
        const [existing, lock, branch, profile] = await Promise.all([tx.get(ref), tx.get(lockRef), tx.get(doc(database, 'branches', branchId)), tx.get(doc(database, 'users', userId))]);
        if (currentUser()?.uid !== userId) throw new Error('La sesión cambió.');
        if (existing.exists()) {
          const saved = existing.data();
          if (saved.runtime !== 'spark' || saved.userId !== userId || saved.businessId !== businessId || saved.branchId !== branchId
            || saved.openingAmount !== openingAmount || saved.openingNote !== openingNote || saved.status !== 'open') throw new Error('El ID corresponde a una apertura distinta.');
          return;
        }
        if (!isBranchOperational(branch.data())) throw new Error('Sede inactiva o no verificada.');
        if (branch.data()?.sparkCashVersion !== 1) throw new Error('Sede histórica: requiere revisar cajas y pendientes antes de habilitar su apertura Spark. La lectura se conserva.');
        if (lock.exists()) throw new Error('Ya existe una caja activa o un candado histórico en esta sede. El cierre/mantenimiento sigue pendiente de migración.');
        const timestamp = serverTimestamp(), p = profile.data() ?? {};
        const cashierName = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
        tx.set(ref, { businessId, branchId, userId, cashierName, status: 'open', openingAmount, openingNote, openedAt: timestamp, syncedAt: timestamp, runtime: 'spark', durationHours: 10 });
        tx.set(lockRef, { businessId, branchId, userId, sessionId, status: 'open', runtime: 'spark', updatedAt: timestamp });
      });
      // Never return a provisional serverTimestamp as confirmation.
      const confirmed = await getDocFromServer(ref);
      if (!confirmed.exists()) throw new Error('Apertura pendiente de comprobar. Reintenta con el mismo ID.');
      return { id: confirmed.id, ...confirmed.data() };
    },
  };
}
