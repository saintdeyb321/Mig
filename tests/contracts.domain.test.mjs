import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { financialProjection, assertPaymentWithinBalance } from '../functions/src/contracts/domain/contractModel.js';
import { legacyPaymentPlan, remainingIncomePayments } from '../functions/src/contracts/legacyLedger.js';
import { migrationOptions } from '../functions/scripts/migrateLegacyContracts.mjs';
import { cleanupUnreferencedImages } from '../frontend/src/features/contracts/application/imageCleanup.js';
import { mergeContractPages } from '../frontend/src/features/contracts/application/contractCommands.js';
const legacy = payments => ({ businessId: 'tenant', branchId: 'branch', total: 100, payments });
describe('Contract financial invariants', () => {
  it('fully refunded cancellations retain no operational debt', () => {
    assert.deepEqual(financialProjection(100, [{ amount: 40, type: 'advance' }, { amount: -40, type: 'refund' }], 'cancelado'),
      { paidTotal: 0, balance: 0, status: 'cancelado' });
  });
  it('delivered debt transitions only after the ledger is fully paid', () => {
    assert.equal(financialProjection(100, [{ amount: 99, type: 'payment' }], 'entregado').status, 'entregado_con_deuda');
    assert.equal(financialProjection(100, [{ amount: 100, type: 'payment' }], 'entregado_con_deuda').status, 'entregado');
    assert.throws(() => assertPaymentWithinBalance(101, 100), { code: 'overpayment' });
  });
  it('refunded money cannot exceed original receipts', () => {
    assert.throws(() => financialProjection(100, [{ type: 'refund', amount: -1 }]), { code: 'invalid-ledger' });
    assert.throws(() => remainingIncomePayments([{ id: 'a', amount: 1, method: 'yape' }, { id: 'b', amount: -2, method: 'yape' }]), { code: 'invalid-ledger' });
  });
  it('legacy IDs are deterministic and preserve historical date, mixed amounts and refunds', () => {
    const contract = legacy([{ type: 'adelanto', amount: 20, method: 'mixto', splitPayments: { efectivo: 5, yape: 15 }, date: '2024-01-01' },
      { type: 'reembolso', amount: 3, method: 'yape', date: '2024-01-02' }]);
    const first = legacyPaymentPlan('doc', contract), second = legacyPaymentPlan('doc', structuredClone(contract));
    assert.deepEqual(first, second); assert.equal(new Set(first.map(row => row.id)).size, 3);
    assert.equal(first.reduce((sum, row) => sum + row.amount, 0), 17);
    assert.equal(first[0].occurredAt.toDate().toISOString(), '2024-01-01T00:00:00.000Z');
    assert.equal(first.at(-1).type, 'refund'); assert.equal(first.at(-1).amount, -3);
    assert.deepEqual(legacyPaymentPlan('doc', { ...contract, paymentsMigrated: true }), []);
  });
  it('unverifiable legacy data requests review without creating a guessed movement', () => {
    for (const payment of [{ amount: 1, method: 'yape' }, { amount: 1, method: 'other', date: '2024-01-01' },
      { amount: 10, method: 'mixto', splitPayments: { efectivo: 1 }, date: '2024-01-01' }]) {
      assert.throws(() => legacyPaymentPlan('doc', legacy([payment])), { code: 'migration-required' });
    }
  });
  it('migration defaults to dry-run and preserves resume/business arguments', () => {
    assert.equal(migrationOptions([]).dryRun, true);
    assert.deepEqual(migrationOptions(['--apply', '--business=tenant', '--limit=2', '--cursor=doc']),
      { dryRun: false, businessId: 'tenant', limit: 2, cursor: 'doc' });
    assert.throws(() => migrationOptions(['--limit=0']));
    assert.throws(() => migrationOptions(['--unknown']));
    assert.throws(() => migrationOptions(['--business']));
    assert.throws(() => migrationOptions(['--cursor=']));
  });
  it('cleanup verifies references first and failures remain retryable without deleting referenced files', async () => {
    const removed = [];
    const result = await cleanupUnreferencedImages({ paths: ['fresh', 'retained'], readCurrent: async () => [{ storagePath: 'retained' }],
      remove: async path => removed.push(path) });
    assert.deepEqual(removed, ['fresh']); assert.equal(result.deleted, 1);
    await cleanupUnreferencedImages({ paths: ['fresh'], readCurrent: async () => { throw Error(); },
      remove: async () => assert.fail('Unknown current state must preserve images') });
  });
  it('history page merges preserve unique authoritative IDs', () => {
    assert.deepEqual(mergeContractPages([{ id: 'a' }, { id: 'b', old: true }], [{ id: 'b' }, { id: 'c' }]), [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });
});
