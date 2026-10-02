import { db } from '../../../core/firebase/client.js';
import { createPaymentRepository } from './paymentQueryRepository.js';

export const { getPaymentsByContract, getPaymentsBySession, getPaymentsInPeriod, getContractAuditDocuments } = createPaymentRepository(db);
