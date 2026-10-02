import { findOpenSession, findLastClosedSession, createSession, updateSession, cacheSession, reserveOfflineSession } from '../infrastructure/cashRegisterRepository';
import { getSessionSales } from '../../sales/infrastructure/salesRepository';
import { getBranchContracts } from '../../contracts/infrastructure/contractRepository';
import { createAlert, upsertAlert } from '../../notifications/infrastructure/alertRepository';
import { toDateSafe } from '../../../core/dates/dateValues';
import { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';

import offlineDB from '../../../offlineDB';
import { encrypt, decrypt } from '../../../crypto';

export const useCashRegister = (user, currentBranchId) => {
  const [currentSession, setCurrentSession] = useState(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  const getFullName = useCallback(() => {
    if (!user) return "Cajero";
    const name = user.firstName || "";
    const lastName = user.lastName || "";
    const fullName = `${name} ${lastName}`.trim();
    return fullName || user.displayName || user.email?.split('@')[0] || "Cajero";
  }, [user]);

  const checkSession = useCallback(async () => {
    if (!user?.businessId || !currentBranchId || currentBranchId === 'global') {
      setCurrentSession(null);
      setIsLoadingSession(false);
      return;
    }

    setIsLoadingSession(true);

    if (!navigator.onLine) {
      try {
        const localSessions = await offlineDB.cash_sessions.toArray();
        let localOpenSession = null;

        for (const record of localSessions) {
          try {
            const sessionData = JSON.parse(await decrypt(record.data, user.uid));
            if (sessionData.userId === user.uid && sessionData.businessId === user.businessId && sessionData.branchId === currentBranchId && sessionData.status === 'open') {
              localOpenSession = { id: record.localId, ...sessionData };
              break;
            }
          } catch (e) { console.error("Error desencriptando caja local:", e); }
        }
        setCurrentSession(localOpenSession);
      } catch (err) {
        console.error("Error leyendo offlineDB:", err);
      } finally {
        setIsLoadingSession(false);
      }
      return;
    }

    try {
      const sessionData = await findOpenSession(user.businessId, currentBranchId);
      if (sessionData) {
        const sessionDoc = { id: sessionData.id };

        const openedAt = toDateSafe(sessionData.openedAt);
        const hoursOpen = (Date.now() - openedAt?.getTime()) / (1000 * 60 * 60);

        if (hoursOpen >= 18) {
          await updateSession(sessionDoc.id, {
            status: 'closed',
            closedAt: new Date().toISOString(),
            autoClosed: true,
            closingNote: '🚨 SISTEMA: Cerrado automáticamente por olvido (>18h abiertas)'
          }, currentBranchId);

          await upsertAlert(`autoclose_${sessionDoc.id}`, {
            type: 'FORGOTTEN_REGISTER',
            title: '⚠️ Caja olvidada (Auto-cerrada)',
            branchId: currentBranchId,
            cashierName: sessionData.cashierName || 'Desconocido',
            difference: 0,
            notes: `La caja estuvo abierta ${Math.floor(hoursOpen)} horas y el sistema la forzó a cerrar.`,
            createdAt: new Date().toISOString(),
            read: false,
            businessId: user.businessId,
            sessionId: sessionDoc.id
          });

          setCurrentSession(null);
          toast.error("Caja del turno anterior cerrada por inactividad.");
        } else {
          if (sessionData.userId === user.uid) {
            await cacheSession(sessionData);
            await reserveOfflineSession({ uid: user.uid, businessId: user.businessId }, currentBranchId)
              .catch(error => console.warn('Autorización de próxima caja offline pendiente:', error));
          }
          const isDifferentUser = sessionData.userId !== user.uid;
          setCurrentSession({
            id: sessionDoc.id,
            ...sessionData,
            needsForceClose: isDifferentUser
          });
        }
      } else {
        setCurrentSession(null);
        await reserveOfflineSession({ uid: user.uid, businessId: user.businessId }, currentBranchId);
      }
    } catch (error) {
      console.error("Error al verificar sesión de caja:", error);
      setCurrentSession(null);
    } finally {
      setIsLoadingSession(false);
    }
  }, [user?.businessId, currentBranchId, user?.uid]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const openRegister = async (openingAmount, notes = '') => {
    if (!user?.businessId || !currentBranchId) return false;
    if (openingAmount === null || openingAmount === '' || isNaN(openingAmount) || openingAmount < 0) {
      toast.error("Ingresa un monto válido (número positivo)");
      return false;
    }

    const loadingToast = toast.loading("Abriendo caja...");
    const nombreCompleto = getFullName();
    const declaredAmountNum = Number(openingAmount);

    if (!navigator.onLine) {
      try {
        const records = await offlineDB.cash_sessions.toArray();
        let reserved;
        for (const record of records) {
          try {
            const session = JSON.parse(await decrypt(record.data, user.uid));
            if (session.userId === user.uid && session.businessId === user.businessId && session.branchId === currentBranchId
              && session.status === 'reserved' && new Date(session.financialWindow?.expiresAt).getTime() > Date.now()) {
              reserved = { ...session, id: record.localId }; break;
            }
          } catch { /* Ignore sessions encrypted for another identity. */ }
        }
        if (!reserved) throw new Error('Conéctate una vez para autorizar la apertura offline de esta sede.');
        const localId = reserved.id;
        const newSession = {
          financialWindow: reserved.financialWindow,
          offlineAuthorized: true,
          businessId: user.businessId,
          branchId: currentBranchId,
          userId: user.uid,
          cashierName: nombreCompleto,
          openedAt: new Date().toISOString(),
          status: 'open',
          openingAmount: declaredAmountNum,
          expectedCash: declaredAmountNum,
          mismatchOnOpening: false,
          openingDiscrepancy: 0,
          openingNote: (notes || '') + ' (Apertura Offline)'
        };

        const encryptedData = await encrypt(JSON.stringify(newSession), user.uid);
        await offlineDB.cash_sessions.put({ localId, data: encryptedData, sync: false });

        setCurrentSession({ id: localId, ...newSession });
        toast.success("Caja abierta (Modo Offline ☁️)", { id: loadingToast });
        return true;
      } catch (err) {
        console.error(err);
        toast.error(err.message || "Error al abrir caja localmente", { id: loadingToast });
        return false;
      }
    }

    try {
      const lastSession = await findLastClosedSession(user.businessId, currentBranchId);

      let expectedFromPrevious = 0;
      let discrepancyAlert = null;
      let isNewDay = false;

      if (lastSession) {
        expectedFromPrevious = Number(lastSession.declaredAmount || 0);

        const lastCloseDate = toDateSafe(lastSession.closedAt)?.toLocaleDateString();
        const todayDate = new Date().toLocaleDateString();
        if (lastCloseDate !== todayDate) isNewDay = true;

        if (!isNewDay && expectedFromPrevious !== declaredAmountNum) {
          discrepancyAlert = {
            type: 'SHIFT_CHANGE_MISMATCH',
            title: '⚠️ Descuadre en Relevo de Turno',
            expectedFromPrevious: expectedFromPrevious,
            actualOpened: declaredAmountNum,
            difference: declaredAmountNum - expectedFromPrevious,
            previousCashier: lastSession.cashierName || 'Cajero Anterior',
            currentCashier: nombreCompleto,
            branchId: currentBranchId,
            createdAt: new Date().toISOString(),
            read: false,
            businessId: user.businessId,
            notes: notes || 'Sin justificación al abrir turno.'
          };
        }
      }

      const newSession = {
        businessId: user.businessId,
        branchId: currentBranchId,
        userId: user.uid,
        cashierName: nombreCompleto,
        openedAt: new Date().toISOString(),
        status: 'open',
        openingAmount: declaredAmountNum,
        expectedCash: declaredAmountNum,
        mismatchOnOpening: discrepancyAlert !== null,
        openingDiscrepancy: discrepancyAlert ? discrepancyAlert.difference : 0,
        openingNote: notes
      };

      const docRef = await createSession(newSession);

      if (discrepancyAlert) {
        await createAlert({ ...discrepancyAlert, sessionId: docRef.id });
      }

      setCurrentSession(docRef);
      toast.success("¡Caja abierta exitosamente!", { id: loadingToast });
      return true;
    } catch (error) {
      console.error("Error al abrir caja:", error);
      toast.error("Error al abrir caja", { id: loadingToast });
      return false;
    }
  };
  const calculateClose = async (declaredAmount) => {
    if (!currentSession) {
      toast.error("No hay una caja abierta para cerrar");
      return null;
    }

    const loadingToast = toast.loading("Calculando arqueo (Ventas y Pedidos)...");
    let totalCash = 0;
    let totalYape = 0;
    let totalSalesCount = 0;

    try {
      if (!navigator.onLine) {
        const localSales = await offlineDB.sales.toArray();
        for (const record of localSales) {
          try {
            const sale = JSON.parse(await decrypt(record.data, user.uid));
            if (sale.sessionId === currentSession.id && !sale.voided) {
              if (sale.payment === 'mixto' && sale.splitPayments) {
                totalCash += Number(sale.splitPayments.efectivo) || 0;
                totalYape += Number(sale.splitPayments.yape) || 0;
              } else if (sale.payment === 'efectivo') {
                totalCash += Number(sale.total) || 0;
              } else if (sale.payment === 'yape' || sale.payment === 'plin') {
                totalYape += Number(sale.total) || 0;
              }
              totalSalesCount++;
            }
          } catch (e) { console.error("Error desencriptando venta local:", e); }
        }
        toast.success("Cálculo parcial offline ☁️", { id: loadingToast });
      } else {
        // 🌐 MODO ONLINE: Ventas POS + Contratos

        // 1. Sumar Ventas Rápidas (POS)
        const sales = await getSessionSales(currentSession);
        sales.forEach(sale => {
          if (!sale.voided) {
            if (sale.payment === 'mixto' && sale.splitPayments) {
              totalCash += Number(sale.splitPayments.efectivo) || 0;
              totalYape += Number(sale.splitPayments.yape) || 0;
            } else if (sale.payment === 'efectivo') {
              totalCash += Number(sale.total) || 0;
            } else if (sale.payment === 'yape' || sale.payment === 'plin') {
              totalYape += Number(sale.total) || 0;
            }
            // 👈 FIX: Sumamos los tickets válidos (anulados no se cuentan aquí)
            totalSalesCount++;
          }
        });
        const branchContracts = await getBranchContracts(currentSession.businessId, currentSession.branchId);
        branchContracts.forEach(contract => {
          if (contract.payments && Array.isArray(contract.payments)) {
            contract.payments.forEach(payment => {
              if (payment.sessionId === currentSession.id) {
                if (payment.method === 'mixto' && payment.splitPayments) {
                  const montoEfectivo = Number(payment.splitPayments.efectivo) || 0;
                  totalCash += montoEfectivo;
                  totalYape += Number(payment.splitPayments.yape) || 0;
                  // 👈 FIX: Sumamos al contador si el contrato mixto introdujo efectivo a la gaveta
                  if (montoEfectivo > 0) totalSalesCount++;
                } else if (payment.method === 'efectivo') {
                  totalCash += Number(payment.amount);
                  if (payment.amount > 0) totalSalesCount++;
                } else if (payment.method === 'yape' || payment.method === 'plin') {
                  totalYape += Number(payment.amount);
                }
              }
            });
          }
        });

        toast.dismiss(loadingToast);
      }

      const expectedCash = (currentSession.openingAmount || 0) + totalCash;
      const declared = Number(declaredAmount);
      const difference = declared - expectedCash;

      return {
        expectedAmount: expectedCash,
        declaredAmount: declared,
        difference: difference,
        totalSales: totalSalesCount,
        totalCash: totalCash,
        totalYape: totalYape,
        openingAmount: currentSession.openingAmount || 0
      };
    } catch (error) {
      console.error("Error al calcular cierre:", error);
      toast.error("Error al calcular el arqueo", { id: loadingToast });
      return null;
    }
  };

  const confirmClose = async (summaryData, notes = '') => {
    if (!currentSession) return false;

    const loadingToast = toast.loading("Cerrando caja...");
    const status = Math.abs(summaryData.difference) < 0.01 ? 'closed' : 'closed_with_discrepancy';

    const updatedSessionData = {
      status,
      closedAt: new Date().toISOString(),
      declaredAmount: summaryData.declaredAmount,
      expectedCash: summaryData.expectedAmount,
      discrepancy: summaryData.difference,
      totalSales: summaryData.totalSales,
      totalCash: summaryData.totalCash,
      totalYape: summaryData.totalYape,
      closingNote: notes || null
    };

    if (!navigator.onLine) {
      try {
        const sessionToSave = { ...currentSession, ...updatedSessionData };
        sessionToSave.closingNote = (sessionToSave.closingNote || '') + ' [Offline]';

        const encryptedData = await encrypt(JSON.stringify(sessionToSave), user.uid);
        await offlineDB.cash_sessions.put({ localId: currentSession.id, data: encryptedData, sync: false });

        setCurrentSession(null);
        toast.success("Caja cerrada (Modo Offline ☁️)", { id: loadingToast });
        return true;
      } catch (err) {
        console.error(err);
        toast.error("Error al cerrar caja localmente", { id: loadingToast });
        return false;
      }
    }

    try {
      await updateSession(currentSession.id, updatedSessionData, currentSession.branchId);

      if (Math.abs(summaryData.difference) >= 0.01) {
        const alertData = {
          type: 'CASH_DISCREPANCY',
          title: `Descuadre de caja (${summaryData.difference > 0 ? 'Sobra' : 'Falta'} S/${Math.abs(summaryData.difference).toFixed(2)})`,
          sessionId: currentSession.id,
          branchId: currentSession.branchId,
          cashierName: currentSession.cashierName,
          expected: summaryData.expectedAmount,
          declared: summaryData.declaredAmount,
          difference: summaryData.difference,
          notes,
          createdAt: new Date().toISOString(),
          read: false,
          businessId: currentSession.businessId
        };
        await createAlert(alertData);

        toast(`Desfase de S/${Math.abs(summaryData.difference).toFixed(2)}. Alerta enviada.`, {
          id: loadingToast,
          duration: 5000,
          icon: '⚠️',
          style: { background: '#fffbeb', color: '#b45309', border: '1px solid #fcd34d' }
        });
      } else {
        toast.success("Caja cerrada correctamente", { id: loadingToast });
      }

      setCurrentSession(null);
      return true;
    } catch (error) {
      console.error("Error al cerrar caja:", error);
      toast.error("Error al cerrar", { id: loadingToast });
      return false;
    }
  };

  return {
    currentSession,
    isLoadingSession,
    checkSession,
    openRegister,
    calculateClose,
    confirmClose,
  };
};
