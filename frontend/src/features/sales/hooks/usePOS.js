import { invalidateReportScope } from '../../reports/application/reportResource.js';
import { isBranchOperational } from '../../branches/domain/branchPolicy';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { saveSaleTransaction, verifyPendingSaleTransaction, subscribeSaleAcknowledgement } from '../infrastructure/saleTransactions';
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
  const [showQrModal, setShowQrModal] = useState(false);
  const [lastSale, setLastSale] = useState(null);

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

  const { cart, setCart, total, addToCart, updateQty, removeFromCart: baseRemoveFromCart, clearCart, catalogChanges, acceptCatalogChange: acceptCartChange } = useCart(products, activeBranchId);
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
        setLastSale(previous => previous?.saleId === pendingSaleId ? { ...previous,
          receiptState: record.lastErrorCode === 'receipt-not-found' || !record.attempted ? 'unconfirmed' : 'uncertain', verificationMessage: record.lastError } : previous);
        return;
      }
      setLastSale(previous => previous?.saleId === pendingSaleId && hasVerifiedSaleReceipt({ status: 'ALREADY_APPLIED', saleId: pendingSaleId,
        syncedAt: record.syncedAt, stockVersions: record.stockVersions }, previous)
        ? { ...previous, isOffline: false, status: 'confirmed', receiptState: 'confirmed', verificationMessage: null, confirmedAt: record.syncedAt } : previous);
    }, () => {});
    return () => { active = false; stop(); };
  }, [pendingSaleId, user.uid, user.businessId, activeBranchId, resources]);
  const prevBranchId = useRef(activeBranchId);
  const removeFromCart = useCallback((id) => {
    baseRemoveFromCart(id);
    if (cart.length === 1 && cart[0].id === id) {
      setAmountPaid('');
      setSplitEfectivo('');
      setSplitYape('');
    }
  }, [cart, baseRemoveFromCart]);

  useEffect(() => {
    if (prevBranchId.current === activeBranchId || cart.length === 0) {
      prevBranchId.current = activeBranchId;
      return;
    }
    const itemsValidos = cart.filter(item => {
      const producto = catalogProducts.find(p => p.id === item.id);
      if (!producto) return false;
      const stockEnSucursal = getSafeStock(producto, activeBranchId);
      return item.qty <= stockEnSucursal;
    });

    if (itemsValidos.length < cart.length) {
      setCart(itemsValidos);
      toast.error('Algunos productos sin stock en esta sucursal fueron removidos del carrito.', { id: 'stock-branch-error', duration: 4000 });
    }
    prevBranchId.current = activeBranchId;
  }, [activeBranchId, cart, catalogProducts, setCart]);

  // Si se cierra la caja repentinamente, limpiamos todo.
  useEffect(() => {
    if (!currentSession && cart.length > 0) {
      clearCart();
      setPayment('efectivo');
      setAmountPaid('');
      setSplitEfectivo('');
      setSplitYape('');
    }
  }, [currentSession, cart.length, clearCart]);

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

    if (!currentSession || !currentSession.id || currentSession.userId !== user.uid || currentSession.needsForceClose) {
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
      sessionId: currentSession?.id || null,
      sync: false
    };
    if (payment === 'mixto') {
      sale.splitPayments = paymentValidation.splitPayments;
    }

    try {
      const result = await saveSaleTransaction(sale, cartBackup, products, user);

      sale = { ...result.sale, isOffline: result.isOffline, receiptState: result.receiptState, status: result.isOffline ? 'pending' : 'confirmed' };

      toast.dismiss(toastId);
      if (result.success) toast.success('Venta confirmada por Firestore', { id: 'sale-success' });
      else toast('Pendiente local: sin confirmar; consulta su recibo antes de volver a cobrar', { id: 'sale-pending', icon: '⚠️' });
      isSuccess = true;
      if (result.success) invalidateReportScope(resources, user.businessId, activeBranchId);

    } catch (err) {
      console.error(err);
      toast.dismiss(toastId);
      toast.error(err.message || 'Error al procesar la venta', { id: 'sale-error' });
    } finally {
      setIsProcessing(false);
      processingRef.current = false;

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
    try {
      await verifyPendingSaleTransaction(lastSale, user, () => resources.active && operationScope.current === token);
      toast.success('Recibo confirmado por el servidor. No se volvió a cobrar.');
      invalidateReportScope(resources, user.businessId, activeBranchId);
    } catch (error) { toast.error(error.message || 'El resultado sigue pendiente de revisión. No vuelvas a cobrar.'); }
    finally { processingRef.current = false; setIsProcessing(false); }
  };

  const clearLastSale = useCallback(() => setLastSale(null), []);

  return {
    products, filteredProducts, cart, payment, setPayment, amountPaid, setAmountPaid,
    splitEfectivo, setSplitEfectivo, splitYape, setSplitYape,
    search, setSearch, isProcessing, showQrModal, setShowQrModal, qrUrl,
    addToCart, updateQty, removeFromCart, total, isPaymentValid, paymentValidation,
    handleCheckoutClick, processSale, printReceipt, lastSale, clearLastSale, activeCategories,
    catalogChanges, catalogBlocked, acceptCatalogChange, verifyLastSale
  };
};
