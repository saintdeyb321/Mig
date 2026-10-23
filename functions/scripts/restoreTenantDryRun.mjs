import { pathToFileURL } from 'node:url';
import { checksum, dryRunPart, validateManifest } from '../src/platform/backupFormat.js';
import { hash } from '../src/platform/administration.js';

// Standalone artifact verification: no Firestore/Auth write API and no restoration mode.
export async function restoreTenantDryRun({ readObject, businessId, backupId, projectId, expectedManifestHash }) {
  if (!/^[A-Za-z0-9_-]+$/.test(businessId) || !/^[A-Za-z0-9_-]+$/.test(backupId)) throw new Error('invalid-backup-target');
  const prefix = `platform-backups/${businessId}/${backupId}/`, bytes = await readObject(prefix + 'manifest.json');
  if (expectedManifestHash && checksum(bytes) !== expectedManifestHash) throw new Error('backup-manifest-checksum-mismatch');
  const manifest = validateManifest(JSON.parse(bytes.toString()), businessId);
  if (manifest.projectId !== projectId || manifest.jobId !== backupId) throw new Error('backup-project-mismatch');
  let indexHash = '', documents = 0, assets = 0; const counts = {};
  for (let index = 0; index < manifest.partCount; index++) {
    const descriptor = JSON.parse((await readObject(prefix + `index/${String(index).padStart(9, '0')}.json`)).toString());
    if (!/^(data\/\d{9}\.json|assets\/\d{9}\.bin)$/.test(descriptor.object)) throw new Error('invalid-backup-object');
    const result = dryRunPart(await readObject(prefix + descriptor.object), descriptor, { businessId, projectId });
    indexHash = hash([indexHash, descriptor]); documents += result.documents; assets += result.assets;
    if (descriptor.kind === 'documents') counts[descriptor.collection] = (counts[descriptor.collection] ?? 0) + result.documents;
  }
  for (const [collection, count] of Object.entries(manifest.counts)) if ((counts[collection] ?? 0) !== count) throw new Error('backup-count-mismatch');
  if (Object.keys(counts).some(collection => !(collection in manifest.counts)) || indexHash !== manifest.indexHash || assets !== manifest.storageCount) throw new Error('backup-index-mismatch');
  return { dryRun: true, restorable: true, documents, assets, writes: 0, manifestHash: checksum(bytes),
    identityRecoveryRequired: true, administrativeStateRequiresReview: true };
}

export function restoreOptions(args, env = process.env) {
  const options = { dryRun: true };
  for (const arg of args) {
    const match = /^--(project|business|backup|bucket|confirm|manifest-hash)=(.+)$/.exec(arg);
    if (match) options[match[1]] = match[2];
    else if (arg === '--dry-run') continue;
    else if (arg === '--authorize-read') options.authorized = true;
    else throw new Error('Solo se admite restore dry-run. Argumento inválido.');
  }
  if (!options.project || !options.business || !options.backup || !options.bucket || options.confirm !== options.business
    || env.GCLOUD_PROJECT !== options.project || !options.authorized) throw new Error('Requiere project ID comprobado, autorización de lectura y confirmación exacta del tenant.');
  if (options.project.startsWith('demo-') && (env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9199')) throw new Error('El proyecto demo requiere emuladores locales.');
  if (!options.project.startsWith('demo-') && (env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_STORAGE_EMULATOR_HOST)) throw new Error('No se admite mezclar proyecto real y emuladores.');
  return options;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = restoreOptions(process.argv.slice(2));
  const { initializeApp } = await import('firebase-admin/app');
  const { getStorage } = await import('firebase-admin/storage');
  const app = initializeApp({ projectId: options.project, storageBucket: options.bucket });
  const result = await restoreTenantDryRun({ businessId: options.business, backupId: options.backup, projectId: options.project,
    expectedManifestHash: options['manifest-hash'], readObject: async path => (await getStorage(app).bucket().file(path).download())[0] });
  process.stdout.write(JSON.stringify(result) + '\n');
}
