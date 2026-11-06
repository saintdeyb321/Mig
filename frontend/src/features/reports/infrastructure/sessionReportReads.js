import { getSalesInPeriod } from '../../sales/infrastructure/salesRepository.js';
import { getContractsInPeriod } from '../../contracts/infrastructure/contractRepository.js';
import { getPaymentsInPeriod, getContractAuditDocuments } from '../../payments/infrastructure/paymentRepository.js';
import { createSessionReportReads } from '../application/sessionReportReads.js';
import { db } from '../../../core/firebase/client.js';
import { createPosVoidReader } from '../../sales/infrastructure/posVoidQueryRepository.js';
export const sessionReportReads = createSessionReportReads({ getSalesInPeriod, getContractsInPeriod, getPaymentsInPeriod,
  getContractAuditDocuments, readVoidsInPeriod: createPosVoidReader(db).inPeriod });
