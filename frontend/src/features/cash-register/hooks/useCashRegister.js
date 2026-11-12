import { useState, useCallback, useEffect, useRef } from 'react';
import { useSessionResources, useSessionState } from '../../../core/session/sessionResourceHooks.js';
import { cashExpiryWindow } from '../domain/cashExpiry.js';
import { assertNoLocalCashPending } from '../application/localCashPending.js';
import toast from 'react-hot-toast';
import { findOpenSession, createSession, updateSession, cacheSession, reserveOfflineSession, previewSessionClose, watchCashAvailability, finalizeExpiredCash } from '../infrastructure/cashRegisterRepository';
import { calculateCashTotals } from '../../../../../functions/src/cash-register/domain/cashTotals.js';
import { money } from '../../sales/domain/saleModel.js';
import offlineDB from '../../../offlineDB';
import { encrypt, decrypt } from '../../../crypto';
import { auth } from '../../../core/firebase/client';
import { runtimeCapabilities } from '../../../config/runtimeCapabilities.js';
import { invalidateReportScope } from '../../reports/application/reportResource.js';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus.js';
export const useCashRegister = (user, currentBranchId) => {
  const resources = useSessionResources();
  const scopeKey = JSON.stringify([user?.uid, user?.businessId, currentBranchId]);
  const [readError, setReadError] = useSessionState('cash:error:' + scopeKey, null);
  const [currentSession, setCurrentSession, sessionCell] = useSessionState('cash:session:' + scopeKey, null);
  const [isLoadingSession, setIsLoadingSession] = useSessionState('cash:loading:' + scopeKey, true);
  const revision = useRef(0);
  const activeScope = useRef(null);
  useEffect(() => {
    activeScope.current = scopeKey;
    return () => { activeScope.current = null; };
  }, [scopeKey]);
  const processing = resources.value('cash:mutex:' + scopeKey, () => ({ current: false }));
  const openings = resources.value('cash:commands:' + scopeKey, () => ({ current: new Map() }));
  const expiryAttempt = resources.value('cash:expiry-attempt:' + scopeKey, () => ({ sessionId: null }));
  const [expiryState, setExpiryState] = useSessionState('cash:expiry:' + scopeKey, null);
  const online = useNetworkStatus();
  const readKey = 'cash:open:' + scopeKey;
  const [clock, setClock] = useState(() => Date.now());
  const expiresAt = cashExpiryWindow(currentSession)?.expiresAt.getTime() ?? null;
  const isExpired = expiresAt !== null && clock >= expiresAt;
  const recoverySession = isExpired && currentSession?.serverConfirmed && currentSession.status === 'open'
    && (user?.role === 'dueño' || user?.role === 'cajero' && user.branchId === currentBranchId) ? currentSession : null;
  useEffect(() => {
    if (expiresAt === null) return;
    const tick = () => setClock(Date.now());
    const timer = setInterval(tick, 30000);
    const deadline = setTimeout(tick, Math.max(0, expiresAt - Date.now()));
    window.addEventListener('focus', tick);
    return () => { clearInterval(timer); clearTimeout(deadline); window.removeEventListener('focus', tick); };
  }, [expiresAt]);
  const canForce = ['dueño', 'superadmin'].includes(user?.role);
  const checkSession = useCallback(async () => {
    const token = ++revision.current;
    setReadError(null);
    const active = () => resources.active && token === revision.current && auth.currentUser?.uid === user?.uid;
    if (!user?.businessId || !currentBranchId || currentBranchId === 'global') {
      setCurrentSession(null); setIsLoadingSession(false); return;
    }
    if (!sessionCell.get()) setIsLoadingSession(true);
    try {
      if (!navigator.onLine) {
        let found = null;
        for (const record of await offlineDB.cash_sessions.toArray()) {
          try {
            const local = JSON.parse(await decrypt(record.data, user.uid));
            if (local.userId === user.uid && local.businessId === user.businessId && local.branchId === currentBranchId && local.status === 'open') {
              found = { ...local, id: record.localId, serverConfirmed: false }; break;
            }
          } catch { /* Ignore another identity's encrypted records. */ }
        }
        if (active()) setCurrentSession(found);
      } else {
        const session = await resources.read(readKey, () => findOpenSession(user.businessId, currentBranchId), 15000);
        if (!active()) return;
        if (session?.userId === user.uid) {
          const cached = session.runtime === 'spark' ? session : await cacheSession(session, { preservePending: true });
          if (active()) setCurrentSession(cached.status === 'open' ? { ...cached, serverConfirmed: true } : null);
        } else if (session) setCurrentSession({ ...session, serverConfirmed: true, heldByOther: true, needsForceClose: true, canForceClose: canForce });
        else setCurrentSession(null);
      }
    } catch (error) {
      if (active()) { setReadError(error); setCurrentSession(null); toast.error(error.message || 'No se pudo verificar la caja.'); }
    } finally { if (active()) setIsLoadingSession(false); }
  }, [user?.businessId, user?.uid, currentBranchId, canForce, resources, readKey, sessionCell, setReadError, setCurrentSession, setIsLoadingSession]);
  useEffect(() => {
    const revisionRef = revision;
    void checkSession();
    const online = () => { expiryAttempt.sessionId = null; setClock(Date.now()); resources.invalidate(readKey); void checkSession(); };
    window.addEventListener('online', online);
    return () => { revisionRef.current++; window.removeEventListener('online', online); };
  }, [checkSession, resources, readKey, expiryAttempt]);
  useEffect(() => {
    if (!user?.businessId || !currentBranchId || currentBranchId === 'global') return;
    let active = true;
    const stop = watchCashAvailability(user.businessId, currentBranchId, null, () => {
      if (!active || !resources.active || auth.currentUser?.uid !== user.uid) return;
      resources.invalidate(readKey); void checkSession();
    }, error => { if (resources.active && auth.currentUser?.uid === user.uid) setReadError(error); });
    return () => { active = false; stop(); };
  }, [user?.businessId, user?.uid, currentBranchId, resources, readKey, checkSession, setReadError]);
  const refreshSession = useCallback(() => { resources.invalidate(readKey); return checkSession(); }, [resources, readKey, checkSession]);
  const finalizeTurn = useCallback(async () => {
    if (!recoverySession || !online || !navigator.onLine || processing.current || auth.currentUser?.uid !== user.uid) return false;
    processing.current = true;
    expiryAttempt.sessionId = recoverySession.id;
    const active = () => resources.active && auth.currentUser?.uid === user.uid;
    setExpiryState({ id: recoverySession.id, busy: true });
    try {
      await assertNoLocalCashPending(recoverySession, user.uid);
      if (!active() || sessionCell.get()?.id !== recoverySession.id) return false;
      await finalizeExpiredCash({ sessionId: recoverySession.id, businessId: user.businessId, branchId: currentBranchId });
      if (!active()) return false;
      setExpiryState({ id: recoverySession.id, finalized: true });
      if (sessionCell.get()?.id === recoverySession.id) setCurrentSession(null);
      invalidateReportScope(resources, user.businessId, currentBranchId);
      await refreshSession();
      return true;
    } catch (error) {
      if (active()) setExpiryState({ id: recoverySession.id, error: error.message || 'No se pudo confirmar la finalización.' });
      return false;
    } finally { processing.current = false; }
  }, [recoverySession, online, processing, expiryAttempt, resources, user.uid, user.businessId, currentBranchId, sessionCell, setCurrentSession, setExpiryState, refreshSession]);
  useEffect(() => {
    if (user?.role !== 'dueño' || !recoverySession || !online || expiryAttempt.sessionId === recoverySession.id) return;
    const attempt = () => {
      if (document.visibilityState === 'visible' && expiryAttempt.sessionId !== recoverySession.id) void finalizeTurn();
    };
    attempt();
    document.addEventListener('visibilitychange', attempt);
    return () => document.removeEventListener('visibilitychange', attempt);
  }, [user?.role, recoverySession, online, expiryAttempt, finalizeTurn]);
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
    revision.current++;
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
      resources.invalidate(readKey);
      invalidateReportScope(resources, user.businessId, currentBranchId);
      openings.current.delete(command);
      if (activeScope.current !== scopeKey || !resources.active || auth.currentUser?.uid !== user.uid) { toast.dismiss(toastId); return false; }
      revision.current++;
      setIsLoadingSession(false);
      setReadError(null);
      setCurrentSession(session);
      setExpiryState(null);
      toast.success('Caja abierta y confirmada', { id: toastId }); return true;
    } catch (error) { toast.error(error.message || 'No se pudo abrir la caja.', { id: toastId }); return false; }
    finally { processing.current = false; }
  };
  const calculateClose = async declaredAmount => {
    if (!runtimeCapabilities.cashClosing) { toast.error('El cierre de caja sigue pendiente de SPARK-5.'); return null; }
    if (!navigator.onLine) { toast.error('El cierre operativo requiere conexión; pendientes locales conservados.'); return null; }
    if (!currentSession || isExpired || (currentSession.needsForceClose && !canForce)) { toast.error('El turno no admite un cierre manual. Comprueba su estado.'); return null; }
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
    if (!currentSession || isExpired || processing.current || auth.currentUser?.uid !== user.uid) return false;
    if (currentSession.needsForceClose && !canForce) { toast.error('El cierre forzado requiere administración.'); return false; }
    processing.current = true;
    const token = ++revision.current;
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
      resources.invalidate(readKey);
      invalidateReportScope(resources, user.businessId, currentBranchId);
      if (resources.active && auth.currentUser?.uid === user.uid && token === revision.current) setCurrentSession(null);
      toast.success('Caja cerrada; conciliación pendiente (estimación local)', { id: toastId }); return true;
    } catch (error) { toast.error(error.message || 'No se pudo cerrar la caja.', { id: toastId }); return false; }
    finally { processing.current = false; }
  };
  return { currentSession, isExpired, expiresAt, recoverySession, expiryState, remainingMinutes: expiresAt === null ? null : Math.max(0, Math.ceil((expiresAt - clock) / 60000)), readError, isLoadingSession, checkSession: refreshSession, authorizeOffline, openRegister, calculateClose, confirmClose };
};
