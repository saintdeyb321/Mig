import { SaleError } from '../domain/saleModel.js';
import { isDeterministicSaleError } from '../domain/queueState.js';

export const voidIntentPrefix = identity => `pos-void:${JSON.stringify([identity.uid, identity.businessId, identity.branchId])}:`;
const scopePrefix = identity => identity.branchId === 'global' ? `pos-void:${JSON.stringify([identity.uid, identity.businessId]).slice(0, -1)},` : voidIntentPrefix(identity);

// Durable encrypted intentions are local evidence of an attempt, never financial receipts.
export function createVoidRecovery({ store, encrypt, decrypt, repository, currentIdentity }) {
  const key = (identity, saleId) => voidIntentPrefix(identity) + saleId;
  const active = identity => currentIdentity(identity);
  async function read(identity, saleId) {
    const row = await store.get(key(identity, saleId));
    if (!row) return null;
    const command = JSON.parse(await decrypt(row.data, identity.uid));
    if (command.userId !== identity.uid || command.businessId !== identity.businessId || command.branchId !== identity.branchId || command.saleId !== saleId) {
      throw new SaleError('identity-mismatch', 'El intento de anulación pertenece a otra identidad o sede.');
    }
    return { ...command, localState: row.status };
  }
  async function list(identity) {
    const rows = await store.list(scopePrefix(identity));
    const commands = [];
    for (const row of rows) {
      if (!['pending', 'confirmed'].includes(row.status)) continue;
      try {
        const payload = JSON.parse(await decrypt(row.data, identity.uid));
        const command = await read(identity.branchId === 'global' ? { ...identity, branchId: payload.branchId } : identity, row.saleId);
        if (command) commands.push(command);
      } catch {
        // Preserve unreadable evidence, block another compensation, and leave other history usable.
        commands.push({ saleId: row.saleId, branchId: identity.branchId, localState: 'unreadable' });
      }
    }
    return commands;
  }
  async function verify(command, identity, isCurrent = () => true) {
    const original = await read(identity, command.saleId);
    if (!original || !active(identity) || !isCurrent()) throw new SaleError('session-changed', 'Conserva el intento original; cambió la sesión o sede.');
    const receipt = await repository.verify(original);
    if (!active(identity) || !isCurrent()) throw new SaleError('session-changed', 'La sesión o sede cambió durante la lectura.');
    try { await store.update(key(identity, command.saleId), { status: 'confirmed', lastError: null }); }
    catch { return { ...receipt, localAcknowledgementPending: true }; }
    return receipt;
  }
  async function submit(command, identity) {
    if (!active(identity) || !identity.branchId || identity.branchId === 'global') throw new SaleError('identity-mismatch', 'Selecciona la sede original.');
    const existing = await read(identity, command.saleId);
    if (existing) {
      if (existing.reason !== command.reason.trim()) throw new SaleError('sale-conflict', 'Conserva el motivo original del intento de anulación.');
      // Only a definitively rejected attempt with a server-confirmed absent receipt can be
      // retried by an explicit action (for example after opening the actor's own cash).
      if (existing.localState !== 'rejected') return verify(existing, identity);
      try { return await verify(existing, identity); }
      catch (error) { if (error.code !== 'receipt-not-found') throw error; }
    }
    const original = { saleId: command.saleId, reason: command.reason.trim(), businessId: identity.businessId, branchId: identity.branchId, userId: identity.uid };
    if (existing) await store.update(key(identity, command.saleId), { status: 'pending', lastError: null });
    else {
      const data = await encrypt(JSON.stringify(original), identity.uid);
      if (!active(identity)) throw new SaleError('session-changed', 'La sesión cambió.');
      try { await store.insert({ id: key(identity, command.saleId), saleId: command.saleId, status: 'pending', data }); }
      catch (error) {
        if (error.name !== 'ConstraintError') throw error;
        const concurrent = await read(identity, command.saleId);
        if (concurrent.reason !== original.reason) throw new SaleError('sale-conflict', 'Otro intento conserva un motivo diferente; verifica el original.');
        return verify(concurrent, identity);
      }
    }
    try {
      if (!active(identity)) throw new SaleError('session-changed', 'La sesión cambió.');
      const receipt = await repository.void(original);
      if (!active(identity)) throw new SaleError('session-changed', 'La sesión cambió.');
      try { await store.update(key(identity, command.saleId), { status: 'confirmed', lastError: null }); }
      catch { return { ...receipt, localAcknowledgementPending: true }; }
      return receipt;
    } catch (error) {
      await store.update(key(identity, command.saleId), { status: isDeterministicSaleError(error) ? 'rejected' : 'pending', lastError: error.message });
      throw error;
    }
  }
  return { read, list, verify, submit };
}
