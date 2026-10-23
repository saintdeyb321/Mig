import { collection, query, where, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';
import { mapDocuments } from '../../../core/firebase/documents';
import { updateProductTransaction, validateCatalogProduct } from './productWrites.js';

export const subscribeProducts = (businessId, onData, onError) => onSnapshot(
  query(collection(db, 'products'), where('businessId', '==', businessId)),
  snapshot => onData(mapDocuments(snapshot)), onError,
);
export const subscribeCategories = (businessId, onData, onError) => onSnapshot(
  query(collection(db, 'categories'), where('businessId', '==', businessId)),
  snapshot => onData(mapDocuments(snapshot)), onError,
);
export const createProduct = data => { validateCatalogProduct(data); return addDoc(collection(db, 'products'), data); };
export const updateProduct = (id, data, expectedStock) => updateProductTransaction(db, id, data, expectedStock);
export const createCategory = data => addDoc(collection(db, 'categories'), data);
export const updateCategory = (id, data) => updateDoc(doc(db, 'categories', id), data);
