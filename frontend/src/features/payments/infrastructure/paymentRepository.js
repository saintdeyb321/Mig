import { db } from '../../../core/firebase/client.js';
import { createPaymentRepository } from './paymentQueryRepository.js';
import { callBackend } from '../../../core/firebase/callable.js';
import { compatiblePayments as readCompatiblePayments } from '../application/compatiblePayments.js';

const ledger = createPaymentRepository(db);
const compatiblePayments = (input, readLedger) => readCompatiblePayments(input, readLedger, data => callBackend('getLegacyContractPayments', data));
export const getPaymentsByContract = (businessId, contractId, branchId = 'global') =>
  compatiblePayments({ contractId, branchId }, () => ledger.getPaymentsByContract(businessId, contractId, branchId));
export const getPaymentsBySession = (businessId, sessionId, branchId) =>
  compatiblePayments({ sessionId, branchId }, () => ledger.getPaymentsBySession(businessId, sessionId, branchId));
export const getPaymentsInPeriod = (businessId, startDate, endDate, branchId = 'global') =>
  compatiblePayments({ startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString(), branchId },
    () => ledger.getPaymentsInPeriod(businessId, startDate, endDate, branchId));
export const getContractAuditDocuments = ledger.getContractAuditDocuments;
