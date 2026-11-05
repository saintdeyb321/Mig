import { useTenantData } from '../../branches/context/TenantContext';
import { useRecentSales } from './useRecentSales';
import { toDateSafe } from '../../../core/dates/dateValues';
import { getFirebaseErrorCode } from '../../../core/errors/firebaseErrors';
import { useSessionResources } from '../../../core/session/sessionResourceHooks.js';
import { invalidateReportScope } from '../../reports/application/reportResource.js';
import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { voidSaleTransaction, verifyPendingSaleTransaction, voidRecovery } from '../infrastructure/saleTransactions';

export const useSalesHistory = user => {
  const resources = useSessionResources();
  const { activeBranchId, businessBranches } = useTenantData();
  const recent = useRecentSales(user);
  const [isProcessing, setIsProcessing] = useState(false);
  const [voidResult, setVoidResult] = useState(null);
  const processing = resources.value(`sales:operation:${user.uid}:${activeBranchId}`, () => ({ busy: false }));
  const scope = useRef(0);
  useEffect(() => {
    setIsProcessing(false); setVoidResult(null);
    const ref = scope; return () => { ref.current++; };
  }, [user.uid, user.businessId, activeBranchId]);
  const confirmedVoid = (id, reason) => {
    const receipt = recent.getVerifiedVoid(id);
    return receipt?.userId === user.uid && (!reason || receipt.reason === reason.trim()) ? receipt : null;
  };
  const formatDate = value => {
    const date = toDateSafe(value);
    return date ? new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }).format(date) : 'Fecha no disponible';
  };
  const anularVentaConfirmada = async (sale, reason) => {
    if (processing.busy) return false;
    if (!['dueño', 'cajero'].includes(user.role) || sale.businessId !== user.businessId
      || (user.role === 'cajero' && sale.branchId !== user.branchId)) {
      toast.error('Tu cuenta no puede anular este ticket.'); return false;
    }
    if (confirmedVoid(sale.id, reason)) return true;
    processing.busy = true; setIsProcessing(true);
    const token = scope.current;
    const active = () => resources.active && scope.current === token;
    const notice = toast.loading('Anulando ticket…');
    setVoidResult({ id: sale.id, phase: 'processing' });
    try {
      await voidSaleTransaction({ id: sale.id, voidReason: reason, identity: { ...user, branchId: sale.branchId } });
      if (!active()) { toast.dismiss(notice); return false; }
      setVoidResult({ id: sale.id, phase: 'confirmed' });
      invalidateReportScope(resources, user.businessId, sale.branchId);
      toast.success('Venta anulada. No se acredita una entrega física de dinero.', { id: notice });
      return true;
    } catch (error) {
      if (!active()) { toast.dismiss(notice); return false; }
      if (confirmedVoid(sale.id, reason)) {
        setVoidResult({ id: sale.id, phase: 'confirmed' });
        invalidateReportScope(resources, user.businessId, sale.branchId);
        toast.success('Anulación comprobada. No se repitió la operación.', { id: notice }); return true;
      }
      const uncertain = ['void-unverified', 'receipt-not-found', 'unavailable', 'deadline-exceeded', 'aborted'].includes(getFirebaseErrorCode(error));
      setVoidResult({ id: sale.id, phase: uncertain ? 'uncertain' : 'rejected', message: error.message });
      if (uncertain) toast('Comprobando anulación. Conserva el ticket y no repitas la operación.', { id: notice, icon: '⚠️' });
      else toast.error(error.message || 'No se pudo anular el ticket.', { id: notice });
      return false;
    } finally { processing.busy = false; if (active()) setIsProcessing(false); }
  };
  const verificarPendiente = async sale => {
    if (processing.busy) return;
    processing.busy = true; setIsProcessing(true);
    const token = scope.current;
    const active = () => resources.active && scope.current === token;
    try { await verifyPendingSaleTransaction(sale, user, active); if (active()) toast.success('Venta comprobada. No se volvió a cobrar.'); }
    catch (error) { if (active()) toast.error(error.message || 'No se pudo comprobar la venta.'); }
    finally { processing.busy = false; if (active()) setIsProcessing(false); }
  };
  const verificarAnulacion = async sale => {
    if (processing.busy || (activeBranchId !== 'global' && sale.branchId !== activeBranchId)) return false;
    if (confirmedVoid(sale.id)) return true;
    processing.busy = true; setIsProcessing(true);
    const token = scope.current;
    const active = () => resources.active && scope.current === token;
    try {
      await voidRecovery.verify({ saleId: sale.id }, { ...user, branchId: sale.branchId }, active);
      if (!active()) return false;
      setVoidResult({ id: sale.id, phase: 'confirmed' });
      invalidateReportScope(resources, user.businessId, sale.branchId);
      toast.success('Anulación comprobada. No se repitió la operación.'); return true;
    } catch (error) {
      if (!active()) return false;
      setVoidResult({ id: sale.id, phase: 'uncertain', message: error.message });
      toast.error('Todavía no se confirma la anulación. Puedes cerrar y verificar después.'); return false;
    } finally { processing.busy = false; if (active()) setIsProcessing(false); }
  };
  return { ...recent, isLoading: recent.isLoading, isProcessing, voidResult, confirmedVoid, formatDate,
    anularVentaConfirmada, verificarPendiente, verificarAnulacion, businessBranches };
};
