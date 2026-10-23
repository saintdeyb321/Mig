import { Timestamp, FieldPath } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';

export const eventIdFor = (businessId, type, sourceId, operationId = '') =>
  createHash('sha256').update(JSON.stringify([businessId, type, sourceId, operationId])).digest('hex');

export function writeAuditEvent(transaction, database, { businessId, branchId, type, sourceType, sourceId,
  actorId, actorName, metadata = {}, operationId = '', occurredAt = Timestamp.now() }) {
  const id = eventIdFor(businessId, type, sourceId, operationId);
  transaction.create(database.doc('audit_events/' + id), { businessId, branchId, type, sourceType, sourceId,
    actorId, actorName, occurredAt, metadata });
  return id;
}

const notifications = {
  SALE_VOIDED: ['Venta anulada', 'Se anuló un ticket de venta.'],
  CONTRACT_VOIDED: ['Pedido anulado', 'Se canceló un pedido y se registraron sus devoluciones.'],
  CASH_FORCE_CLOSED: ['Caja cerrada por administración', 'Se forzó el cierre de un turno.'],
  CASH_DISCREPANCY: ['Descuadre de caja', 'El conteo declarado difiere del cierre calculado por el servidor.'],
  SHIFT_MISMATCH: ['Descuadre de relevo', 'El fondo de apertura difiere del último conteo cerrado.'],
  REGISTER_AUTO_CLOSED: ['Caja cerrada por vencimiento', 'El turno superó su ventana autorizada. Revisa el conteo pendiente.'],
  CASH_RECONCILED: ['Caja reconciliada', 'El cierre se actualizó tras sincronizar movimientos pendientes.'],
};
export function createAuditNotificationHandler(database) {
  return async eventId => {
    const eventRef = database.doc('audit_events/' + eventId);
    const event = (await eventRef.get()).data();
    const display = event && notifications[event.type];
    if (!display) return;
    const recipients = new Set();
    let cursor;
    do {
      let query = database.collection('users').where('businessId', '==', event.businessId)
        .where('role', '==', 'dueño').orderBy(FieldPath.documentId()).limit(100);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      for (const doc of page.docs) if ((doc.data().status ?? 'activo') === 'activo') recipients.add(doc.id);
      cursor = page.size === 100 ? page.docs.at(-1) : null;
    } while (cursor);
    if (['CASH_DISCREPANCY', 'REGISTER_AUTO_CLOSED', 'CASH_FORCE_CLOSED'].includes(event.type) && event.metadata.sessionUserId) {
      recipients.add(event.metadata.sessionUserId);
    }
    const ids = [...recipients];
    for (let offset = 0; offset < ids.length; offset += 100) {
      const users = ids.slice(offset, offset + 100);
      await database.runTransaction(async transaction => {
        if (!(await transaction.get(eventRef)).exists) return;
        const tenant = (await transaction.get(database.doc('tenants/' + event.businessId))).data();
        if (tenant && (tenant.status ?? 'active') !== 'active') return;
        if (tenant?.maintenanceJobId) throw new Error('tenant-backup-in-progress');
        const profiles = await transaction.getAll(...users.map(id => database.doc('users/' + id)));
        const references = users.map(id => database.doc('notifications/' + eventId + '_' + id));
        const existing = await transaction.getAll(...references);
        for (let i = 0; i < users.length; i++) {
          const profile = profiles[i].data();
          const personal = event.metadata.sessionUserId === users[i] && ['CASH_DISCREPANCY', 'REGISTER_AUTO_CLOSED', 'CASH_FORCE_CLOSED'].includes(event.type);
          if (existing[i].exists || !profile || profile.businessId !== event.businessId || (profile.status ?? 'activo') !== 'activo'
            || (!personal && profile.role !== 'dueño')) continue;
          transaction.create(references[i], { businessId: event.businessId, userId: users[i], eventId,
            branchId: event.branchId, type: event.type, title: display[0], message: display[1], actorName: event.actorName,
            metadata: event.metadata, createdAt: event.occurredAt, readAt: null });
        }
      });
    }
  };
}
