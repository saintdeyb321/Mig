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
