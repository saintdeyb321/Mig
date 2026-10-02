// src/hooks/useCashRegister.js
import { useState, useCallback, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, orderBy, limit, doc, setDoc, or, and } from 'firebase/firestore'; 
import { db } from '../firebase';
import toast from 'react-hot-toast';

import offlineDB from '../offlineDB';
import { encrypt, decrypt } from '../crypto';

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
    if (!user?.businessId || !currentBranchId) {
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
            if (sessionData.businessId === user.businessId && sessionData.branchId === currentBranchId && sessionData.status === 'open') {
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
      const q = query(
        collection(db, 'cash_sessions'),
        where('businessId', '==', user.businessId),
        where('branchId', '==', currentBranchId),
        where('status', '==', 'open'),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const sessionDoc = querySnapshot.docs[0];
        const sessionData = sessionDoc.data();
        
        const openedAt = sessionData.openedAt?.toDate ? sessionData.openedAt.toDate() : new Date(sessionData.openedAt);
        const hoursOpen = (Date.now() - openedAt.getTime()) / (1000 * 60 * 60);
        
        if (hoursOpen >= 18) {
          await updateDoc(doc(db, 'cash_sessions', sessionDoc.id), {
            status: 'closed',
            closedAt: new Date().toISOString(),
            autoClosed: true,
            closingNote: '🚨 SISTEMA: Cerrado automáticamente por olvido (>18h abiertas)'
          });

          const alertRef = doc(db, 'alerts', `autoclose_${sessionDoc.id}`);
          await setDoc(alertRef, {
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
          }, { merge: true });

          setCurrentSession(null);
          toast.error("Caja del turno anterior cerrada por inactividad.");
        } else {
          const isDifferentUser = sessionData.userId !== user.uid;
          setCurrentSession({ 
            id: sessionDoc.id, 
            ...sessionData,
            needsForceClose: isDifferentUser 
          });
        }
      } else {
        setCurrentSession(null);
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
        const localId = `local_session_${Date.now()}`;
        const newSession = {
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
        toast.error("Error al abrir caja localmente", { id: loadingToast });
        return false;
      }
    }

    try {
      const lastSessionQuery = query(
        collection(db, 'cash_sessions'),
        where('businessId', '==', user.businessId),
        where('branchId', '==', currentBranchId),
        where('status', '==', 'closed'),
        orderBy('closedAt', 'desc'),
        limit(1)
      );
      const lastSessionSnap = await getDocs(lastSessionQuery);
      
      let expectedFromPrevious = 0;
      let discrepancyAlert = null;
      let isNewDay = false; 

      if (!lastSessionSnap.empty) {
        const lastSession = lastSessionSnap.docs[0].data();
        expectedFromPrevious = Number(lastSession.declaredAmount || 0);

        const lastCloseDate = new Date(lastSession.closedAt).toLocaleDateString();
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

      const docRef = await addDoc(collection(db, 'cash_sessions'), newSession);
      
      if (discrepancyAlert) {
        await addDoc(collection(db, 'alerts'), { ...discrepancyAlert, sessionId: docRef.id });
      }

      setCurrentSession({ id: docRef.id, ...newSession });
      toast.success("¡Caja abierta exitosamente!", { id: loadingToast });
      return true;
    } catch (error) {
      console.error("Error al abrir caja:", error);
      toast.error("Error al abrir caja", { id: loadingToast });
      return false;
    }
  };

  // 🚀 ARQUEO DE CAJA AUDITADO Y SEGURO (CROSS-BRANCH)
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
              // 🚀 LÓGICA DE PAGOS MIXTOS (Arqueo de caja)
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
        const salesQuery = query(
          collection(db, 'sales'),
          where('businessId', '==', currentSession.businessId),
          where('branchId', '==', currentSession.branchId),
          where('sessionId', '==', currentSession.id)
        );
        const salesSnap = await getDocs(salesQuery);
        salesSnap.forEach(doc => {
          const sale = doc.data();
          if (!sale.voided) {
            // 🚀 LÓGICA DE PAGOS MIXTOS (Arqueo de caja)
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

        // 🚀 2. MAGIA CROSS-BRANCH: Sumar Pagos de Contratos 
        const contractsQuery = query(
          collection(db, 'contracts'),
          and(
            where('businessId', '==', currentSession.businessId),
            or(
              where('branchId', '==', currentSession.branchId),
              where('deliveryType', '==', currentSession.branchId)
            )
          )
        );
        const contractsSnap = await getDocs(contractsQuery);
        
        contractsSnap.forEach(doc => {
          const contract = doc.data();
          if (contract.payments && Array.isArray(contract.payments)) {
            contract.payments.forEach(payment => {
              // 🚀 LA PIEZA CLAVE: ¿Este pago pasó por la mano de ESTE cajero HOY?
              if (payment.sessionId === currentSession.id) {
                // 🚀 LÓGICA DE PAGOS MIXTOS (Arqueo de caja)
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
      await updateDoc(doc(db, 'cash_sessions', currentSession.id), updatedSessionData);

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
        await addDoc(collection(db, 'alerts'), alertData);
        
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
