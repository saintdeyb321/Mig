import { toMillisSafe } from '../../../core/dates/dateValues.js';
import { money } from '../../sales/domain/saleModel.js';
import * as firestoreSDK from 'firebase/firestore';
import { cashLockId } from './sparkCashRepository.js';
import { calculateCashTotals } from '../../../../../functions/src/cash-register/domain/cashTotals.js';
import { contractAmount } from '../../../../../functions/src/contracts/domain/contractModel.js';

// A bounded client estimate is useful for counting cash; it is never a certified reconciliation.
export function createSparkCashClosingRepository(database, { currentUser, readSales, readPayments, sdk = firestoreSDK } = {}) {
  const { doc, getDocFromServer, runTransaction, serverTimestamp } = sdk;
  const who = () => { const uid = currentUser()?.uid; if (!uid) throw new Error('Inicia sesión.'); return uid; };
  async function preview(id, declaredAmount) {
    who(); contractAmount(declaredAmount);
    const saved = await getDocFromServer(doc(database, 'cash_sessions', id));
    if (!saved.exists() || saved.data().runtime !== 'spark') throw new Error('Caja histórica: requiere revisión, sin migración automática.');
    const session = { ...saved.data(), id };
    const [sales, payments] = await Promise.all([readSales(session), readPayments(session)]);
    const openedAt = toMillisSafe(session.openedAt);
    const confirmedSales = sales.filter(sale => sale.status === 'confirmed' && (toMillisSafe(sale.confirmedAt) ?? -Infinity) >= openedAt);
    const confirmedPayments = payments.filter(payment => payment.runtime === 'spark' && (toMillisSafe(payment.occurredAt) ?? -Infinity) >= openedAt);
    const totals = calculateCashTotals(session, confirmedSales, confirmedPayments);
    return { ...totals, expectedAmount: totals.expectedCash, declaredAmount,
      difference: money(declaredAmount - totals.expectedCash),
      reconciliationPending: true, authority: 'client-estimate' };
  }
  return { preview, async close(id, declaredAmount, notes = '') {
    const actorId = who(); contractAmount(declaredAmount);
    if (notes.length > 2000) throw new Error('Máximo 2000 caracteres de cierre.');
    const ref = doc(database, 'cash_sessions', id);
    const previous = (await getDocFromServer(ref)).data();
    if (who() !== actorId) throw new Error('La sesión cambió.');
    if (previous?.runtime !== 'spark') throw new Error('Caja histórica: cierre Spark no autorizado.');
    if (previous.status !== 'open') {
      if (previous.closedBy === actorId && previous.declaredAmount === declaredAmount && previous.closingNote === notes) return { ...previous, id };
      throw new Error('La caja ya fue cerrada con otra declaración.');
    }
    // Read committed rows only, before the final barrier. A racing sale may change this estimate.
    const estimate = await preview(id, declaredAmount);
    if (estimate.difference !== 0 && notes.trim().length < 5) throw new Error('Explica la diferencia con al menos 5 caracteres y vuelve a revisar el cierre.');
    await runTransaction(database, async tx => {
      if (who() !== actorId) throw new Error('La sesión cambió.');
      const saved = await tx.get(ref), session = saved.data();
      if (session?.runtime !== 'spark') throw new Error('Caja histórica: cierre Spark no autorizado.');
      const lock = doc(database, 'active_cash_sessions', await cashLockId(session.businessId, session.branchId));
      const active = await tx.get(lock);
      if (session.status !== 'open') {
        if (session.closedBy === actorId && session.declaredAmount === declaredAmount && session.closingNote === notes) return;
        throw new Error('La caja ya fue cerrada con otra declaración.');
      }
      if (!active.exists() || active.data().sessionId !== id) throw new Error('El candado de caja no coincide; requiere revisión.');
      tx.update(ref, { status: estimate.difference === 0 ? 'closed' : 'closed_with_discrepancy',
        declaredAmount, closingNote: notes, closedAt: serverTimestamp(), closedBy: actorId,
        reconciliationPending: true, closeEstimate: estimate });
      tx.delete(lock);
    });
    const saved = await getDocFromServer(ref);
    if (who() !== actorId) throw new Error('La sesión cambió.');
    return { ...saved.data(), id };
  } };
}
