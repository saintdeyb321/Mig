import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { SaleError } from '../sales/domain/saleModel.js';
import { observeOperation } from './observability.js';

export function callable(handler, operation) {
  const observed = observeOperation(operation, handler);
  const enforced = process.env.FUNCTIONS_EMULATOR !== 'true' && (process.env.MIGAPOS_APP_CHECK_ENFORCE || '').split(',').includes(operation);
  return onCall({ region: 'us-central1', maxInstances: 10, enforceAppCheck: enforced }, async request => {
    try { return await observed(request); }
    catch (error) {
      if (error instanceof SaleError) {
        const code = ['unauthenticated', 'permission-denied'].includes(error.code) ? error.code
          : ['sale-conflict', 'payment-conflict'].includes(error.code) ? 'already-exists' : 'failed-precondition';
        throw new HttpsError(code, error.message, { saleCode: error.code });
      }
      // Transaction/network failures remain retryable; do not expose SDK diagnostics or payloads.
      const code = String(error.code ?? '');
      if (['10', 'aborted', '14', 'unavailable', '4', 'deadline-exceeded'].includes(code)) {
        throw new HttpsError('unavailable', 'Operación pendiente; reintenta con el mismo ID.');
      }
      throw new HttpsError('internal', 'No se pudo confirmar la operación; conserva el mismo ID.');
    }
  });
}
