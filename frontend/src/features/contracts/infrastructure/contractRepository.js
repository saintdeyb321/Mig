import { db } from '../../../core/firebase/client';
import { callBackend } from '../../../core/firebase/callable';
import { createContractQueryRepository } from './contractQueryRepository.js';

export { ACTIVE_CONTRACT_STATUSES, CLOSED_CONTRACT_STATUSES, ACTIVE_CONTRACT_LIMIT, CONTRACT_HISTORY_PAGE_SIZE } from './contractQueryRepository.js';
export const { subscribeActiveContracts, getContractHistoryPage } = createContractQueryRepository(db);
export const createContractDocument = payload => callBackend('createContract', payload);
export const updateContractDocument = (contractId, changes) => callBackend('updateContract', { contractId, changes });
export const addContractPayment = payload => callBackend('addContractPayment', payload);
export const cancelContractDocument = payload => callBackend('cancelContract', payload);
export const markContractDelivered = contractId => callBackend('markContractDelivered', { contractId });
