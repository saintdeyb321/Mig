import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { saveSaleTransaction } from '../infrastructure/saleTransactions';
import { useCart } from './useCart';
import { getSafeStock } from '../domain/cartStock';
import { useCatalogData } from '../../catalog/context/CatalogContext';
import { useTenantData } from '../../branches/context/TenantContext';
import { generateReceiptHTML } from '../../../utils/receiptTemplate';

export const usePOS = (user, currentSession) => {
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

  const { cart, setCart, total, addToCart, updateQty, removeFromCart: baseRemoveFromCart, clearCart } = useCart(products, activeBranchId);
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

  const isPaymentValid = useMemo(() => {
    if (payment === 'mixto') {
      return Math.abs((Number(splitEfectivo) + Number(splitYape)) - total) < 0.01 && total > 0;
    }
    return payment === 'yape' || (payment === 'efectivo' && Number(amountPaid) >= total);
  }, [payment, amountPaid, splitEfectivo, splitYape, total]);


  const printReceipt = useCallback((saleData) => {
    const currentBranch = businessBranches?.find(b => b.id === activeBranchId) || null;
    const html = generateReceiptHTML(saleData, tenantSettings || {}, currentBranch);

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '-10000px';
    iframe.style.bottom = '-10000px';
    document.body.appendChild(iframe);

    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(html);
    iframe.contentWindow.document.close();

    iframe.onload = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } finally {
        setTimeout(() => {
          if (iframe && iframe.parentNode) iframe.remove();
        }, 2000);
      }
    };
  }, [tenantSettings, businessBranches, activeBranchId]);

  const processSale = useCallback(async () => {
    if (!user?.businessId || processingRef.current) return;

    const VAL_TOAST_ID = 'pos-validation-error';

    if (activeBranchId === 'global') {
      toast.error('⛔ Selecciona una sede física para poder vender.', { id: VAL_TOAST_ID });
      return;
    }

    const currentBranch = businessBranches?.find(b => b.id === activeBranchId);
    if (currentBranch && currentBranch.status?.toLowerCase() === 'inactivo') {
      toast.error('⛔ Venta bloqueada. Sucursal inactiva.', { id: VAL_TOAST_ID });
      return;
    }

    if (!currentSession || !currentSession.id) {
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

    let finalAmountPaid = total;
    let finalChange = 0;

    if (payment === 'efectivo') {
      finalAmountPaid = Number(amountPaid);
      finalChange = Number(amountPaid) - total;
    } else if (payment === 'yape' || payment === 'mixto') {
      finalAmountPaid = total;
      finalChange = 0;
    }

    let sale = {
      localId,
      items: cartBackup,
      total,
      payment,
      amountPaid: finalAmountPaid,
      change: finalChange,
      createdAt: new Date(),
      businessId: user.businessId,
      branchId: activeBranchId,
      userId: user.uid,
      cashierName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      sessionId: currentSession?.id || null,
      sync: false
    };
    if (payment === 'mixto') {
      sale.splitPayments = {
        efectivo: Number(splitEfectivo) || 0,
        yape: Number(splitYape) || 0
      };
    }

    try {
      const result = await saveSaleTransaction(sale, cartBackup, products, user);

      sale = result.sale;

      toast.dismiss(toastId);
      toast.success(result.isOffline ? 'Venta offline guardada' : 'Venta registrada', { id: 'sale-success', icon: result.isOffline ? '🏠' : '✅' });
      isSuccess = true;

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
  }, [user, cart, total, payment, amountPaid, splitEfectivo, splitYape, products,
    clearCart, setCart, activeBranchId, catalogProducts, businessBranches, currentSession]);

  const handleCheckoutClick = useCallback(() => {
    if (cart.length === 0) {
      toast.error('🛒 El carrito está vacío', { id: 'pos-validation-error' });
      return;
    }
    if (payment === 'yape' || (payment === 'mixto' && Number(splitYape) > 0)) {
      setShowQrModal(true);
    } else {
      processSale();
    }
  }, [payment, processSale, cart.length, splitYape]);

  const clearLastSale = useCallback(() => setLastSale(null), []);

  return {
    products, filteredProducts, cart, payment, setPayment, amountPaid, setAmountPaid,
    splitEfectivo, setSplitEfectivo, splitYape, setSplitYape,
    search, setSearch, isProcessing, showQrModal, setShowQrModal, qrUrl,
    addToCart, updateQty, removeFromCart, total, isPaymentValid,
    handleCheckoutClick, processSale, printReceipt, lastSale, clearLastSale, activeCategories
  };
};
