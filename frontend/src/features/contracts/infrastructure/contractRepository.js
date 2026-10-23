import { createContractPeriodReader } from './contractPeriodRepository.js';
import { db, auth } from '../../../core/firebase/client';
import { createSparkContractsRepository } from './sparkContractsRepository.js';
const spark = createSparkContractsRepository(db, { currentUser: () => auth.currentUser });
import { createContractQueryRepository } from './contractQueryRepository.js';

export { ACTIVE_CONTRACT_STATUSES, CLOSED_CONTRACT_STATUSES, ACTIVE_CONTRACT_LIMIT, CONTRACT_HISTORY_PAGE_SIZE } from './contractQueryRepository.js';
export const { subscribeActiveContracts, getContractHistoryPage } = createContractQueryRepository(db);
export const createContractDocument = payload => spark.create(payload);
export const updateContractDocument = (contractId, changes) => spark.update(contractId, changes);
export const addContractPayment = payload => spark.addPayment(payload);
export const cancelContractDocument = payload => spark.cancel(payload);
export const markContractDelivered = contractId => spark.deliver(contractId);

export const getContractsInPeriod = createContractPeriodReader(db);
