import { invalidateReportScope } from '../../reports/application/reportResource.js';
import { isBranchOperational } from '../../branches/domain/branchPolicy';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { saveSaleTransaction, saveSaleDraftTransaction, verifyPendingSaleTransaction, subscribeSaleAcknowledgement } from '../infrastructure/saleTransactions';
import { useSessionResources } from '../../../core/session/sessionResourceHooks.js';
import { useCart } from './useCart';
import { getSafeStock } from '../domain/cartStock';
import { useCatalogData } from '../../catalog/context/CatalogContext';
import { useTenantData } from '../../branches/context/TenantContext';
import { generateReceiptHTML } from '../../../utils/receiptTemplate';
import { usePrintJobs } from '../../../shared/printing/usePrintJobs';
import { runtimeCapabilities } from '../../../config/runtimeCapabilities.js';
import { checkoutBlockReason } from '../domain/checkoutPolicy.js';
import { validatePOSPayment } from '../domain/saleModel.js';
import { hasVerifiedSaleReceipt } from '../domain/queueState.js';

export const usePOS = (user, currentSession) => {
  const resources = useSessionResources();
  const runPrint = usePrintJobs();
  const { products: catalogProducts, categories: catalogCategories } = useCatalogData();
  const { activeBranchId, businessBranches, settings: tenantSettings } = useTenantData();

  const [payment, setPayment] = useState('efectivo');
  const [amountPaid, setAmountPaid] = useState('');
  const [splitEfectivo, setSplitEfectivo] = useState('');
  const [splitYape, setSplitYape] = useState('');

  const [search, setSearch] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [showQrModal, setShowQrModal] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  const qrUrl = useMemo(() => {
    if (!businessBranches || !activeBranchId || activeBranchId === 'global') return null;
    const currentBranch = businessBranches.find(b => b.id === activeBranchId);
    return currentBranch?.yapeQrUrl || null;
  }, [businessBranches, activeBranchId]);

  const products = useMemo(() => (catalogProducts || []).filter(p => p.status === 'activo'), [catalogProducts]);
  const activeCategories = useMemo(() => (catalogCategories || []).filter(c => c.status === 'activo'), [catalogCategories]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p => p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q)));
  }, [products, search]);

  const { cart, setCart, total, addToCart: baseAddToCart, updateQty: baseUpdateQty, removeFromCart: baseRemoveFromCart, clearCart, catalogChanges, acceptCatalogChange: acceptCartChange } = useCart(products, activeBranchId);
  const addToCart = useCallback(product => { if (!processingRef.current) baseAddToCart(product); }, [baseAddToCart]);
  const updateQty = useCallback((id, qty) => { if (!processingRef.current) baseUpdateQty(id, qty); }, [baseUpdateQty]);
  const acceptCatalogChange = id => {
    if (processingRef.current) return;
    acceptCartChange(id); setAmountPaid(''); setSplitEfectivo(''); setSplitYape(''); setShowQrModal(false);
  };
  const operationScope = useRef(0);
  useEffect(() => { const ref = operationScope; return () => { ref.current++; }; }, [user.uid, user.businessId, activeBranchId]);
  const catalogBlocked = Object.keys(catalogChanges).length > 0;
  const paymentTotal = useRef(total);
  useEffect(() => {
    if (paymentTotal.current === total) return;
    paymentTotal.current = total;
    setAmountPaid(''); setSplitEfectivo(''); setSplitYape(''); setShowQrModal(false);
  }, [total]);
  const pendingSaleId = lastSale?.isOffline ? lastSale.saleId : null;
  useEffect(() => {
    if (!pendingSaleId) return;
    let active = true;
    const stop = subscribeSaleAcknowledgement(pendingSaleId, record => {
      if (!active || !resources.active || record?.userId !== user.uid || record.businessId !== user.businessId || record.branchId !== activeBranchId) return;
      if (record.status !== 'synced' || record.financialAck !== true) {
        setLastSale(previous => previous?.saleId === pendingSaleId ? { ...previous, ...(record.verifiedPayload ?? {}),
          financialState: record.financialState ?? previous.financialState,
          receiptState: record.lastErrorCode === 'receipt-not-found' || !record.attempted ? 'unconfirmed' : 'uncertain', verificationMessage: record.lastError } : previous);
        return;
      }
      setLastSale(previous => previous?.saleId === pendingSaleId && hasVerifiedSaleReceipt({ status: 'ALREADY_APPLIED', saleId: pendingSaleId,
        syncedAt: record.syncedAt, stockVersions: record.stockVersions }, previous)
        ? { ...previous, ...(record.verifiedPayload ?? {}), isOffline: false, financialState: 'confirmed', status: 'confirmed', receiptState: 'confirmed', verificationMessage: null, confirmedAt: record.syncedAt } : previous);
    }, () => {});
    return () => { active = false; stop(); };
  }, [pendingSaleId, user.uid, user.businessId, activeBranchId, resources]);
  const prevBranchId = useRef(activeBranchId);
  const removeFromCart = useCallback((id) => {
    if (processingRef.current) return;
    baseRemoveFromCart(id);
    if (cart.length === 1 && cart[0].id === id) {
      setAmountPaid('');
      setSplitEfectivo('');
      setSplitYape('');
    }
  }, [cart, baseRemoveFromCart]);

  useEffect(() => {
    if (prevBranchId.current === activeBranchId) return;
    prevBranchId.current = activeBranchId;
    setLastSale(null); setAmountPaid(''); setSplitEfectivo(''); setSplitYape(''); setShowQrModal(false);
  }, [activeBranchId]);

  // A closed cash blocks charging; the unsent cart remains available for review.

  const paymentValidation = useMemo(() => validatePOSPayment({ payment, total, amountPaid, splitEfectivo, splitYape }),
    [payment, amountPaid, splitEfectivo, splitYape, total]);
  const isPaymentValid = paymentValidation.valid;


  const printReceipt = useCallback((saleData) => {
    const currentBranch = businessBranches?.find(b => b.id === activeBranchId) || null;
    const html = generateReceiptHTML(saleData, tenantSettings || {}, currentBranch);

    return runPrint(job => job.print(html)).catch(error => {
      if (error.name !== 'AbortError') toast.error(error.message || 'No se pudo imprimir el comprobante.');
    });
  }, [tenantSettings, businessBranches, activeBranchId, runPrint]);

  const processSale = useCallback(async () => {
    if (!runtimeCapabilities.saleOnline) { toast.error('Confirmación de ventas pendiente de SPARK-4. No se ha creado ninguna venta.'); return; }
    if (!user?.businessId || processingRef.current) return;
    const blocked = checkoutBlockReason(cart);
    if (blocked) { toast.error(blocked); return; }
    if (catalogBlocked) { toast.error('Cambió el catálogo. Revisa los productos señalados antes de cobrar.'); return; }
    if (!paymentValidation.valid) { toast.error(paymentValidation.error); return; }

    const VAL_TOAST_ID = 'pos-validation-error';

    if (activeBranchId === 'global') {
      toast.error('⛔ Selecciona una sede física para poder vender.', { id: VAL_TOAST_ID });
      return;
    }

    const currentBranch = businessBranches?.find(b => b.id === activeBranchId);
    if (!isBranchOperational(currentBranch)) {
      toast.error('⛔ Venta bloqueada. Sucursal inactiva.', { id: VAL_TOAST_ID });
      return;
    }

    if (navigator.onLine && (!currentSession || !currentSession.id || currentSession.userId !== user.uid || currentSession.needsForceClose)) {
      toast.error('⛔ Venta bloqueada. Debes abrir tu caja.', { id: VAL_TOAST_ID });
      setShowQrModal(false);
      return;
    }

    const itemsInvalidos = cart.some(item => {
      const producto = catalogProducts.find(p => p.id === item.id);
      if (!producto) return true;
      const stockEnSucursal = getSafeStock(producto, activeBranchId);
      return item.qty > stockEnSucursal;
    });

    if (itemsInvalidos) {
      toast.error('⛔ Hay productos en el carrito sin stock en esta sucursal.', { id: VAL_TOAST_ID });
      return;
    }

    processingRef.current = true;
    setIsProcessing(true);
    const toastId = toast.loading('Procesando cobro...');
    setShowQrModal(false);

    const cartBackup = [...cart];
    const localId = crypto.randomUUID();
    const token = operationScope.current;
    const active = () => resources.active && operationScope.current === token;
    let isSuccess = false;

    let sale = {
      localId,
      items: cartBackup,
      total,
      payment,
      amountPaid: paymentValidation.amountPaid,
      change: paymentValidation.change,
      createdAt: new Date(),
      businessId: user.businessId,
      branchId: activeBranchId,
      userId: user.uid,
      cashierName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      sessionId: currentSession?.userId === user.uid ? currentSession.id : `draft-${localId}`,
      sync: false
    };
    if (payment === 'mixto') {
      sale.splitPayments = paymentValidation.splitPayments;
    }

    try {
      let result;
      if (!navigator.onLine) result = await saveSaleDraftTransaction(sale, cartBackup, products, user);
      else {
        try { result = await saveSaleTransaction(sale, cartBackup, products, user); }
        catch (error) {
          // This guard rejects before the queue/write callback. It is safe to save an unsent draft.
          if (error.code === 'access-unverified' && !navigator.onLine) result = await saveSaleDraftTransaction(sale, cartBackup, products, user);
          else throw error;
        }
      }
      if (!active()) { toast.dismiss(toastId); return; }

      sale = { ...result.sale, isOffline: result.isOffline, financialState: result.financialState, receiptState: result.receiptState, status: result.isOffline ? 'pending' : 'confirmed' };

      toast.dismiss(toastId);
      if (result.success) toast.success('Venta confirmada por Firestore', { id: 'sale-success' });
      else if (result.financialState === 'draft_offline') toast.success('Ticket guardado en este dispositivo, sin cobrar.', { id: 'sale-draft' });
      else toast('Comprobando la venta. No vuelvas a cobrar este ticket.', { id: 'sale-pending', icon: '⚠️' });
      isSuccess = true;
      if (result.success) invalidateReportScope(resources, user.businessId, activeBranchId);

    } catch (err) {
      console.error(err);
      toast.dismiss(toastId);
      if (active()) toast.error(err.message || 'Error al procesar la venta', { id: 'sale-error' });
    } finally {
      processingRef.current = false;
      if (mounted.current) setIsProcessing(false);
      if (active()) {
        if (isSuccess) {
          setLastSale(sale);
          clearCart();
          setAmountPaid('');
          setSplitEfectivo('');
          setSplitYape('');
          setSearch('');
        } else {
          setCart(cartBackup);
        }
      }
    }
  }, [user, cart, total, payment, paymentValidation, products,
    clearCart, setCart, activeBranchId, catalogProducts, businessBranches, currentSession, resources, catalogBlocked]);

  const handleCheckoutClick = useCallback(() => {
    const blocked = checkoutBlockReason(cart);
    if (blocked) { toast.error(blocked); return; }
    if (catalogBlocked) { toast.error('Revisa los cambios del catálogo antes de cobrar.'); return; }
    if (!paymentValidation.valid) { toast.error(paymentValidation.error); return; }
    if (!runtimeCapabilities.saleOnline) { toast.error('Confirmación de ventas pendiente de SPARK-4.'); return; }
    if (cart.length === 0) {
      toast.error('🛒 El carrito está vacío', { id: 'pos-validation-error' });
      return;
    }
    if (!navigator.onLine) { processSale(); return; }
    if (payment === 'yape' || (payment === 'mixto' && paymentValidation.splitPayments.yape > 0)) {
      setShowQrModal(true);
    } else {
      processSale();
    }
  }, [payment, processSale, cart, paymentValidation, catalogBlocked]);

  const verifyLastSale = async () => {
    if (!lastSale?.isOffline || processingRef.current || lastSale.branchId !== activeBranchId || lastSale.userId !== user.uid) return;
    processingRef.current = true; setIsProcessing(true);
    const token = operationScope.current;
    const active = () => resources.active && operationScope.current === token;
    try {
      await verifyPendingSaleTransaction(lastSale, user, active);
      if (!active()) return;
      toast.success('Recibo confirmado por el servidor. No se volvió a cobrar.');
      invalidateReportScope(resources, user.businessId, activeBranchId);
    } catch (error) { if (active()) toast.error(error.message || 'El resultado sigue pendiente de revisión. No vuelvas a cobrar.'); }
    finally { processingRef.current = false; if (mounted.current) setIsProcessing(false); }
  };

  const clearLastSale = useCallback(() => setLastSale(null), []);
  const acceptReviewedSale = result => {
    if (!result.sale || result.sale.userId !== user.uid || result.sale.businessId !== user.businessId || result.sale.branchId !== activeBranchId) return;
    setLastSale({ ...result.sale, isOffline: result.isOffline, financialState: result.financialState,
      status: result.success ? 'confirmed' : result.rejected ? 'failed' : 'pending' });
    if (result.success) invalidateReportScope(resources, user.businessId, activeBranchId);
  };

  return {
    products, filteredProducts, cart, payment, setPayment, amountPaid, setAmountPaid,
    splitEfectivo, setSplitEfectivo, splitYape, setSplitYape,
    search, setSearch, isProcessing, showQrModal, setShowQrModal, qrUrl,
    addToCart, updateQty, removeFromCart, total, isPaymentValid, paymentValidation,
    handleCheckoutClick, processSale, printReceipt, lastSale, clearLastSale, activeCategories,
    catalogChanges, catalogBlocked, acceptCatalogChange, verifyLastSale, isOnline, acceptReviewedSale
  };
};
