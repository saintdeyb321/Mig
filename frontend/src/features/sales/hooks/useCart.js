import { useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getSafeStock } from '../domain/cartStock';
import { money, saleAmountCents, SALE_LIMITS } from '../domain/saleModel';

export const useCart = (products, activeBranchId) => {
  const [cart, setCart] = useState([]);

  const total = useMemo(() => {
    return money(cart.reduce((s, p) => s + money(money(p.price) * p.qty), 0));
  }, [cart]);

  const addToCart = useCallback((product) => {
    try { saleAmountCents(product.price, 'El precio'); }
    catch (error) {
      toast.error(error.message, { id: 'cart-price-error' });
      return;
    }
    const stockDisponible = getSafeStock(product, activeBranchId);
    const TOAST_ID = 'cart-stock-error';

    setCart(prev => {
      const found = prev.find(p => p.id === product.id);
      if (found && found.qty >= SALE_LIMITS.maxQuantity) {
        toast.error('Máximo 1 000 unidades por producto.', { id: TOAST_ID });
        return prev;
      }

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
    if (qty > SALE_LIMITS.maxQuantity) { toast.error('Máximo 1 000 unidades por producto.', { id: 'cart-stock-error' }); return; }
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
