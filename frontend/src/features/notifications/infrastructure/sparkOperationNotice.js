// Informational inbox entry, atomically tied to an authorized operation, never financial evidence.
export function writeOperationNotice(tx, database, sdk, type, id, context) {
  tx.set(sdk.doc(database, 'notifications', `${type}_${id}`), {
    businessId: context.businessId, branchId: context.branchId, userId: context.userId,
    sourceType: type, sourceId: id, authority: 'informational', readAt: null,
    title: 'Operación registrada', message: 'Aviso informativo. Consulta el movimiento confirmado; este aviso no certifica importes.',
    actorName: context.cashierName ?? '', createdAt: sdk.serverTimestamp(),
  });
}
