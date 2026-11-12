import offlineDB from '../../../offlineDB.js';
import { decrypt } from '../../../crypto.js';
import { saleFinancialState } from '../../sales/domain/queueState.js';

export async function assertNoLocalCashPending(session, uid) {
  const [turn, rows] = await Promise.all([
    offlineDB.cash_sessions.get(session.id),
    offlineDB.sales.where('[businessId+userId+status]').anyOf(['pending', 'syncing']
      .map(status => [session.businessId, session.userId, status])).toArray(),
  ]);
  if (turn?.sync === false) throw new Error('Hay una caja local pendiente de revisar.');
  for (const row of rows) {
    if ((row.branchId && row.branchId !== session.branchId) || saleFinancialState(row) === 'draft_offline') continue;
    if (session.userId !== uid) throw new Error('Hay cobros por comprobar en el dispositivo del responsable.');
    let sale;
    try { sale = JSON.parse(await decrypt(row.data, uid)); }
    catch { throw new Error('Hay un ticket local que no se pudo verificar.'); }
    if (!sale.sessionId || sale.sessionId === session.id) throw new Error('Comprueba los tickets pendientes de este turno desde el historial.');
  }
}
