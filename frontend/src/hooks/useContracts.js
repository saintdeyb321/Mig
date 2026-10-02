// src/hooks/useContracts.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import { 
  collection, addDoc, doc, updateDoc,
  Timestamp, query, where, onSnapshot,
  runTransaction, getDocs, limit
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useGlobalData } from '../context/GlobalDataContext';

export const useContracts = (user) => {
  const { activeBranchId } = useGlobalData();
  
  // Guardamos todos los contratos crudos aquí
  const [rawContracts, setRawContracts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const getActiveSession = useCallback(async () => {
    if (!user?.uid || !activeBranchId || activeBranchId === 'global') return null;
    try {
      const sessionQuery = query(
        collection(db, 'cash_sessions'),
        where('businessId', '==', user.businessId),
        where('branchId', '==', activeBranchId),
        where('userId', '==', user.uid), 
        where('status', '==', 'open'),
        limit(1)
      );
      const snapshot = await getDocs(sessionQuery);
      return !snapshot.empty ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } : null;
    } catch (error) {
      console.error("Error verificando caja:", error);
      return null;
    }
  }, [user, activeBranchId]);

  // 🚀 LISTENER ÚNICO Y GLOBAL (Sin filtros de sucursal y sin ordenar para evitar colapsos de índices)
  useEffect(() => {
    if (!user?.businessId) {
      setIsLoading(false); return;
    }

    setIsLoading(true);
    const contractsRef = collection(db, 'contracts');
    
    // Solo pedimos los del negocio. Simple, directo y a prueba de balas.
    const qGlobal = query(
      contractsRef, 
      where('businessId', '==', user.businessId)
    );

    const unsubGlobal = onSnapshot(qGlobal, (snapshot) => {
      const allDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRawContracts(allDocs);
      setIsLoading(false);
    }, (error) => {
      console.error("[Agenda Global]:", error);
      toast.error("Error al cargar la agenda global.", { id: 'agenda-err' });
      setIsLoading(false);
    });

    return () => unsubGlobal();
  }, [user?.businessId]); 

  // 🚀 React ordena todo en la RAM en milisegundos sin cobrarle a Firebase
  const contracts = useMemo(() => {
    return [...rawContracts].sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
      return dateB - dateA; 
    });
  }, [rawContracts]);

  const generateRobustOrderId = useCallback(() => {
    const now = new Date();
    const year = String(now.getFullYear()).slice(2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `PED-${year}${month}${day}-${randomHex}`; 
  }, []);

  const compressImage = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 800; 
          let { width, height } = img;
          if (width > height && width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } 
          else if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.onerror = () => reject(new Error('Error decodificando imagen'));
      };
      reader.onerror = () => reject(new Error('Error leyendo archivo'));
    });
  }, []);

  const createContract = useCallback(async (contractData = null) => {
    if (!user?.businessId || !activeBranchId || isProcessing) return false;

    const { newImages = [], retainedImages = [], ...cleanContractData } = contractData;
    const hasCashAdvance = cleanContractData.payments?.some(p => p.method === 'efectivo' && Number(p.amount) > 0);
    let session = null;
    
    if (hasCashAdvance) {
      session = await getActiveSession();
      if (!session) {
        toast.error('Para cobrar en EFECTIVO, debes abrir tu caja primero.', { duration: 5000 });
        return false;
      }
    }
    
    setIsProcessing(true);
    const toastId = toast.loading('Registrando pedido...');

    try {
      const contractId = generateRobustOrderId();
      const compressedNewImgs = await Promise.all(newImages.map(f => compressImage(f)));
      const finalImages = [...retainedImages, ...compressedNewImgs];

      const safePayments = (cleanContractData.payments || []).map(p => ({
        amount: Math.max(0, Number(p.amount) || 0),
        method: p.method || 'efectivo',
        date: Timestamp.now(),
        type: 'abono', 
        label: p.label || 'Cuota 1',
        sessionId: (p.method === 'efectivo' && session) ? session.id : null,
        cashierId: user?.uid || 'Desconocido',
        cashierName: (`${user?.firstName || ''} ${user?.lastName || ''}`).trim() || 'Sistema'
      }));

      const safeTotal = Math.max(0, Number(cleanContractData.total) || 0);
      const totalPaid = safePayments.reduce((acc, curr) => acc + curr.amount, 0);
      const safeBalance = Math.max(0, safeTotal - totalPaid);

      const finalData = {
        contractId,
        businessId: user.businessId,
        branchId: activeBranchId,
        clientName: cleanContractData.clientName || 'Cliente',
        clientPhone: cleanContractData.clientPhone || '',
        startDate: Timestamp.now(), 
        deliveryDate: cleanContractData.deliveryDate || null,
        details: cleanContractData.details || '',
        deliveryType: cleanContractData.deliveryType || 'recojo_local',
        deliveryAddress: cleanContractData.deliveryAddress || '',
        deliveryCost: Math.max(0, Number(cleanContractData.deliveryCost) || 0),
        subtotal: Math.max(0, Number(cleanContractData.subtotal) || 0),
        total: safeTotal,
        balance: safeBalance,
        payments: safePayments,
        status: safeBalance <= 0 ? 'listo_para_entrega' : 'pendiente',
        referenceImages: finalImages, 
        referenceImage: finalImages[0] || null, 
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: user?.uid || 'Desconocido',
        creatorName: (`${user?.firstName || ''} ${user?.lastName || ''}`).trim() || 'Sistema'
      };

      await addDoc(collection(db, 'contracts'), finalData);
      toast.success(`Pedido ${contractId} registrado`, { id: toastId });
      return true;

    } catch (error) {
      console.error("Error al crear contrato:", error); 
      toast.error('Error al registrar el pedido', { id: toastId });
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [user, activeBranchId, isProcessing, generateRobustOrderId, compressImage, getActiveSession]);

  const updateContract = useCallback(async (docId, updatedData = null) => {
    if (isProcessing) return false;
    const existingContract = contracts.find(c => c.id === docId);
    
    // 🚀 FIX: Ya no bloqueamos la edición si está "entregado", porque pueden querer subirle el precio 
    // por un extra post-entrega. Solo bloqueamos si está anulado.
    if (existingContract?.status === 'cancelado') {
      toast.error('Operación denegada: Un pedido anulado no se puede modificar.');
      return false;
    }

    setIsProcessing(true);
    const toastId = toast.loading('Actualizando pedido...');

    try {
      const contractRef = doc(db, 'contracts', docId);
      const { newImages = [], retainedImages = [], ...cleanContractData } = updatedData;
      
      const compressedNewImgs = await Promise.all(newImages.map(f => compressImage(f)));
      const finalImages = [...retainedImages, ...compressedNewImgs];

      const safeTotal = Math.max(0, Number(cleanContractData.total) || 0);
      const totalPaid = (existingContract?.payments || []).reduce((acc, curr) => acc + (curr.amount > 0 && curr.type !== 'reembolso' ? curr.amount : 0), 0) - 
                        (existingContract?.payments || []).reduce((acc, curr) => acc + (curr.type === 'reembolso' ? Math.abs(curr.amount) : 0), 0);
      
      const safeBalance = Math.max(0, safeTotal - totalPaid);

      // 🚀 INTELIGENCIA DE ESTADOS: Si le suben el precio a algo que ya entregaron, cambia a "Entregado con Deuda"
      let nextStatus = existingContract.status;
      if (existingContract.status === 'entregado' && safeBalance > 0) {
        nextStatus = 'entregado_con_deuda';
      } else if (existingContract.status === 'entregado_con_deuda' && safeBalance <= 0) {
        nextStatus = 'entregado';
      }

      await updateDoc(contractRef, {
        clientName: cleanContractData.clientName || '',
        clientPhone: cleanContractData.clientPhone || '',
        deliveryDate: cleanContractData.deliveryDate || null,
        details: cleanContractData.details || '',
        deliveryType: cleanContractData.deliveryType || 'recojo_local',
        deliveryAddress: cleanContractData.deliveryAddress || '',
        deliveryCost: Math.max(0, Number(cleanContractData.deliveryCost) || 0),
        subtotal: Math.max(0, Number(cleanContractData.subtotal) || 0),
        total: safeTotal,
        balance: safeBalance,
        status: nextStatus, // Actualizamos el estado logístico de forma inteligente
        referenceImages: finalImages, 
        referenceImage: finalImages[0] || null,
        updatedAt: Timestamp.now(),
      });
      
      toast.success('Pedido actualizado con éxito', { id: toastId });
      return true;
    } catch (error) {
      console.error("Error al actualizar contrato:", error);
      toast.error('Error al actualizar', { id: toastId });
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [contracts, isProcessing, compressImage]);

  const cancelContract = useCallback(async (docId, reason = "Anulado por el usuario") => {
    if (isProcessing) return false;
    const contractToCancel = contracts.find(c => c.id === docId);
    const hasCashPayments = contractToCancel?.payments?.some(p => p.method === 'efectivo' && p.amount > 0 && p.type !== 'reembolso');
    let session = null;

    if (hasCashPayments) {
      session = await getActiveSession();
      if (!session) {
        toast.error('Imposible reembolsar: Para devolver EFECTIVO, necesitas abrir una caja primero.', { duration: 6000 });
        return false;
      }
    }

    setIsProcessing(true);
    const toastId = toast.loading('Anulando y procesando reembolsos...');

    try {
      const contractRef = doc(db, 'contracts', docId);

      await runTransaction(db, async (transaction) => {
        const contractDoc = await transaction.get(contractRef);
        const data = contractDoc.data();

        let refundPayments = [];
        (data.payments || []).forEach(p => {
          if (p.amount > 0 && p.type !== 'reembolso') {
            refundPayments.push({
              amount: -Math.abs(p.amount), 
              method: p.method, 
              date: Timestamp.now(),
              type: 'reembolso',
              sessionId: (p.method === 'efectivo' && session) ? session.id : null,
              cashierId: user?.uid || 'Desconocido',
              cashierName: (`${user?.firstName || ''} ${user?.lastName || ''}`).trim() || 'Sistema',
              reason: reason
            });
          }
        });

        transaction.update(contractRef, {
          status: 'cancelado',
          balance: 0,
          payments: [...(data.payments || []), ...refundPayments],
          voidedAt: Timestamp.now(),
          voidedBy: user?.uid,
          voidReason: reason,
          updatedAt: Timestamp.now()
        });
      });

      toast.success('Pedido anulado y dinero reembolsado', { id: toastId });
      return true;
    } catch (error) {
      toast.error(error.message || 'Error al anular', { id: toastId });
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [contracts, user, isProcessing, getActiveSession]);

  const addPayment = useCallback(async (docId, paymentAmount, method) => {
    if (isProcessing) return false;
    const safeAmount = Number(paymentAmount);
    if (isNaN(safeAmount) || safeAmount <= 0) return toast.error('Monto inválido');

    let session = null;
    if (method === 'efectivo') {
      session = await getActiveSession();
      if (!session) {
        toast.error('Para cobrar en EFECTIVO, debes abrir tu caja primero.', { duration: 5000 });
        return false;
      }
    }

    setIsProcessing(true);
    const toastId = toast.loading('Procesando abono...');

    try {
      const contractRef = doc(db, 'contracts', docId);

      await runTransaction(db, async (transaction) => {
        const contractDoc = await transaction.get(contractRef);
        const data = contractDoc.data();
        if (data.balance <= 0) throw new Error("El pedido ya está totalmente pagado.");
        
        const numCuota = (data.payments || []).length + 1;
        const newBalance = data.balance - safeAmount;
        
        let newStatus = data.status;
        if (data.status === 'entregado_con_deuda' && newBalance <= 0) {
          newStatus = 'entregado'; 
        } else if (newBalance <= 0 && data.status !== 'entregado_con_deuda' && data.status !== 'entregado') {
          newStatus = 'listo_para_entrega'; 
        }

        const newPayment = {
          amount: safeAmount,
          method: method || 'efectivo',
          date: Timestamp.now(),
          type: 'abono',
          label: `Cuota ${numCuota}`, 
          sessionId: (method === 'efectivo' && session) ? session.id : null,
          cashierId: user?.uid || 'Desconocido',
          cashierName: (`${user?.firstName || ''} ${user?.lastName || ''}`).trim() || 'Sistema'
        };
        
        transaction.update(contractRef, {
          payments: [...(data.payments || []), newPayment],
          balance: newBalance,
          status: newStatus, 
          updatedAt: Timestamp.now()
        });
      });

      toast.success('Abono registrado con éxito', { id: toastId });
      return true;
    } catch (error) {
      toast.error(error.message || 'Error al procesar el pago', { id: toastId });
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [user, isProcessing, getActiveSession]);

  return { contracts, isLoading, isProcessing, createContract, updateContract, cancelContract, addPayment };
};