import { db } from '../../../core/firebase/client.js';
import { createPaymentRepository } from './paymentQueryRepository.js';
import { callBackend } from '../../../core/firebase/callable.js';
import { compatiblePayments as readCompatiblePayments } from '../application/compatiblePayments.js';

const ledger = createPaymentRepository(db);
const compatiblePayments = (input, readLedger, options) => readCompatiblePayments(input, readLedger, data => callBackend('getLegacyContractPayments', data), options);
export const getPaymentsByContract = (businessId, contractId, branchId = 'global') =>
  compatiblePayments({ contractId, branchId }, () => ledger.getPaymentsByContract(businessId, contractId, branchId));
export const getPaymentsBySession = (businessId, sessionId, branchId) =>
  compatiblePayments({ sessionId, branchId }, () => ledger.getPaymentsBySession(businessId, sessionId, branchId));
export const getPaymentsInPeriod = (businessId, startDate, endDate, branchId = 'global', options = {}) =>
  compatiblePayments({ startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString(), branchId },
    () => ledger.getPaymentsInPeriod(businessId, startDate, endDate, branchId, options), options);
export const getContractAuditDocuments = ledger.getContractAuditDocuments;
