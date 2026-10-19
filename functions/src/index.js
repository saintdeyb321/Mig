import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { callable } from './core/callable.js';
import { createSalesHandlers } from './sales/handlers.js';
import { createCashSessionHandlers } from './cash-register/handlers.js';
import { createCashAutoCloser } from './cash-register/scheduled.js';
import { createAuditNotificationHandler } from './audit/events.js';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { createContractHandlers } from './contracts/handlers.js';
import { createLegacyPaymentReader } from './contracts/legacyReader.js';

initializeApp();
const database = getFirestore();
const sales = createSalesHandlers(database);
export const submitSale = callable(sales.submitSale);
export const voidSale = callable(sales.voidSale);
const cash = createCashSessionHandlers(database);
export const saveCashSession = callable(cash.saveCashSession);
export const openCashSession = callable(cash.openCashSession);
export const closeCashSession = callable(cash.closeCashSession);
export const forceCloseCashSession = callable(cash.forceCloseCashSession);
export const reserveOfflineCashSession = callable(cash.reserveOfflineCashSession);
export const previewCashSessionClose = callable(cash.previewCashSessionClose);
export const reconcileCashSession = callable(cash.reconcileCashSession);
export const autoCloseCashSessions = onSchedule({ schedule: 'every 15 minutes', timeZone: 'America/Lima', region: 'us-central1', maxInstances: 1 },
  createCashAutoCloser(database));
export const notifyAuditEvent = onDocumentCreated({ document: 'audit_events/{eventId}', region: 'us-central1', maxInstances: 10 },
  event => createAuditNotificationHandler(database)(event.params.eventId));
const contracts = createContractHandlers(database);
export const createContract = callable(contracts.createContract);
export const updateContract = callable(contracts.updateContract);
export const addContractPayment = callable(contracts.addContractPayment);
export const cancelContract = callable(contracts.cancelContract);
export const markContractDelivered = callable(contracts.markContractDelivered);
export const getLegacyContractPayments = callable(createLegacyPaymentReader(database));
