import { pathToFileURL } from 'node:url';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { ensureLegacyPaymentsMigrated } from '../src/contracts/legacyLedger.js';
import { financialProjection } from '../src/contracts/domain/contractModel.js';
import { migrateLegacyContractImages } from './legacyContractImages.mjs';

export function migrationOptions(args) {
  const options = { dryRun: true, limit: 100, cursor: null, businessId: null };
  for (let index = 0; index < args.length; index++) {
    let arg = args[index];
    if (['--business', '--limit', '--cursor'].includes(arg)) arg += '=' + (args[++index] ?? '');
    if (arg === '--apply') options.dryRun = false;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--business=')) options.businessId = arg.slice(11);
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice(8));
    else if (arg.startsWith('--cursor=')) options.cursor = arg.slice(9);
    else throw new Error('Argumento de migración inválido.');
  }
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 10000) throw new Error('Límite inválido (1–10000).');
  for (const value of [options.businessId, options.cursor]) if (value !== null && (value.includes('/') || !value.trim())) throw new Error('ID inválido.');
  return options;
}

export async function runContractMigration({ database, bucket, dryRun = true, businessId = null, limit = 100, cursor = null }) {
  const summary = { scanned: 0, migrated: 0, skipped: 0, manualReview: 0, errors: 0, nextCursor: null };
  const markerRef = !dryRun && businessId ? database.doc('contract_migrations/' + businessId) : null;
  const previousMarker = markerRef ? (await markerRef.get()).data() : null;
  const continuation = cursor && previousMarker?.cursor === cursor && previousMarker.startedFromBeginning;
  let last = cursor;
  while (summary.scanned < limit) {
    let query = database.collection('contracts').orderBy(FieldPath.documentId()).limit(Math.min(50, limit - summary.scanned));
    if (businessId) query = query.where('businessId', '==', businessId);
    if (last) query = query.startAfter(last);
    const page = await query.get();
    if (page.empty) { summary.nextCursor = null; break; }
    for (const snapshot of page.docs) {
      summary.scanned++; last = snapshot.id; summary.nextCursor = last;
      try {
        let inferred = false;
        let remaining = true, changed = false;
        while (remaining) {
          const result = await database.runTransaction(async transaction => {
            const current = await transaction.get(snapshot.ref);
            const contract = current.data();
            if (!contract || (businessId && contract.businessId !== businessId)) return { changed: false, remaining: false };
            const ledger = await ensureLegacyPaymentsMigrated(transaction, database, snapshot.ref, contract, { maxNewPayments: 10000 });
            inferred ||= ledger.payments.some(payment => payment.branchResolution === 'inferred-contract');
            const needsMigration = Object.keys(ledger.migration).length > 0
              || (contract.status === 'cancelado' && contract.balance !== 0);
            if (!dryRun && needsMigration) {
              ledger.write(200);
              if (ledger.missing.length <= 200) transaction.update(snapshot.ref, { ...ledger.migration,
                ...financialProjection(contract.total, ledger.payments, contract.status), updatedAt: Timestamp.now() });
            }
            return { changed: needsMigration, remaining: !dryRun && ledger.missing.length > 200 };
          });
          changed ||= result.changed; remaining = result.remaining;
        }
        const images = await migrateLegacyContractImages({ database, bucket, contractId: snapshot.id, contract: snapshot.data(), dryRun });
        if (changed || images.changed) summary.migrated++; else summary.skipped++;
        if (inferred) summary.manualReview++;
      } catch (error) {
        if (['migration-required', 'invalid-ledger'].includes(error.code)) summary.manualReview++;
        else summary.errors++;
      }
    }
    if (page.size < 50 && summary.scanned < limit) { summary.nextCursor = null; break; }
  }
  if (markerRef) {
    const startedFromBeginning = !cursor || !!continuation;
    const needsReview = summary.errors > 0 || summary.manualReview > 0 || (!!continuation && previousMarker.needsReview);
    await markerRef.set({ businessId, cursor: summary.nextCursor, startedFromBeginning, needsReview,
      complete: startedFromBeginning && !summary.nextCursor && !needsReview, updatedAt: Timestamp.now() });
  }
  return summary;
}

async function main() {
  const options = migrationOptions(process.argv.slice(2));
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) throw new Error('Define GCLOUD_PROJECT explícitamente.');
  const emulated = !!(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_STORAGE_EMULATOR_HOST);
  if (emulated && (!projectId.startsWith('demo-') || !process.env.FIRESTORE_EMULATOR_HOST
    || !process.env.FIREBASE_STORAGE_EMULATOR_HOST)) throw new Error('Los tests requieren proyecto demo y ambos emuladores.');
  if (!options.dryRun && !emulated && process.env.MIGAPOS_MIGRATION_PROJECT !== projectId) {
    throw new Error('Para aplicar fuera de emuladores define MIGAPOS_MIGRATION_PROJECT con el proyecto aprobado.');
  }
  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getStorage } = await import('firebase-admin/storage');
  const app = initializeApp({ projectId, storageBucket: process.env.MIGAPOS_STORAGE_BUCKET || `${projectId}.appspot.com` });
  process.stdout.write(JSON.stringify(await runContractMigration({ database: getFirestore(app), bucket: getStorage(app).bucket(), ...options })) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { process.stderr.write('Migración no completada: revisa configuración y argumentos.\n'); process.exitCode = 1; });
}
