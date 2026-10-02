import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { SaleError } from '../sales/domain/saleModel.js';

export function callable(handler) {
  return onCall({ region: 'us-central1', maxInstances: 10 }, async request => {
    try { return await handler(request); }
    catch (error) {
      if (error instanceof SaleError) {
        const code = ['unauthenticated', 'permission-denied'].includes(error.code) ? error.code
          : error.code === 'sale-conflict' ? 'already-exists' : 'failed-precondition';
        throw new HttpsError(code, error.message, { saleCode: error.code });
      }
      // Transaction/network failures remain retryable; do not expose SDK diagnostics or payloads.
      const code = String(error.code ?? '');
      if (['10', 'aborted', '14', 'unavailable', '4', 'deadline-exceeded'].includes(code)) {
        throw new HttpsError('unavailable', 'Operación pendiente; reintenta con el mismo ID.');
      }
      console.error('Financial operation failed', { code, name: error.name });
      throw new HttpsError('internal', 'No se pudo confirmar la operación; conserva el mismo ID.');
    }
  });
}
