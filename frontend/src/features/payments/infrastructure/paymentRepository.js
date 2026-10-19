import { db } from '../../../core/firebase/client.js';
import { createPaymentRepository } from './paymentQueryRepository.js';
import { callBackend } from '../../../core/firebase/callable.js';

const ledger = createPaymentRepository(db);
async function compatiblePayments(input, readLedger) {
  const fallback = [];
  let cursor = null;
  do {
    const page = await callBackend('getLegacyContractPayments', { ...input, cursor });
    fallback.push(...page.payments); cursor = page.nextCursor;
    if (page.manualReview) throw new Error('Hay pagos históricos pendientes de revisión administrativa; ejecuta la migración antes de cerrar caja o emitir el reporte.');
  } while (cursor);
  const payments = await readLedger();
  const migrated = new Set(payments.map(payment => payment.sourceId));
  return [...payments, ...fallback.filter(payment => !migrated.has(payment.sourceId))];
}
export const getPaymentsByContract = (businessId, contractId, branchId = 'global') =>
  compatiblePayments({ contractId, branchId }, () => ledger.getPaymentsByContract(businessId, contractId, branchId));
export const getPaymentsBySession = (businessId, sessionId, branchId) =>
  compatiblePayments({ sessionId, branchId }, () => ledger.getPaymentsBySession(businessId, sessionId, branchId));
export const getPaymentsInPeriod = (businessId, startDate, endDate, branchId = 'global') =>
  compatiblePayments({ startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString(), branchId },
    () => ledger.getPaymentsInPeriod(businessId, startDate, endDate, branchId));
export const getContractAuditDocuments = ledger.getContractAuditDocuments;
