import { confirmedWrite } from '../../../core/firebase/confirmedWrite.js';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';
import { mapDocuments } from '../../../core/firebase/documents';
import { updateProductTransaction, validateCatalogProduct } from './productWrites.js';

export const subscribeProducts = (businessId, onData, onError) => onSnapshot(
  query(collection(db, 'products'), where('businessId', '==', businessId)), { includeMetadataChanges: true },
  snapshot => onData(mapDocuments(snapshot), snapshot.metadata), onError,
);
export const subscribeCategories = (businessId, onData, onError) => onSnapshot(
  query(collection(db, 'categories'), where('businessId', '==', businessId)), { includeMetadataChanges: true },
  snapshot => onData(mapDocuments(snapshot), snapshot.metadata), onError,
);
export const createProduct = confirmedWrite(data => { validateCatalogProduct(data); return addDoc(collection(db, 'products'), data); });
export const updateProduct = confirmedWrite((id, data, expectedStock) => updateProductTransaction(db, id, data, expectedStock));
export const createCategory = confirmedWrite(data => addDoc(collection(db, 'categories'), data));
export const updateCategory = confirmedWrite((id, data) => updateDoc(doc(db, 'categories', id), data));
