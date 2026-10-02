import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateSaleSession, OFFLINE_WINDOW_MS } from '../functions/src/sales/sessionWindow.js';
import { canonicalSale as serverModel } from '../functions/src/sales/domain/saleModel.js';
import { canonicalSale as clientModel } from '../frontend/src/features/sales/domain/saleModel.js';

const actor = { uid: 'u', businessId: 'b' };
const sale = { branchId: 'branch', createdAt: '2026-10-02T12:10:00Z', queuedAt: '2026-10-02T12:10:00Z', origin: 'offline' };
const window = { openedAt: '2026-10-02T12:00:00Z', closedAt: '2026-10-02T13:00:00Z', expiresAt: '2026-10-03T06:00:00Z' };
const session = { userId: 'u', businessId: 'b', branchId: 'branch', status: 'closed', financialWindow: window };
const now = new Date('2026-10-02T14:00:00Z').getTime();
describe('Shared financial model and trusted session boundaries', () => {
  it('the browser and backend import the exact same canonical implementation', () => assert.equal(clientModel, serverModel));
  it('untrusted missing payloads yield deterministic domain errors', () => {
    for (const payload of [null, undefined, [], 'sale']) assert.throws(() => serverModel(payload), { code: 'invalid-sale' });
  });
  it('closed windows accept valid offline tickets and closed_with_discrepancy', () => {
    validateSaleSession(session, sale, actor, now);
    validateSaleSession({ ...session, status: 'closed_with_discrepancy' }, sale, actor, now);
  });
  it('closed windows refuse online, legacy/unverified and forged temporal payloads', () => {
    assert.throws(() => validateSaleSession(session, { ...sale, origin: 'online' }, actor, now), { code: 'closed-session' });
    assert.throws(() => validateSaleSession({ ...session, financialWindow: null }, sale, actor, now), { code: 'unverified-session' });
    for (const overrides of [{ createdAt: '2026-10-02T11:59:00Z' }, { createdAt: '2026-10-02T13:01:00Z' },
      { queuedAt: '2026-10-02T13:01:00Z' }, { queuedAt: '2026-10-02T12:09:00Z' }, { createdAt: null }]) {
      assert.throws(() => validateSaleSession(session, { ...sale, ...overrides }, actor, now), { code: 'invalid-session' });
    }
  });
  it('session owner, tenant and branch are always checked', () => {
    for (const overrides of [{ userId: 'other' }, { businessId: 'other' }, { branchId: 'other' }]) {
      assert.throws(() => validateSaleSession({ ...session, ...overrides }, sale, actor, now), { code: 'invalid-session' });
    }
  });
  it('offline authorization has a finite window', () => assert.equal(OFFLINE_WINDOW_MS, 18 * 60 * 60 * 1000));
});
