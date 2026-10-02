// src/hooks/usePOS.js
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import toast from 'react-hot-toast';
import { useGlobalData } from '../context/GlobalDataContext';
import { saveSaleTransaction } from '../services/saleService';
import { generateReceiptHTML } from '../utils/receiptTemplate';

export const getSafeStock = (product, branchId) => {
  if (!product) return 0;
  const stockObj = (typeof product.stock === 'object' && product.stock !== null) ? product.stock : 
                   (typeof product.rawStock === 'object' && product.rawStock !== null) ? product.rawStock : null;
  
  if (stockObj) {
    if (branchId === 'global' || !branchId) {
       return Object.values(stockObj).reduce((sum, val) => sum + (Math.max(0, Number(val) || 0)), 0);
    }
    return Number(stockObj[branchId] || 0);
  }
  return branchId === 'global' ? Number(product.stock || 0) : 0; 
};

export const useCart = (products, activeBranchId) => {
  const [cart, setCart] = useState([]);

  const total = useMemo(() => {
    return cart.reduce((s, p) => s + p.price * p.qty, 0);
  }, [cart]);

  const addToCart = useCallback((product) => {
    const stockDisponible = getSafeStock(product, activeBranchId);
    const TOAST_ID = 'cart-stock-error'; 

    setCart(prev => {
      const found = prev.find(p => p.id === product.id);

      if (stockDisponible <= 0) {
        toast.error(`${product.name} agotado en esta sucursal`, { id: TOAST_ID });
        return prev;
      }

      if (found && found.qty >= stockDisponible) {
        toast.error(`Solo hay ${stockDisponible} uds. disponibles en esta sucursal`, { id: TOAST_ID });
        return prev;
      }

      return found
        ? prev.map(p => p.id === product.id ? { ...p, qty: p.qty + 1 } : p)
        : [...prev, { ...product, qty: 1 }];
    });
  }, [activeBranchId]); 

  const updateQty = useCallback((id, qty) => {
    if (qty < 1) return;
    const product = products.find(p => p.id === id);
    if (!product) return;
    const stockDisponible = getSafeStock(product, activeBranchId);
    
    if (qty > stockDisponible) {
      toast.error(`Solo hay ${stockDisponible} uds. en esta sucursal`, { id: 'cart-stock-error' });
      return;
    }
    setCart(prev => prev.map(p => p.id === id ? { ...p, qty } : p));
  }, [products, activeBranchId]); 

  const removeFromCart = useCallback((id) => {
    setCart(prev => prev.filter(p => p.id !== id));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  return { cart, setCart, total, addToCart, updateQty, removeFromCart, clearCart };
};

export const usePOS = (user, currentSession) => {
  const { globalProducts, globalCategories, setGlobalProducts, setGlobalSales, activeBranchId, businessBranches } = useGlobalData();

  const [payment, setPayment] = useState('efectivo');
  const [amountPaid, setAmountPaid] = useState('');
  
  // 🚀 ARQUITECTURA LIMPIA: Los estados de pago mixto ahora viven en el Motor
  const [splitEfectivo, setSplitEfectivo] = useState(''); 
  const [splitYape, setSplitYape] = useState('');         

  const [search, setSearch] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [settings, setSettings] = useState({});

  const qrUrl = useMemo(() => {
    if (!businessBranches || !activeBranchId || activeBranchId === 'global') return null;
    const currentBranch = businessBranches.find(b => b.id === activeBranchId);
    return currentBranch?.yapeQrUrl || null;
  }, [businessBranches, activeBranchId]);

  const products = useMemo(() => (globalProducts || []).filter(p => p.status === 'activo'), [globalProducts]);
  const activeCategories = useMemo(() => (globalCategories || []).filter(c => c.status === 'activo'), [globalCategories]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p => p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q)));
  }, [products, search]);

  const { cart, setCart, total, addToCart, updateQty, removeFromCart: baseRemoveFromCart, clearCart } = useCart(products, activeBranchId);
  const prevBranchId = useRef(activeBranchId);

  // 🚀 INTERCEPTOR: Si el usuario quita el último item manual de la papelera, limpiamos el dinero.
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
      const producto = globalProducts.find(p => p.id === item.id);
      if (!producto) return false;
      const stockEnSucursal = getSafeStock(producto, activeBranchId);
      return item.qty <= stockEnSucursal;
    });

    if (itemsValidos.length < cart.length) {
      setCart(itemsValidos);
      toast.error('Algunos productos sin stock en esta sucursal fueron removidos del carrito.', { id: 'stock-branch-error', duration: 4000 });
    }
    prevBranchId.current = activeBranchId;
  }, [activeBranchId, cart, globalProducts, setCart]);

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

  useEffect(() => {
    let isMounted = true;
    if (!user?.businessId) return;

    const loadSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', user.businessId));
        if (snap.exists() && isMounted) setSettings(snap.data());
      } catch (e) {
        if (e.code !== 'permission-denied') console.error('Error cargando settings:', e);
      }
    };
    loadSettings();
    return () => { isMounted = false; };
  }, [user?.businessId]);

  const printReceipt = useCallback((saleData) => {
    const currentBranch = businessBranches?.find(b => b.id === activeBranchId) || null;
    const html = generateReceiptHTML(saleData, settings, currentBranch);
    
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
  }, [settings, businessBranches, activeBranchId]); 
  
  const processSale = useCallback(async () => {
    if (!user?.businessId || isProcessing) return;

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
      const producto = globalProducts.find(p => p.id === item.id);
      if (!producto) return true; 
      const stockEnSucursal = getSafeStock(producto, activeBranchId);
      return item.qty > stockEnSucursal;
    });

    if (itemsInvalidos) {
      toast.error('⛔ Hay productos en el carrito sin stock en esta sucursal.', { id: VAL_TOAST_ID });
      return;
    }

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

    const sale = {
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

    // 🚀 LECTURA DIRECTA DE LOS ESTADOS DEL HOOK
    if (payment === 'mixto') {
      sale.splitPayments = {
        efectivo: Number(splitEfectivo) || 0,
        yape: Number(splitYape) || 0
      };
    }

    try {
      const result = await saveSaleTransaction(sale, cartBackup, products, user);

      if (result.isOffline) {
        if (typeof setGlobalProducts === 'function') {
          setGlobalProducts(prev => prev.map(p => {
            const cartItem = cartBackup.find(item => item.id === p.id);
            return cartItem ? { ...p, stock: p.stock - cartItem.qty } : p;
          }));
        }
        if (typeof setGlobalSales === 'function') {
          setGlobalSales(prev => {
            const newHistory = [{ ...sale, id: localId, isOffline: true }, ...prev];
            return newHistory.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50);
          });
        }
      }

      toast.dismiss(toastId);
      toast.success(result.isOffline ? 'Venta offline guardada' : 'Venta registrada', { id: 'sale-success', icon: result.isOffline ? '🏠' : '✅' });
      isSuccess = true;

    } catch (err) {
      console.error(err);
      toast.dismiss(toastId);
      toast.error('Error al procesar la venta', { id: 'sale-error' });
    } finally {
      setIsProcessing(false);

      if (isSuccess) {
        setLastSale(sale);
        clearCart();
        setAmountPaid('');
        setSplitEfectivo(''); // 🚀 LIMPIEZA NATIVA PERFECTA
        setSplitYape('');     // 🚀 LIMPIEZA NATIVA PERFECTA
        setSearch('');
      } else {
        setCart(cartBackup); 
      }
    }
  }, [user, cart, total, payment, amountPaid, splitEfectivo, splitYape, products, setGlobalProducts, setGlobalSales, 
    isProcessing, clearCart, setCart, activeBranchId, globalProducts, businessBranches, currentSession]); 

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
    splitEfectivo, setSplitEfectivo, splitYape, setSplitYape, // 🚀 EXPORTADOS
    search, setSearch, isProcessing, showQrModal, setShowQrModal, qrUrl,
    addToCart, updateQty, removeFromCart, total, isPaymentValid,
    handleCheckoutClick, processSale, printReceipt, lastSale, clearLastSale, activeCategories
  };
};