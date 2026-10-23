import * as firestore from 'firebase/firestore';

export const MAX_STOCK_BRANCHES = 6;
export function validateCatalogProduct(data) {
  const stock = data.stock;
  if (!stock || typeof stock !== 'object' || Array.isArray(stock) || !Object.keys(stock).length || Object.keys(stock).length > MAX_STOCK_BRANCHES) {
    throw new Error('El stock Spark admite de 1 a 6 sedes por producto. Los datos anteriores se conservan.');
  }
  if (Object.values(stock).some(value => !Number.isSafeInteger(value) || value < 0 || value > 1000000000)) throw new Error('El stock debe ser un entero no negativo.');
  if (!Number.isFinite(data.price) || data.price < 0 || data.price > 1000000000 || Math.round(data.price * 100) / 100 !== data.price) throw new Error('El precio debe ser un importe válido con máximo dos decimales.');
}

export async function updateProductTransaction(database, id, data, expectedStock, { sdk = firestore } = {}) {
  validateCatalogProduct(data);
  return sdk.runTransaction(database, async tx => {
    const ref = sdk.doc(database, 'products', id), current = await tx.get(ref);
    if (!current.exists()) throw new Error('El producto ya no existe.');
    const stock = current.data().stock;
    const matches = typeof stock === 'object' && stock !== null && typeof expectedStock === 'object' && expectedStock !== null
      ? Object.keys(stock).length === Object.keys(expectedStock).length && Object.keys(stock).every(key => stock[key] === expectedStock[key])
      : stock === expectedStock;
    if (!matches) throw new Error('El stock cambió mientras editabas. Recarga el producto y vuelve a aplicar el ajuste.');
    tx.update(ref, data);
  });
}
