import { db } from '../../../core/firebase/client.js';
import { createPaymentRepository } from './paymentQueryRepository.js';
import { createSparkLegacyPaymentReader } from './sparkLegacyPayments.js';
const readLegacy = createSparkLegacyPaymentReader(db);
import { compatiblePayments as readCompatiblePayments } from '../application/compatiblePayments.js';

const ledger = createPaymentRepository(db);
const compatiblePayments = (businessId, input, readLedger, options = {}) => readCompatiblePayments(input, readLedger, async data => ({ payments: await readLegacy(businessId, data, options), nextCursor: null }), options);
export const getPaymentsByContract = (businessId, contractId, branchId = 'global') =>
  compatiblePayments(businessId, { contractId, branchId }, () => ledger.getPaymentsByContract(businessId, contractId, branchId));
export const getPaymentsBySession = (businessId, sessionId, branchId, { sparkOnly = false } = {}) => sparkOnly ? ledger.getPaymentsBySession(businessId, sessionId, branchId) :
  compatiblePayments(businessId, { sessionId, branchId }, () => ledger.getPaymentsBySession(businessId, sessionId, branchId));
export const getPaymentsInPeriod = (businessId, startDate, endDate, branchId = 'global', options = {}) =>
  compatiblePayments(businessId, { startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString(), branchId },
    () => ledger.getPaymentsInPeriod(businessId, startDate, endDate, branchId, options), options);
export const getContractAuditDocuments = ledger.getContractAuditDocuments;
