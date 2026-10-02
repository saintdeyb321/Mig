export function projectProducts(products, pendingDeltas = {}) {
  return products.map(product => {
    const remoteStock = product.stock && typeof product.stock === 'object' ? product.stock : {};
    const rawStock = Object.fromEntries(Object.entries(remoteStock).map(([branchId, qty]) =>
      [branchId, Math.max(0, (Number.isSafeInteger(qty) && qty >= 0 ? qty : 0) - (pendingDeltas[product.id]?.[branchId] ?? 0))]));
    const stock = Object.values(rawStock).reduce((sum, qty) => sum + qty, 0);
    return { ...product, stock, rawStock, remoteStock };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
