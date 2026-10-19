// Keep unacknowledged local closes when an older remote read or opening response arrives.
export async function persistCashSession(database, session, { encrypt, decrypt, preservePending = false, acknowledgedData }) {
  const data = await encrypt(JSON.stringify(session), session.userId);
  const jobId = `cash-reconcile:${session.businessId}:${session.userId}:${session.id}`;
  let pending;
  await database.transaction('rw', database.cash_sessions, database.settings, async () => {
    const current = await database.cash_sessions.get(session.id);
    if (current?.sync === false && (preservePending || (acknowledgedData !== undefined && current.data !== acknowledgedData))) {
      pending = current; return;
    }
    await database.cash_sessions.put({ localId: session.id, data, sync: true });
    if (session.reconciliationPending) await database.settings.put({ id: jobId, businessId: session.businessId, userId: session.userId, sessionId: session.id });
    else await database.settings.delete(jobId);
  });
  if (pending) {
    if (acknowledgedData !== undefined) throw new Error('El cierre local cambió durante la sincronización; se reintentará.');
    const local = JSON.parse(await decrypt(pending.data, session.userId));
    if (local.businessId !== session.businessId || local.userId !== session.userId) throw new Error('Caja local de otra identidad.');
    return { ...local, id: pending.localId };
  }
  return session;
}
