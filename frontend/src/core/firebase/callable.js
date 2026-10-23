import { httpsCallable } from 'firebase/functions';
import { functions, appCheckReady } from './client.js';
import { reportDiagnostic } from '../errors/diagnostics.js';
import { SaleError } from '../../features/sales/domain/saleModel.js';

export async function callBackend(name, payload) {
  try { await appCheckReady; return (await httpsCallable(functions, name)(payload)).data; }
  catch (error) {
    const failure = new SaleError(error.details?.saleCode ?? String(error.code ?? '').replace(/^functions\//, ''), error.message);
    reportDiagnostic('functions', failure, ['tenant-restricted', 'outside-shift', 'permission-denied'].includes(failure.code) ? 'rejected' : 'pending');
    throw failure;
  }
}
