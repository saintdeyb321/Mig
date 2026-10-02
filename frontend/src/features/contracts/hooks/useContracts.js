import { useTenantData } from '../../branches/context/TenantContext';
import { findOpenSession } from '../../cash-register/infrastructure/cashRegisterRepository';
import { subscribeContracts, createContractDocument, updateContractDocument, transformContract } from '../infrastructure/contractRepository';
import { timestampNow } from '../../../core/firebase/timestamps';
import { toMillisSafe } from '../../../core/dates/dateValues';
import { useScopedSubscription } from '../../../shared/hooks/useScopedSubscription';
import { useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';

export const useContracts = (user) => {
  const { activeBranchId, identityKey } = useTenantData();

  const [isProcessing, setIsProcessing] = useState(false);

  const getActiveSession = useCallback(async () => {
    if (!user?.uid || !activeBranchId || activeBranchId === 'global') return null;
    try {
      return await findOpenSession(user.businessId, activeBranchId, user.uid);
    } catch (error) {
      console.error("Error verificando caja:", error);
      return null;
    }
  }, [user, activeBranchId]);
  const businessId = user?.businessId;
  const watchContracts = useCallback((onData, onError) => subscribeContracts(businessId, onData, error => {
    console.error('Error cargando contratos:', error);
    toast.error('Error al cargar la agenda global.', { id: 'agenda-err' });
    onError(error);
  }), [businessId]);
  const { data: rawContracts, isLoading } = useScopedSubscription(businessId ? identityKey : null, watchContracts);
  const contracts = useMemo(() => {
    return [...rawContracts].sort((a, b) => {
      return toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt);
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
        date: timestampNow(),
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
        startDate: timestampNow(),
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
        createdAt: timestampNow(),
        updatedAt: timestampNow(),
        createdBy: user?.uid || 'Desconocido',
        creatorName: (`${user?.firstName || ''} ${user?.lastName || ''}`).trim() || 'Sistema'
      };

      await createContractDocument(finalData);
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
    if (existingContract?.status === 'cancelado') {
      toast.error('Operación denegada: Un pedido anulado no se puede modificar.');
      return false;
    }

    setIsProcessing(true);
    const toastId = toast.loading('Actualizando pedido...');

    try {
      const { newImages = [], retainedImages = [], ...cleanContractData } = updatedData;

      const compressedNewImgs = await Promise.all(newImages.map(f => compressImage(f)));
      const finalImages = [...retainedImages, ...compressedNewImgs];

      const safeTotal = Math.max(0, Number(cleanContractData.total) || 0);
      const totalPaid = (existingContract?.payments || []).reduce((acc, curr) => acc + (curr.amount > 0 && curr.type !== 'reembolso' ? curr.amount : 0), 0) -
                        (existingContract?.payments || []).reduce((acc, curr) => acc + (curr.type === 'reembolso' ? Math.abs(curr.amount) : 0), 0);

      const safeBalance = Math.max(0, safeTotal - totalPaid);
      let nextStatus = existingContract.status;
      if (existingContract.status === 'entregado' && safeBalance > 0) {
        nextStatus = 'entregado_con_deuda';
      } else if (existingContract.status === 'entregado_con_deuda' && safeBalance <= 0) {
        nextStatus = 'entregado';
      }

      await updateContractDocument(docId, {
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
        status: nextStatus,
        referenceImages: finalImages,
        referenceImage: finalImages[0] || null,
        updatedAt: timestampNow(),
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

      await transformContract(docId, data => {

        let refundPayments = [];
        (data.payments || []).forEach(p => {
          if (p.amount > 0 && p.type !== 'reembolso') {
            refundPayments.push({
              amount: -Math.abs(p.amount),
              method: p.method,
              date: timestampNow(),
              type: 'reembolso',
              sessionId: (p.method === 'efectivo' && session) ? session.id : null,
              cashierId: user?.uid || 'Desconocido',
              cashierName: (`${user?.firstName || ''} ${user?.lastName || ''}`).trim() || 'Sistema',
              reason: reason
            });
          }
        });

        return {
          status: 'cancelado',
          balance: 0,
          payments: [...(data.payments || []), ...refundPayments],
          voidedAt: timestampNow(),
          voidedBy: user?.uid,
          voidReason: reason,
          updatedAt: timestampNow()
        };
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

      await transformContract(docId, data => {
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
          date: timestampNow(),
          type: 'abono',
          label: `Cuota ${numCuota}`,
          sessionId: (method === 'efectivo' && session) ? session.id : null,
          cashierId: user?.uid || 'Desconocido',
          cashierName: (`${user?.firstName || ''} ${user?.lastName || ''}`).trim() || 'Sistema'
        };

        return {
          payments: [...(data.payments || []), newPayment],
          balance: newBalance,
          status: newStatus,
          updatedAt: timestampNow()
        };
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

  const markDelivered = useCallback(async contract => {
    if (isProcessing) return false;
    try {
      const status = contract.balance > 0 ? 'entregado_con_deuda' : 'entregado';
      await updateContractDocument(contract.id, { status });
      toast.success(`Estado actualizado a ${status === 'entregado' ? 'Entregado' : 'Entregado (Falta Pago)'}`);
      return true;
    } catch (error) {
      console.error(error);
      toast.error('Error al actualizar el estado logístico');
      return false;
    }
  }, [isProcessing]);

  return { contracts, isLoading, isProcessing, createContract, updateContract, cancelContract, addPayment, markDelivered };
};
