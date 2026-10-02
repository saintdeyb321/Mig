import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { callable } from './core/callable.js';
import { createSalesHandlers } from './sales/handlers.js';
import { createCashSessionHandler } from './cash-register/handlers.js';
import { createContractHandlers } from './contracts/handlers.js';

initializeApp();
const database = getFirestore();
const sales = createSalesHandlers(database);
export const submitSale = callable(sales.submitSale);
export const voidSale = callable(sales.voidSale);
export const saveCashSession = callable(createCashSessionHandler(database));
const contracts = createContractHandlers(database);
export const createContract = callable(contracts.createContract);
export const updateContract = callable(contracts.updateContract);
export const addContractPayment = callable(contracts.addContractPayment);
export const cancelContract = callable(contracts.cancelContract);
export const markContractDelivered = callable(contracts.markContractDelivered);
