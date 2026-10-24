import { base64, sanitizeBackup, sha256 } from '../domain/backupFile.js';

// Reads only this device/account. No DB upgrade, mutation, queue flush or receipt acceptance.
export async function readLocalBackup(database, { uid, businessId, decrypt, pending = false, photos = false, assertActive }) {
  const sections = [], warnings = [];
  if (pending) {
    const records = await database.sales.where('[businessId+userId+status]').anyOf(['pending', 'syncing', 'failed'].map(status => [businessId, uid, status])).limit(501).toArray();
    assertActive();
    const sales = [], cash = [];
    let unreadableCash = 0;
    for (const record of records.slice(0, 500)) {
      try {
        const payload = JSON.parse(await decrypt(record.data, uid)); assertActive();
        if (payload.businessId !== businessId || payload.userId !== uid) throw new Error('Identidad no coincidente.');
        sales.push(sanitizeBackup({ localId: record.localId, status: record.status, lastError: record.lastError ?? null,
          financialAck: record.financialAck ?? false, stockVersions: record.stockVersions ?? {}, payload }));
      } catch { assertActive(); warnings.push('Un pendiente propio no pudo descifrarse/validarse; se conserva en IndexedDB.'); }
    }
    // Historical cash records lack plaintext identity; never export another account's ciphertext.
    const sessions = await database.cash_sessions.orderBy('localId').limit(501).toArray();
    for (const record of sessions.slice(0, 500).filter(record => record.sync === false)) {
      try {
        const payload = JSON.parse(await decrypt(record.data, uid)); assertActive();
        if (payload.businessId === businessId && payload.userId === uid) cash.push(sanitizeBackup({ localId: record.localId, state: 'pending-local', payload }));
      } catch { assertActive(); unreadableCash++; /* Foreign ciphertext is neither exposed nor modified. */ }
    }
    sections.push({ name: 'local_pending_sales', records: sales, status: records.length > 500 || sales.length !== Math.min(records.length, 500) ? 'limited' : 'complete' },
      { name: 'local_pending_cash', records: cash, status: sessions.length > 500 || unreadableCash ? 'limited' : 'complete' });
    if (unreadableCash) warnings.push('Hay cajas locales no descifrables por esta cuenta (otra identidad o archivo dañado); se conservan y no se incluyen. No se garantiza un respaldo completo de cajas.');
    warnings.push('Pendientes locales: no son ingresos confirmados. Los registros antiguos sin identidad indexada no se incluyen; no se borran ni migran.');
  }
  if (photos) {
    const images = await database.settings.where('id').startsWith(`contract-image:${uid}:local-image:${businessId}:`).limit(101).toArray();
    const records = [];
    let bytes = 0;
    for (const image of images.slice(0, 100)) {
      assertActive();
      if (image.userId !== uid || image.businessId !== businessId || !(image.main instanceof Blob) || !(image.thumbnail instanceof Blob)
        || image.main.type !== 'image/jpeg' || image.thumbnail.type !== 'image/jpeg' || image.main.size > 262144 || image.thumbnail.size > 65536
        || bytes + image.main.size + image.thumbnail.size > 4 * 1024 * 1024) { warnings.push('Foto no incluida por identidad, formato o límite local de 4 MiB.'); continue; }
      const main = new Uint8Array(await image.main.arrayBuffer()), thumbnail = new Uint8Array(await image.thumbnail.arrayBuffer());
      assertActive(); bytes += main.length + thumbnail.length;
      records.push({ reference: image.reference, contractId: image.contractId, contentType: 'image/jpeg', deviceOnly: true,
        mainBase64: base64(main), thumbnailBase64: base64(thumbnail), mainSha256: await sha256(main), thumbnailSha256: await sha256(thumbnail) });
    }
    sections.push({ name: 'local_photos', records, status: records.length === images.length ? 'complete' : 'limited' });
    warnings.push('Solo fotos JPEG de este dispositivo/cuenta, hasta 100 y 4 MiB en total. Las referencias Storage y fotos de otros dispositivos no tienen respaldo aquí.');
  }
  return { sections, warnings };
}
