import { isBranchOperational } from '../../branches/domain/branchPolicy.js';
import { cashExpiryWindow, NEW_CASH_DURATION_HOURS } from '../domain/cashExpiry.js';
import * as firestore from 'firebase/firestore';

export async function cashLockId(businessId, branchId) {
  if (![businessId, branchId].every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value))) throw new Error('Identificadores de sede/negocio no compatibles con el protocolo de caja Spark.');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([businessId, branchId])));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createSparkCashRepository(database, { currentUser, beforeRollover, sdk = firestore } = {}) {
  const { doc, runTransaction, getDocFromServer, serverTimestamp, Timestamp } = sdk;
  const confirmed = snapshot => !snapshot.metadata?.fromCache && !snapshot.metadata?.hasPendingWrites;
  const deadline = session => {
    const window = cashExpiryWindow(session);
    if (!window || !(session.openedAt instanceof Timestamp)) return null;
    return new Timestamp(session.openedAt.seconds + window.duration * 3600, session.openedAt.nanoseconds);
  };
  const expiryPatch = (expiredAt, recoveredAt, recoveredBy, recoverySessionId) => ({
    status: 'expired_unreconciled', expiredAt, recoveredAt, recoveredBy, recoverySessionId,
    recoveryReason: 'shift-time-limit', reconciliationPending: true, declaredAmount: null, difference: null,
  });
  const finalEvidence = session => {
    const expires = deadline(session);
    return expires && session.status === 'expired_unreconciled' && session.expiredAt instanceof Timestamp
      && session.recoveredAt instanceof Timestamp && session.expiredAt.isEqual(expires)
      && session.recoveredAt >= expires && session.declaredAmount === null && session.difference === null;
  };
  const uncertain = error => ['aborted', 'deadline-exceeded', 'unavailable', 'unknown'].includes(error.code);
  return {
    async finalizeExpired({ sessionId, businessId, branchId }) {
      const actorId = currentUser()?.uid;
      if (!actorId || branchId === 'global' || typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(sessionId)) throw new Error('Turno o identidad no verificados.');
      const lockRef = doc(database, 'active_cash_sessions', await cashLockId(businessId, branchId));
      const ref = doc(database, 'cash_sessions', sessionId);
      const active = () => { if (currentUser()?.uid !== actorId) throw new Error('La sesión cambió.'); };
      const sameScope = data => data?.businessId === businessId && data.branchId === branchId && data.runtime === 'spark';
      const isFinal = data => sameScope(data) && finalEvidence(data);
      try {
        await runTransaction(database, async tx => {
          const [session, lock] = await Promise.all([tx.get(ref), tx.get(lockRef)]);
          active();
          const data = session.data(), pointer = lock.data();
          if (isFinal(data) && pointer?.sessionId !== sessionId) return;
          if (!sameScope(data) || data.status !== 'open' || !deadline(data)
            || !sameScope(pointer) || pointer.status !== 'open' || pointer.sessionId !== sessionId || pointer.userId !== data.userId) {
            throw new Error('El turno o su candado requieren revisión.');
          }
          // Rules check request.time and require both writes in the same commit.
          tx.update(ref, expiryPatch(deadline(data), serverTimestamp(), actorId, null));
          tx.delete(lockRef);
        });
      } catch (error) {
        if (!['permission-denied', 'aborted', 'deadline-exceeded', 'unavailable', 'unknown'].includes(error.code)) throw error;
        // A competing tab or an ambiguous commit can already have finalized this same turn.
        const proof = await Promise.all([getDocFromServer(ref), getDocFromServer(lockRef)]).catch(() => null);
        active();
        if (!proof || proof.some(row => row.metadata?.fromCache || row.metadata?.hasPendingWrites)
          || !isFinal(proof[0].data()) || proof[1].data()?.sessionId === sessionId) throw error;
      }
      active();
    },
    async open({ sessionId, businessId, branchId, openingAmount, openingNote = '', recoverSessionId }) {
      const userId = currentUser()?.uid;
      if (!userId) throw new Error('Inicia sesión de nuevo.');
      if (branchId === 'global') throw new Error('Selecciona una sede física; la vista global es de solo lectura.');
      if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(sessionId)) throw new Error('ID de apertura inválido.');
      if (recoverSessionId != null && (typeof recoverSessionId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(recoverSessionId)
        || recoverSessionId === sessionId)) throw new Error('ID del turno anterior inválido.');
      if (!Number.isFinite(openingAmount) || openingAmount < 0 || openingAmount > 1000000000 || Math.round(openingAmount * 100) / 100 !== openingAmount) throw new Error('El fondo inicial debe ser un importe válido con máximo dos decimales.');
      if (typeof openingNote !== 'string' || openingNote.length > 2000) throw new Error('La nota de apertura supera el límite permitido.');
      const ref = doc(database, 'cash_sessions', sessionId), lockRef = doc(database, 'active_cash_sessions', await cashLockId(businessId, branchId));
      const sessionRef = id => doc(database, 'cash_sessions', id);
      let replacedId = null;
      const matchesOpening = saved => saved?.runtime === 'spark' && saved.userId === userId && saved.businessId === businessId
        && saved.branchId === branchId && saved.openingAmount === openingAmount && saved.openingNote === openingNote && saved.status === 'open';
      const matchesRecovery = previous => finalEvidence(previous) && previous.recoveredBy === userId
        && previous.businessId === businessId && previous.branchId === branchId && previous.recoverySessionId === sessionId;
      const matchesLock = lock => lock?.sessionId === sessionId && lock.userId === userId && lock.businessId === businessId
        && lock.branchId === branchId && lock.status === 'open' && lock.runtime === 'spark';
      const assertIdentity = () => {
        if (currentUser()?.uid !== userId) throw new Error('La sesión cambió.');
      };
      const commit = () => runTransaction(database, async tx => {
        const [existing, lock, branch, profile] = await Promise.all([tx.get(ref), tx.get(lockRef), tx.get(doc(database, 'branches', branchId)), tx.get(doc(database, 'users', userId))]);
        assertIdentity();
        if (existing.exists()) {
          if (!matchesOpening(existing.data()) || !matchesLock(lock.data())) throw new Error('El ID corresponde a una apertura distinta o el turno ya cambió.');
          if (recoverSessionId && matchesRecovery((await tx.get(sessionRef(recoverSessionId))).data())) replacedId = recoverSessionId;
          return;
        }
        if (!isBranchOperational(branch.data())) throw new Error('Sede inactiva o no verificada.');
        if (branch.data()?.sparkCashVersion !== 1) throw new Error('Sede histórica: requiere revisar cajas y pendientes antes de habilitar su apertura Spark. La lectura se conserva.');
        const timestamp = serverTimestamp();
        const active = lock.data();
        if (lock.exists()) {
          if (typeof active.sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(active.sessionId)
            || active.sessionId === sessionId || (recoverSessionId && active.sessionId !== recoverSessionId)
            || active.businessId !== businessId || active.branchId !== branchId
            || active.runtime !== 'spark' || active.status !== 'open') {
            throw new Error('El turno de esta sede cambió. Comprueba su estado.');
          }
          const previousRef = sessionRef(active.sessionId);
          const previous = (await tx.get(previousRef)).data();
          assertIdentity();
          const expiredAt = deadline(previous);
          if (previous?.status !== 'open' || previous.businessId !== businessId
            || previous.branchId !== branchId || previous.userId !== active.userId || !expiredAt) {
            throw new Error('El turno requiere revisión administrativa antes de abrir otra caja.');
          }
          if (Date.now() < expiredAt.toMillis()) throw new Error('Ya existe una caja vigente en esta sede.');
          await beforeRollover?.({ ...previous, id: active.sessionId }, userId);
          assertIdentity();
          // Rules enforce the exact deadline using request.time and couple all three writes.
          replacedId = active.sessionId;
          tx.update(previousRef, expiryPatch(expiredAt, timestamp, userId, sessionId));
        } else {
          replacedId = null;
          if (recoverSessionId) {
            const previous = (await tx.get(sessionRef(recoverSessionId))).data();
            if (!finalEvidence(previous) || previous.businessId !== businessId || previous.branchId !== branchId
              || previous.recoverySessionId !== null) throw new Error('El turno anterior requiere revisión antes de abrir otra caja.');
            assertIdentity();
          }
        }
        const p = profile.data() ?? {};
        const cashierName = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
        tx.set(ref, { businessId, branchId, userId, cashierName, status: 'open', openingAmount, openingNote, openedAt: timestamp, syncedAt: timestamp, runtime: 'spark', durationHours: NEW_CASH_DURATION_HOURS });
        tx.set(lockRef, { businessId, branchId, userId, sessionId, status: 'open', runtime: 'spark', updatedAt: timestamp });
      });
      const verify = async (checkLock = false) => {
        assertIdentity();
        const [opening, lock, previous] = await Promise.all([
          getDocFromServer(ref),
          (checkLock || replacedId) && getDocFromServer(lockRef),
          replacedId && getDocFromServer(sessionRef(replacedId)),
        ]);
        assertIdentity();
        if (!confirmed(opening) || !matchesOpening(opening.data())
          || (lock && (!confirmed(lock) || !matchesLock(lock.data())))
          || (previous && (!confirmed(previous) || !matchesRecovery(previous.data())))) {
          throw new Error('Apertura pendiente de comprobar. Reintenta con el mismo ID.');
        }
        return { id: opening.id, ...opening.data(), ...(previous && { recoveredSession: { id: previous.id, ...previous.data() } }) };
      };
      try { await commit(); }
      catch (error) {
        if (!uncertain(error)) throw error;
        try { return await verify(true); } catch { throw error; }
      }
      return verify();
    },
  };
}
