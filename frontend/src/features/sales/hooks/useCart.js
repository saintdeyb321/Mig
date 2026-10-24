import { useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getSafeStock } from '../domain/cartStock';
import { money } from '../domain/saleModel';

export const useCart = (products, activeBranchId) => {
  const [cart, setCart] = useState([]);

  const total = useMemo(() => {
    return money(cart.reduce((s, p) => s + money(money(p.price) * p.qty), 0));
  }, [cart]);

  const addToCart = useCallback((product) => {
    if (typeof product.price !== 'number' || !Number.isFinite(product.price) || product.price < 0
      || product.price > Number.MAX_SAFE_INTEGER / 100) {
      toast.error('El producto tiene un precio inválido.', { id: 'cart-price-error' });
      return;
    }
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
        : [...prev, { ...product, price: money(product.price), qty: 1 }];
    });
  }, [activeBranchId]);

  const updateQty = useCallback((id, qty) => {
    if (!Number.isSafeInteger(qty) || qty < 1) return;
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
