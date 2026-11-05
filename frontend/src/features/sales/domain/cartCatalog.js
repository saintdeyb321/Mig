import { SALE_LIMITS } from './saleModel.js';
import { getSafeStock } from './cartStock.js';

export const canAddDistinctProduct = (cart, id) => cart.some(item => item.id === id) || cart.length < SALE_LIMITS.maxDistinctProducts;

export function cartCatalogChanges(cart, products, branchId) {
  const catalog = new Map(products.map(product => [product.id, product]));
  return Object.fromEntries(cart.flatMap(item => {
    const current = catalog.get(item.id);
    if (!current || (current.status ?? 'activo') !== 'activo') return [[item.id, { type: 'unavailable' }]];
    if (item.price !== current.price || (item.cost ?? 0) !== (current.cost ?? 0)
      || item.name !== current.name || (item.category ?? '') !== (current.category ?? '')) {
      return [[item.id, { type: 'changed', previousPrice: item.price, currentPrice: current.price, current }]];
    }
    if (item.qty > getSafeStock(current, branchId)) return [[item.id, { type: 'stock', stock: getSafeStock(current, branchId) }]];
    return [];
  }));
}

export function acceptCartCatalogChange(cart, id, products) {
  const current = products.find(product => product.id === id && (product.status ?? 'activo') === 'activo');
  return current ? cart.map(item => item.id === id ? { ...current, qty: item.qty } : item) : cart;
}
