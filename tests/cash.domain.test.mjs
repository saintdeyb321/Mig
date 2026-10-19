import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateCashTotals } from '../functions/src/cash-register/domain/cashTotals.js';
import { closingProjection } from '../functions/src/cash-register/sessionTotals.js';
import { cashLockId } from '../functions/src/cash-register/handlers.js';
describe('Cash financial calculations', () => {
  it('preserves signed refunds, mixed cash/digital and counts only valid transactions', () => {
    const totals = calculateCashTotals({ openingAmount: 10 }, [
      { payment: 'mixto', total: 20, splitPayments: { efectivo: 8, yape: 12 } },
      { payment: 'efectivo', total: 900, voided: true },
    ], [{ type: 'advance', method: 'efectivo', amount: 30 }, { type: 'refund', method: 'efectivo', amount: -5 },
      { type: 'payment', method: 'plin', amount: 7 }]);
    assert.equal(totals.expectedCash, 43); assert.equal(totals.totalYape, 19); assert.equal(totals.validTransactionCount, 3);
    assert.equal(closingProjection(totals, 40).difference, -3);
    assert.equal(closingProjection(totals, 43).status, 'closed');
    assert.equal(closingProjection(totals, null).difference, null);
  });
  it('rejects unverifiable methods and preserves money precision', () => {
    assert.throws(() => calculateCashTotals({ openingAmount: 0 }, [{ payment: 'mixto', total: 20, splitPayments: { efectivo: 1, yape: 2 } }], []), { code: 'invalid-ledger' });
    const totals = calculateCashTotals({ openingAmount: 0 }, [], [{ type: 'payment', method: 'efectivo', amount: 0.1 }, { type: 'payment', method: 'efectivo', amount: 0.2 }]);
    assert.equal(totals.expectedCash, 0.3);
  });
  it('cash lock IDs cannot collide through tenant or branch delimiters', () => {
    assert.notEqual(cashLockId('a_b', 'c'), cashLockId('a', 'b_c'));
    assert.equal(cashLockId('tenant', 'branch'), cashLockId('tenant', 'branch'));
  });
});
