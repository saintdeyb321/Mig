import { isBranchOperational } from '../../branches/domain/branchPolicy.js';
import * as firestore from 'firebase/firestore';

export async function cashLockId(businessId, branchId) {
  if (![businessId, branchId].every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value))) throw new Error('Identificadores de sede/negocio no compatibles con el protocolo de caja Spark.');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([businessId, branchId])));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createSparkCashRepository(database, { currentUser, sdk = firestore } = {}) {
  const { doc, runTransaction, getDocFromServer, serverTimestamp, Timestamp } = sdk;
  return {
    async finalizeExpired({ sessionId, businessId, branchId }) {
      const actorId = currentUser()?.uid;
      if (!actorId || branchId === 'global' || typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(sessionId)) throw new Error('Turno o identidad no verificados.');
      const lockRef = doc(database, 'active_cash_sessions', await cashLockId(businessId, branchId));
      const ref = doc(database, 'cash_sessions', sessionId);
      const active = () => { if (currentUser()?.uid !== actorId) throw new Error('La sesión cambió.'); };
      const sameScope = data => data?.businessId === businessId && data.branchId === branchId && data.runtime === 'spark';
      const isFinal = data => sameScope(data) && data.status === 'expired_unreconciled' && data.durationHours === 10
        && data.openedAt instanceof Timestamp && data.expiredAt instanceof Timestamp && data.recoveredAt instanceof Timestamp
        && data.expiredAt.seconds === data.openedAt.seconds + 36000 && data.expiredAt.nanoseconds === data.openedAt.nanoseconds
        && data.recoveredAt.toMillis() >= data.expiredAt.toMillis() && data.declaredAmount === null && data.difference === null;
      try {
        await runTransaction(database, async tx => {
          const [session, lock] = await Promise.all([tx.get(ref), tx.get(lockRef)]);
          active();
          const data = session.data(), pointer = lock.data();
          if (isFinal(data) && pointer?.sessionId !== sessionId) return;
          if (!sameScope(data) || data.status !== 'open' || data.durationHours !== 10 || !(data.openedAt instanceof Timestamp)
            || !sameScope(pointer) || pointer.status !== 'open' || pointer.sessionId !== sessionId || pointer.userId !== data.userId) {
            throw new Error('El turno o su candado requieren revisión.');
          }
          // Rules check request.time and require both writes in the same commit.
          tx.update(ref, { status: 'expired_unreconciled', expiredAt: new Timestamp(data.openedAt.seconds + 36000, data.openedAt.nanoseconds),
            recoveredAt: serverTimestamp(), recoveredBy: actorId, recoverySessionId: null, recoveryReason: 'shift-time-limit',
            reconciliationPending: true, declaredAmount: null, difference: null });
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
      const previousRef = recoverSessionId ? doc(database, 'cash_sessions', recoverSessionId) : null;
      const matchesOpening = saved => saved?.runtime === 'spark' && saved.userId === userId && saved.businessId === businessId
        && saved.branchId === branchId && saved.openingAmount === openingAmount && saved.openingNote === openingNote && saved.status === 'open';
      const matchesRecovery = previous => previous?.status === 'expired_unreconciled' && previous.recoveredBy === userId
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
          if (!matchesOpening(existing.data()) || !matchesLock(lock.data())
            || (previousRef && !matchesRecovery((await tx.get(previousRef)).data()))) throw new Error('El ID corresponde a una apertura distinta o el turno ya cambió.');
          return;
        }
        if (!isBranchOperational(branch.data())) throw new Error('Sede inactiva o no verificada.');
        if (branch.data()?.sparkCashVersion !== 1) throw new Error('Sede histórica: requiere revisar cajas y pendientes antes de habilitar su apertura Spark. La lectura se conserva.');
        const timestamp = serverTimestamp();
        if (previousRef) {
          const active = lock.data();
          if (active?.sessionId !== recoverSessionId || active.businessId !== businessId || active.branchId !== branchId
            || active.runtime !== 'spark' || active.status !== 'open') throw new Error('El turno de esta sede cambió. Comprueba su estado.');
          const previous = (await tx.get(previousRef)).data();
          assertIdentity();
          if (previous?.status !== 'open' || previous.runtime !== 'spark' || previous.businessId !== businessId
            || previous.branchId !== branchId || previous.userId !== active.userId || previous.durationHours !== 10
            || !(previous.openedAt instanceof Timestamp)) throw new Error('El turno requiere revisión administrativa antes de recuperarlo.');
          // Rules authorize the operation using request.time; the client only supplies the exact derived timestamp.
          tx.update(previousRef, { status: 'expired_unreconciled', expiredAt: new Timestamp(previous.openedAt.seconds + 36000, previous.openedAt.nanoseconds),
            recoveredAt: timestamp, recoveredBy: userId, recoveryReason: 'shift-time-limit', recoverySessionId: sessionId,
            reconciliationPending: true, declaredAmount: null, difference: null });
        } else if (lock.exists()) throw new Error('Ya existe una caja activa o un candado histórico en esta sede.');
        // New sessions have a fixed Rules-enforced duration; their clock starts on the server.
        // Never add this field to historical sessions during reads or idempotent retries.
        const p = profile.data() ?? {};
        const cashierName = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
        tx.set(ref, { businessId, branchId, userId, cashierName, status: 'open', openingAmount, openingNote, openedAt: timestamp, syncedAt: timestamp, runtime: 'spark', durationHours: 10 });
        tx.set(lockRef, { businessId, branchId, userId, sessionId, status: 'open', runtime: 'spark', updatedAt: timestamp });
      });
      const verify = async () => {
        assertIdentity();
        const confirmed = await getDocFromServer(ref);
        assertIdentity();
        if (confirmed.metadata?.fromCache || confirmed.metadata?.hasPendingWrites || !matchesOpening(confirmed.data())) throw new Error('Apertura pendiente de comprobar. Reintenta con el mismo ID.');
        if (!previousRef) return { id: confirmed.id, ...confirmed.data() };
        const [previous, lock] = await Promise.all([getDocFromServer(previousRef), getDocFromServer(lockRef)]);
        assertIdentity();
        if (previous.metadata?.fromCache || lock.metadata?.fromCache || previous.metadata?.hasPendingWrites || lock.metadata?.hasPendingWrites
          || !matchesRecovery(previous.data()) || !matchesLock(lock.data())) {
          throw new Error('Recuperación pendiente de comprobar. Revisa la caja o reintenta con el mismo ID.');
        }
        return { id: confirmed.id, ...confirmed.data(), recoveredSession: { id: previous.id, ...previous.data() } };
      };
      try { await commit(); }
      catch (error) {
        if (!previousRef || !['aborted', 'deadline-exceeded', 'unavailable', 'unknown'].includes(error.code)) throw error;
        // A commit may have succeeded before connectivity was lost. A read cannot repeat its writes.
        try { return await verify(); } catch { throw error; }
      }
      return verify();
    },
  };
}
