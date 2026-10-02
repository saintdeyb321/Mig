export function readTenantCache(database, tableName, businessId) {
  return database[tableName].where('businessId').equals(businessId).toArray();
}

export async function syncTenantCache(database, tableName, businessId, remoteData) {
  if (!businessId || remoteData.some(record => record.businessId !== businessId)) {
    throw new Error('El cache requiere registros del mismo tenant.');
  }
  const table = database[tableName];
  await database.transaction('rw', table, async () => {
    const remoteIds = new Set(remoteData.map(record => record.id));
    const existing = await table.bulkGet([...remoteIds]);
    if (existing.some(record => record && record.businessId !== businessId)) {
      throw new Error('Un ID del cache pertenece a otro tenant.');
    }
    const localIds = await table.where('businessId').equals(businessId).primaryKeys();
    await table.bulkDelete(localIds.filter(id => !remoteIds.has(id)));
    await table.bulkPut(remoteData);
  });
}
