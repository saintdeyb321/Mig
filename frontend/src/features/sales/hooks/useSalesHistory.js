import { useTenantData } from '../../branches/context/TenantContext';
import { useRecentSales } from './useRecentSales';
import { toDateSafe } from '../../../core/dates/dateValues';
import { getFirebaseErrorCode } from '../../../core/errors/firebaseErrors';
import { useSessionState } from '../../../core/session/sessionResourceHooks.js';
import { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { voidSaleTransaction, verifyPendingSaleTransaction } from '../infrastructure/saleTransactions';

export const useSalesHistory = (user) => {
  const { activeBranchId } = useTenantData();
  const [pendingOnly, setPendingOnly] = useSessionState(`sales:pending:${activeBranchId}`, false);
  const { sales: globalSales, isLoading: isGlobalLoading, error, isStale, updatedAt, retry } = useRecentSales(user, { pendingOnly });
  const { businessBranches } = useTenantData();
  const [isProcessing, setIsProcessing] = useState(false);

  const sales = useMemo(() => {
    const rawSales = globalSales || [];
    const seenIds = new Set();

    return rawSales.filter(sale => {
      if (seenIds.has(sale.id)) return false;
      seenIds.add(sale.id);
      return true;
    });
  }, [globalSales]);

  const formatDate = (dateValue) => {
    if (!dateValue) return 'Fecha desconocida';
    const dateObj = toDateSafe(dateValue);
    if (!dateObj) return 'Fecha desconocida';

    return new Intl.DateTimeFormat('es-PE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(dateObj);
  };
  const anularVentaConfirmada = async (venta, voidReason) => {
    if (user?.role !== 'dueño' && user?.role !== 'superadmin' && user?.role !== 'cajero') {
      toast.error('Acceso denegado: No tienes permisos para anular ventas.'); return false;
    }

    if (venta.voided === true) {
      toast.error('Esta venta ya fue anulada anteriormente.'); return false;
    }

    setIsProcessing(true);
    const toastId = toast.loading('Anulando venta y ajustando contabilidad...');

    try {
      await voidSaleTransaction({ id: venta.id, voidReason });

      toast.success('Venta anulada correctamente', { id: toastId });
      return true;

    } catch (error) {
      console.error('Error al anular:', error);
      if (getFirebaseErrorCode(error) === 'aborted' || error.message?.includes('version')) {
        toast.error('Conflicto: Venta modificada por otro usuario.', { id: toastId });
      } else {
        toast.error(error.message || 'Error de permisos o base de datos', { id: toastId });
      }
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  const verificarPendiente = async sale => {
    if (isProcessing) return;
    setIsProcessing(true);
    try { await verifyPendingSaleTransaction(sale, user); toast.success('Receipt remoto verificado; no se volvió a cobrar.'); }
    catch (error) { toast.error(error.message || 'Sigue pendiente para revisión.'); }
    finally { setIsProcessing(false); }
  };
  return { isStale, updatedAt, retry, pendingOnly, setPendingOnly, sales, error, isLoading: isGlobalLoading, isProcessing, formatDate, anularVentaConfirmada, verificarPendiente, businessBranches };
};
