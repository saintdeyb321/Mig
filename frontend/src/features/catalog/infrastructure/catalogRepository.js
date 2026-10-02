import { collection, query, where, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';
import { mapDocuments } from '../../../core/firebase/documents';

export const subscribeProducts = (businessId, onData, onError) => onSnapshot(
  query(collection(db, 'products'), where('businessId', '==', businessId)),
  snapshot => onData(mapDocuments(snapshot)), onError,
);
export const subscribeCategories = (businessId, onData, onError) => onSnapshot(
  query(collection(db, 'categories'), where('businessId', '==', businessId)),
  snapshot => onData(mapDocuments(snapshot)), onError,
);
export const createProduct = data => addDoc(collection(db, 'products'), data);
export const updateProduct = (id, data) => updateDoc(doc(db, 'products', id), data);
export const createCategory = data => addDoc(collection(db, 'categories'), data);
export const updateCategory = (id, data) => updateDoc(doc(db, 'categories', id), data);
