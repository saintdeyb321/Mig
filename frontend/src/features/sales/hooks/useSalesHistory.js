import { useTenantData } from '../../branches/context/TenantContext';
import { useRecentSales } from './useRecentSales';
import { toDateSafe } from '../../../core/dates/dateValues';
import { getFirebaseErrorCode } from '../../../core/errors/firebaseErrors';
import { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { voidSaleTransaction } from '../infrastructure/saleTransactions';

export const useSalesHistory = (user) => {
  const { sales: globalSales, isLoading: isGlobalLoading, error } = useRecentSales(user);
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
      return toast.error('Acceso denegado: No tienes permisos para anular ventas.');
    }

    if (venta.voided === true) {
      return toast.error('Esta venta ya fue anulada anteriormente.');
    }

    setIsProcessing(true);
    const toastId = toast.loading('Anulando venta y ajustando contabilidad...');

    try {
      const ticketParaAnular = {
        ...venta,
        voidReason: voidReason,
        voidedByRole: user?.role || 'Desconocido',
        voidedByName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Cajero'
      };

      await voidSaleTransaction(ticketParaAnular);

      toast.success('Venta anulada correctamente', { id: toastId });

    } catch (error) {
      console.error('Error al anular:', error);
      if (getFirebaseErrorCode(error) === 'aborted' || error.message?.includes('version')) {
        toast.error('Conflicto: Venta modificada por otro usuario.', { id: toastId });
      } else {
        toast.error(error.message || 'Error de permisos o base de datos', { id: toastId });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return { sales, error, isLoading: isGlobalLoading, isProcessing, formatDate, anularVentaConfirmada, businessBranches };
};
