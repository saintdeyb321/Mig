import { getPaymentsInPeriod, getContractAuditDocuments } from '../../payments/infrastructure/paymentRepository.js';
import { buildContractLedgerReport } from './contractLedgerReport.js';

export async function processContractPaymentsForExport(businessId, startDate, endDate, branchesMap) {
  const payments = await getPaymentsInPeriod(businessId, startDate, endDate);
  const contracts = await getContractAuditDocuments(businessId, payments.map(payment => payment.sourceId));
  return buildContractLedgerReport(payments, contracts, branchesMap);
}
