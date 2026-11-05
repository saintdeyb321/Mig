import * as firestoreSDK from 'firebase/firestore';
import { createPlatformDataAccess } from './platformDataAccess.js';
import { sanitizeBackup } from '../domain/backupFile.js';
import { firebaseErrorMessage } from '../../../core/errors/firebaseErrors.js';

const single = ['tenants', 'licenses', 'settings'];
export const BACKUP_COLLECTIONS = [...single, 'branches', 'categories', 'products', 'customers', 'sales', 'contracts', 'payments',
  'cash_sessions', 'active_cash_sessions', 'users', 'invites', 'spark_contract_operations', 'alerts', 'audit_events',
  'daily_stats', 'notifications', 'platform_jobs', 'platform_operations', 'platform_audit', 'owner_email_claims', 'pos_sale_groups', 'pos_voids', 'pos_void_groups'];
export function createBackupRepository(database, { sdk = firestoreSDK, currentUser, withAccess = createPlatformDataAccess(database, { sdk, currentUser }) } = {}) {
  const { doc, getDocFromServer, collection, query, where, orderBy, documentId, startAfter, limit, getDocsFromServer } = sdk;
  return async ({ businessId, actorId, maxRecords = 2000, signal, purpose = 'export', onProgress = () => {} }) => {
    if (!businessId || businessId === 'platform-admin' || businessId.includes('/') || !['export', 'inventory'].includes(purpose) || !Number.isSafeInteger(maxRecords) || maxRecords < 100 || maxRecords > 5000) throw new Error('Alcance o límite de exportación inválido.');
    const assertActive = () => { if (signal?.aborted || currentUser()?.uid !== actorId) throw new Error('Exportación cancelada o identidad modificada.'); };
    assertActive();
    const profile = (await getDocFromServer(doc(database, 'users', actorId))).data();
    assertActive();
    if (!profile || (profile.status ?? 'activo') !== 'activo' || profile.role !== 'superadmin') throw new Error('Solo SuperAdmin puede iniciar la exportación o el inventario empresarial.');
    return withAccess({ actorId, businessId, purpose }, async () => {
      const sections = [], warnings = [], redacted = [];
      let count = 0, bytes = 0, exhausted = false;
      const append = (records, row, name) => {
        if (row.businessId != null && row.businessId !== businessId) throw new Error('Respuesta fuera del negocio solicitado; exportación abortada.');
        const data = sanitizeBackup(row, redacted, name);
        // settings/profile documents can contain historical integrations: export only business/profile fields.
        const allowed = name === 'settings' ? ['id', 'businessId', 'companyData', 'operationId', '$path'] : name === 'users'
          ? ['id', 'businessId', 'email', 'firstName', 'lastName', 'role', 'branchId', 'shiftStart', 'shiftEnd', 'status', 'createdAt', 'hasAcceptedTerms', 'termsAcceptedAt', 'termsVersion', '$path'] : null;
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
            if (saved.exists() && !append(section.records, { ...saved.data(), id: saved.id, $path: `${name}/${saved.id}` }, name)) section.status = 'limited';
          } else {
            let cursor;
            do {
              const remaining = Math.min(200, maxRecords - count);
              const page = await getDocsFromServer(query(collection(database, name), where('businessId', '==', businessId),
                orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(remaining)));
              assertActive();
              for (const row of page.docs) if (!append(section.records, { ...row.data(), id: row.id, $path: `${name}/${row.id}` }, name)) { section.status = 'limited'; break; }
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
      // Known historical job children inherit their tenant from the verified parent.
      // No arbitrary reference path is queried: the Web SDK cannot enumerate unknown collections.
      const nested = { name: 'platform_job_children', records: [], status: 'complete' };
      const jobs = sections.find(section => section.name === 'platform_jobs');
      if (jobs.status !== 'complete') { nested.status = 'incomplete'; nested.warning = 'La lista de jobs padre está incompleta.'; }
      for (const job of jobs.records) for (const child of ['scopes', 'asset_sources']) {
        assertActive();
        if (exhausted || count >= maxRecords) { nested.status = 'limited'; break; }
        const path = `platform_jobs/${job.id}/${child}`;
        let cursor;
        try {
          do {
            const remaining = Math.min(200, maxRecords - count);
            const page = await getDocsFromServer(query(collection(database, path), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(remaining)));
            assertActive();
            for (const row of page.docs) if (!append(nested.records, { ...row.data(), id: row.id, $path: `${path}/${row.id}` }, 'platform_job_children')) { nested.status = 'limited'; break; }
            onProgress({ collection: path, count });
            if (exhausted || count >= maxRecords) { nested.status = 'limited'; break; }
            cursor = page.size === remaining ? page.docs.at(-1) : null;
          } while (cursor);
        } catch (error) {
          assertActive();
          if (!['permission-denied', 'failed-precondition', 'unavailable'].includes(String(error.code).replace('firestore/', ''))) throw error;
          nested.status = 'incomplete'; nested.warning = 'Una subcolección conocida no se pudo leer completamente.';
        }
      }
      sections.push(nested, { name: 'unverified_subcollections', records: [], status: 'not-read', warning: 'El SDK web no enumera subcolecciones desconocidas ni padres ausentes. Revisar recursivamente en Console; este archivo no autoriza ninguna purga.' });
      assertActive();
      if (redacted.length) warnings.push(`Campos sensibles/no soportados omitidos: ${redacted.length}.`);
      warnings.push('Lectura exclusiva SuperAdmin mediante permiso temporal del negocio seleccionado (10 minutos). No concede escrituras financieras ni borrados. Las referencias inventariadas no prueban propiedad del documento destino.');
      return { sections, warnings };
    });
  };
}
