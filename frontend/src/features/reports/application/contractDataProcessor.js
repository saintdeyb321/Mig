import { getPaymentsInPeriod, getContractAuditDocuments } from '../../payments/infrastructure/paymentRepository.js';

export async function processContractPaymentsForExport(businessId, startDate, endDate, branchesMap, { branchId = 'global', audit = true, maxRows = 10000 } = {}) {
  const payments = await getPaymentsInPeriod(businessId, startDate, endDate, branchId, { requireMigrated: true, maxRows });
  const contracts = audit && payments.length ? await getContractAuditDocuments(businessId, payments.map(payment => payment.sourceId)) : [];
  return { payments, contracts };
}
