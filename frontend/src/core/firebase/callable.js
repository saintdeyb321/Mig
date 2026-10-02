import { httpsCallable } from 'firebase/functions';
import { functions } from './client.js';
import { SaleError } from '../../features/sales/domain/saleModel.js';

export async function callBackend(name, payload) {
  try { return (await httpsCallable(functions, name)(payload)).data; }
  catch (error) {
    throw new SaleError(error.details?.saleCode ?? String(error.code ?? '').replace(/^functions\//, ''), error.message);
  }
}
