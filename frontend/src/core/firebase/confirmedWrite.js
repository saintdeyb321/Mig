import { auth } from './client.js';
import { assertConfirmedWrite } from '../session/operationAccess.js';

// Runtime boundary; injected domain repositories and their financial protocol stay intact.
export const confirmedWrite = (work, options = {}) => (...args) => {
  assertConfirmedWrite({ uid: auth.currentUser?.uid, online: navigator.onLine, ...options });
  return work(...args);
};
