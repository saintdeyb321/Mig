import { getContractsInPeriod } from '../../contracts/infrastructure/contractRepository.js';
import { getPaymentsInPeriod, getContractAuditDocuments } from '../../payments/infrastructure/paymentRepository.js';

export async function processContractPaymentsForExport(businessId, startDate, endDate, branchesMap, { branchId = 'global', audit = true, maxRows = 10000 } = {}) {
  const payments = await getPaymentsInPeriod(businessId, startDate, endDate, branchId, { requireMigrated: true, maxRows });
  const [auditContracts, periodContracts] = await Promise.all([audit && payments.length ? getContractAuditDocuments(businessId, payments.map(payment => payment.sourceId)) : [],
    getContractsInPeriod(businessId, startDate, endDate, branchId, maxRows)]);
  const contracts = [...new Map([...auditContracts, ...periodContracts].map(contract => [contract.id, contract])).values()];
  return { payments, contracts };
}
