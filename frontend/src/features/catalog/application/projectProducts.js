export function projectProducts(products, pendingDeltas) {
  return products.map(product => {
    const stock = product.stock !== null && typeof product.stock === 'object'
      ? Object.values(product.stock).reduce((total, qty) => total + Math.max(0, Number(qty) || 0), 0)
      : Number(product.stock || 0);
    return { ...product, stock: Math.max(0, stock - (pendingDeltas[product.id] || 0)), rawStock: product.stock };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
