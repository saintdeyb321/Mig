import * as firestoreSDK from 'firebase/firestore';
import { sanitizeBackup } from '../domain/backupFile.js';
import { firebaseErrorMessage } from '../../../core/errors/firebaseErrors.js';

const single = ['tenants', 'licenses', 'settings'];
export const BACKUP_COLLECTIONS = [...single, 'branches', 'categories', 'products', 'customers', 'sales', 'contracts', 'payments',
  'cash_sessions', 'active_cash_sessions', 'users', 'invites', 'spark_contract_operations', 'alerts', 'audit_events'];
export function createBackupRepository(database, { sdk = firestoreSDK, currentUser } = {}) {
  const { doc, getDocFromServer, collection, query, where, orderBy, documentId, startAfter, limit, getDocsFromServer } = sdk;
  return async ({ businessId, actorId, maxRecords = 2000, signal, onProgress = () => {} }) => {
    if (!businessId || businessId === 'platform-admin' || businessId.includes('/') || !Number.isSafeInteger(maxRecords) || maxRecords < 100 || maxRecords > 5000) throw new Error('Alcance o límite de exportación inválido.');
    const assertActive = () => { if (signal?.aborted || currentUser()?.uid !== actorId) throw new Error('Exportación cancelada o identidad modificada.'); };
    assertActive();
    const profile = (await getDocFromServer(doc(database, 'users', actorId))).data();
    assertActive();
    if (!profile || profile.status === 'inactivo' || !['dueño', 'superadmin'].includes(profile.role)
      || profile.role !== 'superadmin' && profile.businessId !== businessId) throw new Error('Solo el dueño de este negocio o SuperAdmin pueden solicitar su alcance autorizado.');
    const sections = [], warnings = [], redacted = [];
    let count = 0, bytes = 0, exhausted = false;
    const append = (records, row, name) => {
      if (row.businessId != null && row.businessId !== businessId) throw new Error('Respuesta fuera del negocio solicitado; exportación abortada.');
      const data = sanitizeBackup(row, redacted, name);
      // settings/profile documents can contain historical integrations: export only business/profile fields.
      const allowed = name === 'settings' ? ['id', 'businessId', 'companyData', 'operationId'] : name === 'users'
        ? ['id', 'businessId', 'email', 'firstName', 'lastName', 'role', 'branchId', 'shiftStart', 'shiftEnd', 'status', 'createdAt', 'hasAcceptedTerms', 'termsAcceptedAt', 'termsVersion'] : null;
      const record = allowed ? Object.fromEntries(Object.entries(data).filter(([key]) => allowed.includes(key))) : data;
      const size = new TextEncoder().encode(JSON.stringify(record)).length;
      if (bytes + size > 16 * 1024 * 1024 || count >= maxRecords) { exhausted = true; return false; }
      bytes += size; count++; records.push(record); return true;
    };
    for (const name of BACKUP_COLLECTIONS) {
      assertActive();
      const section = { name, records: [], status: 'complete' };
      if (exhausted || count >= maxRecords) { section.status = 'not-read'; section.warning = 'Límite global de registros/16 MiB alcanzado.'; sections.push(section); continue; }
      try {
        if (single.includes(name)) {
          const saved = await getDocFromServer(doc(database, name, businessId)); assertActive();
          if (saved.exists() && !append(section.records, { ...saved.data(), id: saved.id }, name)) section.status = 'limited';
        } else {
          let cursor;
          do {
            const remaining = Math.min(200, maxRecords - count);
            const page = await getDocsFromServer(query(collection(database, name), where('businessId', '==', businessId),
              orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(remaining)));
            assertActive();
            for (const row of page.docs) if (!append(section.records, { ...row.data(), id: row.id }, name)) { section.status = 'limited'; break; }
            onProgress({ collection: name, count });
            if (section.status === 'limited' || count >= maxRecords) { section.status = 'limited'; break; }
            cursor = page.size === remaining ? page.docs.at(-1) : null;
          } while (cursor);
        }
      } catch (error) {
        assertActive();
        if (!['permission-denied', 'failed-precondition', 'unavailable'].includes(String(error.code).replace('firestore/', ''))) throw error;
        section.status = section.records.length ? 'incomplete' : 'inaccessible'; section.warning = `${error.code}: ${firebaseErrorMessage(error)}`;
      }
      if (section.status !== 'complete') section.warning ??= 'Límite global: no se afirma que la colección esté completa.';
      sections.push(section);
    }
    assertActive();
    if (redacted.length) warnings.push(`Campos sensibles/no soportados omitidos: ${redacted.length}.`);
    if (profile.role === 'superadmin') warnings.push('SuperAdmin no hereda permisos operativos; consulte las colecciones inaccesibles. El dueño puede exportar su propio alcance.');
    return { sections, warnings };
  };
}
