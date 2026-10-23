import { useState, useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { findOpenSession, createSession, updateSession, cacheSession, reserveOfflineSession, previewSessionClose } from '../infrastructure/cashRegisterRepository';
import { calculateCashTotals } from '../../../../../functions/src/cash-register/domain/cashTotals.js';
import { money } from '../../sales/domain/saleModel.js';
import offlineDB from '../../../offlineDB';
import { encrypt, decrypt } from '../../../crypto';
import { auth } from '../../../core/firebase/client';
import { runtimeCapabilities } from '../../../config/runtimeCapabilities.js';

export const useCashRegister = (user, currentBranchId) => {
  const [currentSession, setCurrentSession] = useState(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const revision = useRef(0), processing = useRef(false);
  const openings = useRef(new Map());
  const canForce = ['dueño', 'superadmin'].includes(user?.role);
  const checkSession = useCallback(async () => {
    const token = ++revision.current;
    const active = () => token === revision.current && auth.currentUser?.uid === user?.uid;
    if (!user?.businessId || !currentBranchId || currentBranchId === 'global') {
      setCurrentSession(null); setIsLoadingSession(false); return;
    }
    setIsLoadingSession(true);
    try {
      if (!navigator.onLine) {
        let found = null;
        for (const record of await offlineDB.cash_sessions.toArray()) {
          try {
            const local = JSON.parse(await decrypt(record.data, user.uid));
            if (local.userId === user.uid && local.businessId === user.businessId && local.branchId === currentBranchId && local.status === 'open') {
              found = { ...local, id: record.localId }; break;
            }
          } catch { /* Ignore another identity's encrypted records. */ }
        }
        if (active()) setCurrentSession(found);
      } else {
        const session = await findOpenSession(user.businessId, currentBranchId);
        if (!active()) return;
        if (session?.userId === user.uid) {
          const cached = session.runtime === 'spark' ? session : await cacheSession(session, { preservePending: true });
          if (active()) setCurrentSession(cached.status === 'open' ? cached : null);
        } else if (session) setCurrentSession({ ...session, needsForceClose: true, canForceClose: canForce });
        else setCurrentSession(null);
      }
    } catch (error) {
      if (active()) { setCurrentSession(null); toast.error(error.message || 'No se pudo verificar la caja.'); }
    } finally { if (active()) setIsLoadingSession(false); }
  }, [user?.businessId, user?.uid, currentBranchId, canForce]);
  useEffect(() => {
    const revisionRef = revision;
    void checkSession();
    const online = () => { void checkSession(); };
    window.addEventListener('online', online);
    return () => { revisionRef.current++; window.removeEventListener('online', online); };
  }, [checkSession]);
  const authorizeOffline = async () => {
    if (!runtimeCapabilities.offlineSync) { toast.error('La autorización offline sigue pendiente de SPARK-4.'); return; }
    if (!navigator.onLine || processing.current || !user?.uid || currentBranchId === 'global') return;
    processing.current = true;
    try {
      await reserveOfflineSession({ uid: user.uid, businessId: user.businessId }, currentBranchId);
      toast.success('Apertura offline autorizada por 15 minutos. Abre la caja antes de desconectarte si necesitas un turno de 18 horas.');
    } catch (error) { toast.error(error.message || 'No se pudo autorizar la apertura offline.'); }
    finally { processing.current = false; }
  };
  const openRegister = async (openingAmount, notes = '') => {
    if (!user?.businessId || currentBranchId === 'global' || processing.current || auth.currentUser?.uid !== user.uid) return false;
    if (typeof openingAmount !== 'number' || !Number.isFinite(openingAmount) || openingAmount < 0) { toast.error('Monto de apertura inválido.'); return false; }
    if (!navigator.onLine) { toast.error('La apertura Spark requiere conexión. Los pendientes existentes se conservan.'); return false; }
    processing.current = true;
    const token = revision.current;
    const toastId = toast.loading('Abriendo caja...');
    try {
      let session;
      const command = JSON.stringify([user.uid, user.businessId, currentBranchId, openingAmount, notes]);
      if (!openings.current.has(command)) openings.current.set(command, crypto.randomUUID());
      if (navigator.onLine) session = await createSession({ userId: user.uid, businessId: user.businessId, branchId: currentBranchId,
        openingAmount, openingNote: notes, sessionId: openings.current.get(command) });
      else {
        let reserved;
        for (const record of await offlineDB.cash_sessions.toArray()) {
          try {
            const candidate = JSON.parse(await decrypt(record.data, user.uid));
            if (candidate.userId === user.uid && candidate.businessId === user.businessId && candidate.branchId === currentBranchId
              && candidate.status === 'reserved' && new Date(candidate.financialWindow?.expiresAt).getTime() > Date.now()) {
              reserved = { ...candidate, id: record.localId }; break;
            }
          } catch { /* Foreign ciphertext cannot authorize an offline opening. */ }
        }
        if (!reserved) throw new Error('Conéctate para autorizar la apertura offline.');
        session = { ...reserved, status: 'open', openingAmount, openingNote: notes, openedAt: new Date().toISOString(), offlineAuthorized: true };
        await offlineDB.cash_sessions.put({ localId: session.id, data: await encrypt(JSON.stringify(session), user.uid), sync: false });
      }
      openings.current.delete(command);
      if (auth.currentUser?.uid !== user.uid || token !== revision.current) { toast.dismiss(toastId); return false; }
      setCurrentSession(session);
      toast.success('Caja abierta y confirmada', { id: toastId }); return true;
    } catch (error) { toast.error(error.message || 'No se pudo abrir la caja.', { id: toastId }); return false; }
    finally { processing.current = false; }
  };
  const calculateClose = async declaredAmount => {
    if (!runtimeCapabilities.cashClosing) { toast.error('El cierre de caja sigue pendiente de SPARK-5.'); return null; }
    if (!navigator.onLine) { toast.error('El cierre operativo requiere conexión; pendientes locales conservados.'); return null; }
    if (!currentSession || (currentSession.needsForceClose && !canForce)) { toast.error('Solicita el cierre al administrador.'); return null; }
    try {
      if (navigator.onLine) return await previewSessionClose(currentSession.id, declaredAmount);
      const sales = [];
      for (const record of await offlineDB.sales.toArray()) {
        try {
          const sale = JSON.parse(await decrypt(record.data, user.uid));
          if (record.status !== 'failed' && record.sync !== 'failed' && sale.businessId === user.businessId && sale.userId === user.uid
            && sale.sessionId === currentSession.id) sales.push(sale);
        } catch { /* Offline preview only uses readable records owned by this identity. */ }
      }
      const totals = calculateCashTotals(currentSession, sales, []);
      toast('Estimación offline parcial; el servidor verificará el cierre al sincronizar.');
      return { ...totals, expectedAmount: totals.expectedCash, declaredAmount, difference: money(declaredAmount - totals.expectedCash) };
    } catch (error) { toast.error(error.message || 'No se pudo calcular el cierre.'); return null; }
  };
  const confirmClose = async (summary, notes = '') => {
    if (!runtimeCapabilities.cashClosing) { toast.error('El cierre de caja sigue pendiente de SPARK-5.'); return false; }
    if (!navigator.onLine) { toast.error('El cierre Spark requiere conexión.'); return false; }
    if (!currentSession || processing.current || auth.currentUser?.uid !== user.uid) return false;
    if (currentSession.needsForceClose && !canForce) { toast.error('El cierre forzado requiere administración.'); return false; }
    processing.current = true;
    const token = revision.current;
    const toastId = toast.loading('Cerrando caja...');
    try {
      if (navigator.onLine) await updateSession(currentSession.id, { declaredAmount: summary.declaredAmount, closingNote: notes },
        currentSession.branchId, { force: !!currentSession.needsForceClose });
      else {
        if (currentSession.needsForceClose) throw new Error('El cierre forzado requiere conexión.');
        const session = { ...currentSession, status: 'closed', declaredAmount: summary.declaredAmount, closingNote: notes,
          closedAt: new Date().toISOString(), reconciliationPending: true };
        await offlineDB.cash_sessions.put({ localId: session.id, data: await encrypt(JSON.stringify(session), user.uid), sync: false });
      }
      if (token === revision.current) setCurrentSession(null);
      toast.success('Caja cerrada; conciliación pendiente (estimación local)', { id: toastId }); return true;
    } catch (error) { toast.error(error.message || 'No se pudo cerrar la caja.', { id: toastId }); return false; }
    finally { processing.current = false; }
  };
  return { currentSession, isLoadingSession, checkSession, authorizeOffline, openRegister, calculateClose, confirmClose };
};
