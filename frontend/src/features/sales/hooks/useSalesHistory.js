import { useTenantData } from '../../branches/context/TenantContext';
import { useRecentSales } from './useRecentSales';
import { toDateSafe } from '../../../core/dates/dateValues';
import { getFirebaseErrorCode } from '../../../core/errors/firebaseErrors';
import { useSessionState, useSessionResources } from '../../../core/session/sessionResourceHooks.js';
import { invalidateReportScope } from '../../reports/application/reportResource.js';
import { useState, useMemo, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { voidSaleTransaction, verifyPendingSaleTransaction, voidRecovery } from '../infrastructure/saleTransactions';

export const useSalesHistory = (user) => {
  const resources = useSessionResources();
  const { activeBranchId } = useTenantData();
  const [pendingOnly, setPendingOnly] = useSessionState(`sales:pending:${activeBranchId}`, false);
  const { sales: globalSales, localCount, rejectedCount, uncertainCount, isLoading: isGlobalLoading, error, isStale, updatedAt, retry } = useRecentSales(user, { pendingOnly });
  const { businessBranches } = useTenantData();
  const [isProcessing, setIsProcessing] = useState(false);
  const processing = resources.value(`sales:operation:${user.uid}:${activeBranchId}`, () => ({ busy: false }));
  const scope = useRef(0);
  useEffect(() => { const ref = scope; return () => { ref.current++; }; }, [user.uid, user.businessId, activeBranchId]);

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
    if (processing.busy) return false;
    if (!['dueño', 'cajero'].includes(user?.role) || (user.role === 'cajero' && venta.branchId !== user.branchId)) {
      toast.error('Acceso denegado: No tienes permisos para anular ventas.'); return false;
    }

    if (venta.voided === true) {
      toast.error('Esta venta ya fue anulada anteriormente.'); return false;
    }

    processing.busy = true; setIsProcessing(true);
    const toastId = toast.loading('Anulando venta y ajustando contabilidad...');

    try {
      const result = await voidSaleTransaction({ id: venta.id, voidReason, identity: { ...user, branchId: venta.branchId } });

      toast.success(result.status === 'ALREADY_APPLIED' ? 'Anulación ya aplicada. No se creó otra compensación.' : 'Compensación contable confirmada y stock restituido. La entrega física del dinero no está acreditada.', { id: toastId });
      invalidateReportScope(resources, user.businessId, venta.branchId);
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
      processing.busy = false; setIsProcessing(false);
    }
  };

  const verificarPendiente = async sale => {
    if (processing.busy) return;
    processing.busy = true; setIsProcessing(true);
    const token = scope.current;
    try { await verifyPendingSaleTransaction(sale, user, () => resources.active && scope.current === token); toast.success('Comprobante confirmado; no se volvió a cobrar.'); }
    catch (error) { toast.error(error.message || 'Sigue pendiente para revisión.'); }
    finally { processing.busy = false; setIsProcessing(false); }
  };
  const verificarAnulacion = async sale => {
    if (processing.busy || (activeBranchId !== 'global' && sale.branchId !== activeBranchId)) return false;
    processing.busy = true; setIsProcessing(true);
    const token = scope.current;
    try {
      await voidRecovery.verify({ saleId: sale.id }, { ...user, branchId: sale.branchId }, () => resources.active && scope.current === token);
      toast.success('Anulación confirmada por el servidor. No se repitió stock, compensación ni entrega física.');
      invalidateReportScope(resources, user.businessId, sale.branchId);
      return true;
    } catch (error) { toast.error(error.message || 'Anulación pendiente de revisión. No repitas la operación.'); return false; }
    finally { processing.busy = false; setIsProcessing(false); }
  };
  return { isStale, updatedAt, retry, pendingOnly, setPendingOnly, localCount, rejectedCount, uncertainCount, sales, error, isLoading: isGlobalLoading, isProcessing, formatDate, anularVentaConfirmada, verificarPendiente, verificarAnulacion, businessBranches };
};
