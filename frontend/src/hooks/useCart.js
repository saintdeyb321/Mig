import { useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';

export const useCart = (products, activeBranchId) => {
  const [cart, setCart] = useState([]);

  const total = useMemo(() => {
    return cart.reduce((s, p) => s + p.price * p.qty, 0);
  }, [cart]);

  const addToCart = useCallback((product) => {
    const stockDisponible = product.rawStock?.[activeBranchId] ?? product.stock ?? 0;
    const TOAST_ID = 'cart-stock-error'; // 🚀 UX FIX: Candado Anti-spam

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

    const stockDisponible = product.rawStock?.[activeBranchId] ?? product.stock ?? 0;
    
    if (qty > stockDisponible) {
      toast.error(`Solo hay ${stockDisponible} uds. en esta sucursal`, { id: 'cart-stock-error' }); // 🚀 UX FIX
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