import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { callable } from './core/callable.js';
import { createSalesHandlers } from './sales/handlers.js';
import { createCashSessionHandler } from './cash-register/handlers.js';

initializeApp();
const database = getFirestore();
const sales = createSalesHandlers(database);
export const submitSale = callable(sales.submitSale);
export const voidSale = callable(sales.voidSale);
export const saveCashSession = callable(createCashSessionHandler(database));
