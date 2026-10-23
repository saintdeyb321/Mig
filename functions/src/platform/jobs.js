import { randomUUID } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { requirePlatformAdmin } from './access.js';
import { fail, hash, inputOnly, platformAudit } from './administration.js';
import { documentId } from '../sales/domain/saleModel.js';
import { BACKUP_SCHEMA, SCOPED_COLLECTIONS, MASTER_COLLECTIONS, ASSET_PREFIXES, checksum, documentRecord, dryRunPart, validateManifest } from './backupFormat.js';
import { subtreeDocumentPage } from './firestorePages.js';

const PAGE = 20, LEASE_MS = 120000;
const key = index => String(index).padStart(9, '0');
const root = job => `platform-backups/${job.businessId}/${job.id}/`;
const indexName = (job, index) => root(job) + 'index/' + key(index) + '.json';
const json = data => Buffer.from(JSON.stringify(data));
const timestamp = now => Timestamp.fromMillis(now);
const mergeCounts = (left, right) => { const result = { ...left }; for (const [name, count] of Object.entries(right)) result[name] = (result[name] ?? 0) + count; return result; };

export function createPlatformJobs(db, bucket, auth, { now = Date.now, beforeCheckpoint = async () => {}, onError = () => {} } = {}) {
  const jobRef = id => db.doc(`platform_jobs/${documentId(id)}`);
  async function claim(id) {
    const token = randomUUID();
    return db.runTransaction(async tx => {
      const ref = jobRef(id), job = (await tx.get(ref)).data();
      if (!job || !['queued', 'running'].includes(job.status) || job.leaseUntil?.toMillis() > now()) return null;
      const next = { ...job, status: 'running', leaseToken: token, leaseUntil: timestamp(now() + LEASE_MS), attempts: (job.attempts ?? 0) + 1 };
      tx.update(ref, { status: next.status, leaseToken: token, leaseUntil: next.leaseUntil, attempts: next.attempts });
      return next;
    });
  }
  async function checkpoint(job, changes, write = () => {}) {
    await beforeCheckpoint(job);
    return db.runTransaction(async tx => {
      const ref = jobRef(job.id), current = (await tx.get(ref)).data();
      if (current?.leaseToken !== job.leaseToken || current.leaseUntil?.toMillis() <= now()) throw new Error('job-lease-lost');
      // All reads for the unit precede this callback's mutations.
      await write(tx);
      tx.update(ref, { status: 'queued', leaseToken: null, leaseUntil: null, unit: job.unit + 1,
        updatedAt: timestamp(now()), lastError: null, ...changes });
    });
  }
  async function save(name, bytes, contentType = 'application/json') {
    await bucket.file(name).save(bytes, { resumable: false, metadata: { contentType, cacheControl: 'private, no-store' } });
  }
  async function addParts(job, parts, changes, tasks = []) {
    let indexHash = job.indexHash ?? '';
    for (let i = 0; i < parts.length; i++) {
      const index = job.partCount + i, part = parts[i];
      await save(root(job) + part.descriptor.object, part.bytes, part.descriptor.contentType);
      await save(indexName(job, index), json(part.descriptor));
      indexHash = hash([indexHash, part.descriptor]);
    }
    await checkpoint(job, { ...changes, partCount: job.partCount + parts.length, indexHash }, tx => {
      for (const task of tasks) tx.set(jobRef(job.id).collection('scopes').doc(hash(task.path)), task, { merge: true });
      for (const { descriptor } of parts) if (descriptor.kind === 'asset') tx.set(jobRef(job.id).collection('asset_sources').doc(hash(descriptor.source)), { source: descriptor.source, generation: descriptor.generation });
    });
  }
  async function childScopes(job, docs) {
    const tasks = [];
    for (const doc of docs) {
      const collections = await doc.ref.listCollections();
      if (collections.length > 100) throw new Error('too-many-subcollections-review-required');
      for (const collection of collections) tasks.push({ path: collection.path, cursor: null, done: false });
    }
    return tasks;
  }
  function scopedQuery(collection, businessId, cursor) {
    let query = db.collection(collection).where('businessId', '==', businessId).orderBy(FieldPath.documentId()).limit(PAGE);
    if (cursor) query = query.startAfter(cursor);
    return query;
  }
  async function readDocumentPage(job) {
    if (job.collectionIndex < SCOPED_COLLECTIONS.length) {
      const collection = SCOPED_COLLECTIONS[job.collectionIndex];
      const page = await scopedQuery(collection, job.businessId, job.cursor).get();
      const master = !job.cursor && MASTER_COLLECTIONS.includes(collection) ? await db.doc(`${collection}/${job.businessId}`).get() : null;
      const docs = page.docs.filter(doc => !(MASTER_COLLECTIONS.includes(collection) && doc.id === job.businessId) && !(collection === 'users' && doc.data().role === 'superadmin'));
      const allDocs = [...docs];
      if (master) { allDocs.push(master); if (master.exists) docs.push(master); }
      const more = page.size === PAGE;
      return { docs, allDocs, collection, changes: { collectionIndex: job.collectionIndex + (more ? 0 : 1), cursor: more ? page.docs.at(-1).id : null } };
    }
    const tasks = await jobRef(job.id).collection('scopes').where('done', '==', false).limit(1).get();
    if (tasks.empty) return null;
    const taskDoc = tasks.docs[0], task = taskDoc.data();
    const page = await subtreeDocumentPage(db, task.path, task.cursor), docs = page.docs.filter(doc => doc.exists);
    for (const doc of docs) if (doc.data().businessId && doc.data().businessId !== job.businessId) throw new Error('foreign-subcollection-review-required');
    return { docs, allDocs: page.docs, collection: task.path.split('/')[0] + '/**', taskDoc, task,
      taskUpdate: { ...task, cursor: page.next, done: !page.next }, changes: {} };
  }
  async function backupDocuments(job) {
    const page = await readDocumentPage(job);
    if (!page) return checkpoint(job, { phase: 'assets', prefixIndex: 0, cursor: null });
    const tasks = await childScopes(job, page.allDocs ?? page.docs);
    if (page.taskDoc) tasks.push(page.taskUpdate);
    const parts = page.docs.map((doc, index) => {
      const bytes = json([documentRecord(doc)]);
      return { bytes, descriptor: { kind: 'documents', object: `data/${key(job.partCount + index)}.json`, count: 1, bytes: bytes.length, sha256: checksum(bytes), collection: page.collection } };
    });
    await addParts(job, parts, { ...page.changes, counts: mergeCounts(job.counts, { [page.collection]: page.docs.length }) }, tasks);
  }
  async function listAssets(job) {
    const prefixes = ASSET_PREFIXES(job.businessId);
    if ((job.prefixIndex ?? 0) >= prefixes.length) return null;
    const [files, next] = await bucket.getFiles({ prefix: prefixes[job.prefixIndex ?? 0], maxResults: 5, autoPaginate: false,
      ...(job.cursor ? { pageToken: job.cursor } : {}) });
    return { files, changes: { cursor: next?.pageToken ?? null, prefixIndex: (job.prefixIndex ?? 0) + (next?.pageToken ? 0 : 1) } };
  }
  async function backupAssets(job) {
    const page = await listAssets(job);
    if (!page) return checkpoint(job, { phase: 'verify', verifyIndex: 0, verifyHash: '', verifyCounts: {}, verifyAssets: 0 });
    const parts = [];
    for (const file of page.files) {
      const [metadata] = await file.getMetadata();
      if (Number(metadata.size) > 6 * 1024 * 1024) throw new Error('oversized-legacy-asset-review-required');
      const [bytes] = await file.download();
      const [after] = await file.getMetadata();
      if (metadata.generation !== after.generation) throw new Error('asset-changed-during-backup');
      const descriptor = { kind: 'asset', object: `assets/${key(job.partCount + parts.length)}.bin`, source: file.name,
        generation: String(metadata.generation), contentType: metadata.contentType ?? 'application/octet-stream',
        metadata: { contentType: metadata.contentType ?? null, cacheControl: metadata.cacheControl ?? null,
          custom: Object.fromEntries(Object.entries(metadata.metadata ?? {}).filter(([name]) => name !== 'firebaseStorageDownloadTokens')) },
        bytes: bytes.length, count: 1, sha256: checksum(bytes) };
      parts.push({ bytes, descriptor });
    }
    await addParts(job, parts, { ...page.changes, storageCount: job.storageCount + parts.length });
  }
  async function readPart(backup, index) {
    const [indexBytes] = await bucket.file(indexName(backup, index)).download();
    const descriptor = JSON.parse(indexBytes.toString('utf8'));
    if (typeof descriptor.object !== 'string' || !/^(data\/\d{9}\.json|assets\/\d{9}\.bin)$/.test(descriptor.object)) throw new Error('invalid-backup-object');
    const [bytes] = await bucket.file(root(backup) + descriptor.object).download();
    const result = dryRunPart(bytes, descriptor, { businessId: backup.businessId, projectId: db.projectId });
    return { descriptor, result, bytes };
  }
  async function verify(job) {
    const backup = job.kind === 'backup' ? job : (await jobRef(job.backupId).get()).data();
    if (!backup || backup.businessId !== job.businessId) throw new Error('invalid-backup-tenant');
    let verifyHash = job.verifyHash ?? '', verifyCounts = job.verifyCounts ?? {}, verifyAssets = job.verifyAssets ?? 0;
    const end = Math.min(backup.partCount, (job.verifyIndex ?? 0) + PAGE);
    for (let index = job.verifyIndex ?? 0; index < end; index++) {
      const { descriptor, result } = await readPart(backup, index);
      if (job.kind === 'backup' && descriptor.kind === 'asset') {
        const [source] = await bucket.file(descriptor.source).getMetadata();
        if (String(source.generation) !== descriptor.generation) throw new Error('asset-changed-during-backup');
      }
      verifyHash = hash([verifyHash, descriptor]);
      verifyAssets += result.assets;
      if (descriptor.kind === 'documents') verifyCounts = mergeCounts(verifyCounts, { [descriptor.collection]: result.documents });
    }
    const changes = { verifyIndex: end, verifyHash, verifyCounts, verifyAssets };
    if (end < backup.partCount) return checkpoint(job, changes);
    // Empty collections contribute zero and need not have a physical part.
    const nonzero = counts => Object.fromEntries(Object.entries(counts).filter(([, n]) => n).sort(([a], [b]) => a.localeCompare(b)));
    if (verifyHash !== (backup.indexHash ?? '') || verifyAssets !== backup.storageCount || JSON.stringify(nonzero(verifyCounts)) !== JSON.stringify(nonzero(backup.counts))) throw new Error('backup-manifest-count-mismatch');
    if (job.kind !== 'backup') {
      const [bytes] = await bucket.file(root(backup) + 'manifest.json').download();
      if (checksum(bytes) !== backup.manifestHash) throw new Error('backup-manifest-checksum-mismatch');
      validateManifest(JSON.parse(bytes.toString('utf8')), job.businessId);
      return checkpoint(job, { ...changes, phase: job.kind === 'purge' ? 'purge-assets' : 'finished', prefixIndex: 0, cursor: null,
        ...(job.kind === 'restore-dry-run' ? { status: 'completed', verifiedAt: timestamp(now()), dryRun: true, writes: 0 } : {}) });
    }
    return checkpoint(job, { ...changes, phase: 'verify-assets', cursor: null, prefixIndex: 0, inventoryCount: 0 });
  }
  async function verifyAssetInventory(job) {
    const page = await listAssets(job);
    if (page) {
      for (const file of page.files) {
        const source = (await jobRef(job.id).collection('asset_sources').doc(hash(file.name)).get()).data();
        const [metadata] = await file.getMetadata();
        if (!source || source.generation !== String(metadata.generation)) throw new Error('asset-inventory-changed');
      }
      return checkpoint(job, { ...page.changes, inventoryCount: job.inventoryCount + page.files.length });
    }
    if (job.inventoryCount !== job.storageCount) throw new Error('asset-inventory-count-mismatch');
    const manifest = { schemaVersion: BACKUP_SCHEMA, businessId: job.businessId, jobId: job.id, projectId: db.projectId,
      createdAt: job.createdAt.toDate().toISOString(), completedAt: new Date(now()).toISOString(),
      consistency: 'tenant-write-fence + immutable Firestore wire records + Storage generation checks',
      counts: job.counts, storageCount: job.storageCount, partCount: job.partCount, indexHash: job.indexHash ?? '',
      indexPattern: 'index/{9-digit-index}.json', format: 'Firestore Document protobuf JSON with tagged bytes/special doubles',
      authRecovery: 'Profiles retain their Auth UIDs. Auth credentials are intentionally excluded; recover identities separately.',
      deletionRequestId: job.deletionRequestId ?? null };
    const bytes = json(manifest);
    await save(root(job) + 'manifest.json', bytes);
    await checkpoint(job, { phase: 'finished', status: 'completed', verifiedAt: timestamp(now()), manifestHash: checksum(bytes) }, async tx => {
      const ref = db.doc(`tenants/${job.businessId}`), tenant = (await tx.get(ref)).data();
      if (tenant?.maintenanceJobId !== job.id) throw new Error('tenant-fence-lost');
      tx.update(ref, { maintenanceJobId: null, lastBackupId: job.id });
      tx.update(db.doc(`licenses/${job.businessId}`), { maintenanceJobId: null });
      platformAudit(tx, db, job.id, job.actorId, 'backup', job.businessId, 'verified', now());
    });
  }
  async function purgeAssets(job) {
    if (!job.backupScopesCopied) {
      let query = jobRef(job.backupId).collection('scopes').orderBy(FieldPath.documentId()).limit(PAGE);
      if (job.scopeCursor) query = query.startAfter(job.scopeCursor);
      const page = await query.get();
      return checkpoint(job, { backupScopesCopied: page.size !== PAGE, scopeCursor: page.size === PAGE ? page.docs.at(-1).id : null }, tx => {
        for (const doc of page.docs) tx.set(jobRef(job.id).collection('scopes').doc(doc.id), { path: doc.data().path, done: false, cursor: null });
      });
    }
    if (!job.tenantScopesInitialized) {
      const tenant = await db.doc(`tenants/${job.businessId}`).get();
      const tasks = await childScopes(job, [tenant]);
      return checkpoint(job, { tenantScopesInitialized: true }, tx => { for (const task of tasks) tx.set(jobRef(job.id).collection('scopes').doc(hash(task.path)), task); });
    }
    // Always repeat the first page: deleted keys cannot be skipped by a stale page token.
    const prefixes = ASSET_PREFIXES(job.businessId);
    if ((job.prefixIndex ?? 0) >= prefixes.length) return checkpoint(job, { phase: 'purge-documents', collectionIndex: 0, cursor: null });
    const [files] = await bucket.getFiles({ prefix: prefixes[job.prefixIndex ?? 0], maxResults: PAGE, autoPaginate: false });
    for (const file of files) await file.delete({ ignoreNotFound: true });
    return checkpoint(job, { prefixIndex: (job.prefixIndex ?? 0) + (files.length ? 0 : 1) });
  }
  async function purgeDocuments(job) {
    // Identity, license and masters are removed last, after every other scoped collection and subtree.
    const order = SCOPED_COLLECTIONS.filter(name => !['users', 'tenants', 'licenses', 'settings', 'contract_migrations'].includes(name));
    if (job.collectionIndex >= order.length) return purgeChildren(job);
    const collection = order[job.collectionIndex], page = await scopedQuery(collection, job.businessId, null).get();
    const tasks = await childScopes(job, page.docs);
    await checkpoint(job, { collectionIndex: job.collectionIndex + (page.empty ? 1 : 0) }, tx => {
      for (const task of tasks) tx.set(jobRef(job.id).collection('scopes').doc(hash(task.path)), task, { merge: true });
      for (const doc of page.docs) tx.delete(doc.ref);
    });
  }
  async function purgeChildren(job) {
    const tasks = await jobRef(job.id).collection('scopes').where('done', '==', false).limit(1).get();
    if (tasks.empty) return checkpoint(job, { phase: 'purge-identities' });
    const task = tasks.docs[0], page = await db.collection(task.data().path).orderBy(FieldPath.documentId()).limit(PAGE).get();
    for (const doc of page.docs) if (doc.data().businessId && doc.data().businessId !== job.businessId) throw new Error('foreign-subcollection-review-required');
    const children = await childScopes(job, page.docs);
    return checkpoint(job, {}, tx => {
      for (const child of children) tx.set(jobRef(job.id).collection('scopes').doc(hash(child.path)), child, { merge: true });
      for (const doc of page.docs) tx.delete(doc.ref);
      if (page.empty) tx.update(task.ref, { done: true });
    });
  }
  async function purgeIdentities(job) {
    let query = db.collection('users').where('businessId', '==', job.businessId).orderBy(FieldPath.documentId()).limit(PAGE);
    if (job.identityCursor) query = query.startAfter(job.identityCursor);
    const page = await query.get();
    const docs = page.docs.filter(doc => doc.data().role !== 'superadmin' && doc.id !== job.actorId);
    for (const doc of docs) {
      // Re-read the protected mapping immediately before Auth deletion. Never select by email or client UID.
      const current = (await doc.ref.get()).data();
      if (current?.businessId !== job.businessId || current.role === 'superadmin') throw new Error('identity-scope-changed');
      try { await auth.deleteUser(doc.id); } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
      const children = await childScopes(job, [doc]);
      await checkpoint(job, { phase: 'purge-documents', identityCursor: doc.id }, tx => {
        for (const child of children) tx.set(jobRef(job.id).collection('scopes').doc(hash(child.path)), child, { merge: true });
        tx.delete(doc.ref);
      });
      // One Auth identity per unit makes a crash after Auth deletion safe to repeat.
      return;
    }
    if (page.size === PAGE && !docs.length) return checkpoint(job, { identityCursor: page.docs.at(-1).id });
    return checkpoint(job, { phase: 'purge-masters', masterIndex: 0 });
  }
  async function purgeMasters(job) {
    const masters = ['contract_migrations', 'settings', 'licenses'];
    if ((job.masterIndex ?? 0) >= masters.length) return checkpoint(job, { phase: 'final-check', collectionIndex: 0 });
    const collection = masters[job.masterIndex ?? 0], page = await scopedQuery(collection, job.businessId, null).get();
    const master = await db.doc(`${collection}/${job.businessId}`).get();
    const docs = [...page.docs.filter(doc => doc.id !== job.businessId), master].filter(doc => doc.exists);
    const children = await childScopes(job, docs);
    if (children.length) {
      // Clean master subtrees before deleting the master itself.
      const backupScopes = jobRef(job.id).collection('scopes');
      const newTasks = [];
      for (const child of children) if (!(await backupScopes.doc(hash(child.path)).get()).exists) newTasks.push(child);
      if (newTasks.length) return checkpoint(job, { phase: 'purge-documents' }, tx => { for (const child of newTasks) tx.set(backupScopes.doc(hash(child.path)), child); });
    }
    return checkpoint(job, { masterIndex: (job.masterIndex ?? 0) + (page.empty || (page.size === 1 && page.docs[0].id === job.businessId) ? 1 : 0) }, tx => { for (const doc of docs) tx.delete(doc.ref); });
  }
  async function finalCheck(job) {
    if (job.collectionIndex < SCOPED_COLLECTIONS.length) {
      const name = SCOPED_COLLECTIONS[job.collectionIndex];
      if (name === 'tenants') {
        const page = await scopedQuery(name, job.businessId, null).get();
        if (page.docs.some(doc => doc.id !== job.businessId)) throw new Error('purge-verification-found-extra-tenant-metadata');
      } else {
        const page = await scopedQuery(name, job.businessId, null).get();
        if (page.docs.some(doc => name !== 'users' || doc.data().role !== 'superadmin')) throw new Error('purge-verification-found-documents');
        if (MASTER_COLLECTIONS.includes(name) && (await db.doc(`${name}/${job.businessId}`).get()).exists) throw new Error('purge-verification-found-master');
      }
      return checkpoint(job, { collectionIndex: job.collectionIndex + 1 });
    }
    for (const prefix of ASSET_PREFIXES(job.businessId)) if ((await bucket.getFiles({ prefix, maxResults: 1, autoPaginate: false }))[0].length) throw new Error('purge-verification-found-assets');
    const unfinished = await jobRef(job.id).collection('scopes').where('done', '==', false).limit(1).get();
    if (!unfinished.empty) throw new Error('purge-verification-found-subtrees');
    await checkpoint(job, { phase: 'finished', status: 'completed', completedAt: timestamp(now()) }, async tx => {
      const ref = db.doc(`tenants/${job.businessId}`), tenant = (await tx.get(ref)).data();
      if (tenant?.purgeJobId !== job.id || tenant.status !== 'deleting') throw new Error('purge-fence-lost');
      // Minimal non-sensitive tombstone prevents accidental reactivation and records completion.
      tx.set(ref, { businessId: job.businessId, status: 'deleted', deletedAt: timestamp(now()) });
      platformAudit(tx, db, job.id, job.actorId, 'purge', job.businessId, 'completed', now());
    });
  }
  async function runUnit(id) {
    const job = await claim(id);
    if (!job) return false;
    try {
      if (job.phase === 'documents') await backupDocuments(job);
      else if (job.phase === 'assets') await backupAssets(job);
      else if (job.phase === 'verify') await verify(job);
      else if (job.phase === 'verify-assets') await verifyAssetInventory(job);
      else if (job.phase === 'purge-assets') await purgeAssets(job);
      else if (job.phase === 'purge-documents') await purgeDocuments(job);
      else if (job.phase === 'purge-identities') await purgeIdentities(job);
      else if (job.phase === 'purge-masters') await purgeMasters(job);
      else if (job.phase === 'final-check') await finalCheck(job);
      else throw new Error('unknown-job-phase');
      return true;
    } catch (error) {
      onError(error);
      // Store only a sanitized code. Payloads, email addresses and SDK diagnostics stay out of logs.
      const code = /^[a-z-]{3,80}$/.test(error.message) ? error.message : 'job-unit-failed';
      await db.runTransaction(async tx => {
        const current = (await tx.get(jobRef(id))).data();
        if (current?.leaseToken !== job.leaseToken) return;
        tx.update(jobRef(id), { status: 'failed', lastError: code, leaseToken: null, leaseUntil: null, updatedAt: timestamp(now()) });
        platformAudit(tx, db, id + '-failure-' + job.unit, job.actorId, job.kind, job.businessId, code, now());
      });
      return false;
    }
  }
  async function sweep() {
    // Recovery after process death: expired running leases and queued jobs are both eligible.
    const [queued, expired] = await Promise.all([
      db.collection('platform_jobs').where('status', '==', 'queued').limit(5).get(),
      db.collection('platform_jobs').where('status', '==', 'running').where('leaseUntil', '<=', timestamp(now())).limit(5).get(),
    ]);
    for (const doc of [...queued.docs, ...expired.docs]) await runUnit(doc.id);
  }
  async function getPlatformJob(request) {
    await requirePlatformAdmin(db, db, request.auth?.uid);
    const data = inputOnly(request.data, ['jobId', 'indexCursor']);
    const job = (await jobRef(data.jobId).get()).data();
    if (!job) fail('Job inexistente.');
    return { id: job.id, businessId: job.businessId, kind: job.kind, status: job.status, phase: job.phase,
      unit: job.unit, lastError: job.lastError ?? null, partCount: job.partCount, verified: !!job.verifiedAt,
      counts: job.counts, storageCount: job.storageCount, writes: job.kind === 'restore-dry-run' ? 0 : null };
  }
  async function retryPlatformJob(request) {
    const data = inputOnly(request.data, ['jobId']);
    await db.runTransaction(async tx => {
      const actor = await requirePlatformAdmin(tx, db, request.auth?.uid), ref = jobRef(data.jobId), job = (await tx.get(ref)).data();
      if (!job || job.status !== 'failed') fail('Solo se pueden reintentar jobs fallidos.');
      tx.update(ref, { status: 'queued', unit: job.unit + 1, lastError: null });
      platformAudit(tx, db, job.id + '-retry-' + job.unit, actor.uid, 'retryJob', job.businessId, 'accepted', now());
    });
    return { accepted: true };
  }
  async function startRestoreDryRun(request) {
    const data = inputOnly(request.data, ['backupId']), id = randomUUID();
    return db.runTransaction(async tx => {
      const actor = await requirePlatformAdmin(tx, db, request.auth?.uid), backup = (await tx.get(jobRef(data.backupId))).data();
      if (!backup || backup.kind !== 'backup' || backup.status !== 'completed' || !backup.verifiedAt) fail('Backup no verificado.');
      tx.create(jobRef(id), { id, businessId: backup.businessId, kind: 'restore-dry-run', backupId: backup.id, actorId: actor.uid,
        status: 'queued', phase: 'verify', unit: 0, partCount: 0, verifyIndex: 0, leaseUntil: null, attempts: 0, createdAt: timestamp(now()) });
      platformAudit(tx, db, id, actor.uid, 'restore-dry-run', backup.businessId, 'accepted', now());
      return { jobId: id, businessId: backup.businessId, dryRun: true };
    });
  }
  async function cancelPlatformBackup(request) {
    const data = inputOnly(request.data, ['jobId']);
    return db.runTransaction(async tx => {
      const actor = await requirePlatformAdmin(tx, db, request.auth?.uid), ref = jobRef(data.jobId), job = (await tx.get(ref)).data();
      if (!job || job.kind !== 'backup' || ['completed', 'cancelled'].includes(job.status)) fail('Solo se puede cancelar un backup pendiente.');
      const tenantRef = db.doc(`tenants/${job.businessId}`), tenant = (await tx.get(tenantRef)).data();
      if (tenant?.maintenanceJobId !== job.id) fail('El tenant ya no pertenece a este job.');
      // Invalidate the lease before releasing the fence: an old worker cannot certify a mixed copy.
      tx.update(ref, { status: 'cancelled', leaseToken: null, leaseUntil: null, updatedAt: timestamp(now()) });
      tx.update(tenantRef, { maintenanceJobId: null });
      tx.update(db.doc(`licenses/${job.businessId}`), { maintenanceJobId: null });
      platformAudit(tx, db, job.id + '-cancel', actor.uid, 'cancelBackup', job.businessId, 'cancelled', now());
      return { businessId: job.businessId, cancelled: true };
    });
  }
  async function getBackupDownload(request) {
    await requirePlatformAdmin(db, db, request.auth?.uid);
    const data = inputOnly(request.data, ['backupId', 'index']);
    const job = (await jobRef(data.backupId).get()).data();
    if (job?.kind !== 'backup' || job.status !== 'completed' || !job.verifiedAt) fail('Backup no verificado.');
    if (data.index !== undefined && (!Number.isInteger(data.index) || data.index < 0 || data.index >= job.partCount)) fail('Índice inválido.');
    let name = 'manifest.json', descriptor, bytes;
    if (data.index !== undefined) { ({ descriptor, bytes } = await readPart(job, data.index)); name = descriptor.object; }
    else {
      [bytes] = await bucket.file(root(job) + name).download();
      if (checksum(bytes) !== job.manifestHash) throw new Error('backup-manifest-checksum-mismatch');
      validateManifest(JSON.parse(bytes.toString()), job.businessId);
    }
    if (bytes.length > 6 * 1024 * 1024) fail('Parte demasiado grande para descargar mediante el canal administrativo.');
    // Keep bytes behind the authenticated callable in emulators AND production. No public token,
    // signed-URL IAM dependency or reusable remote URL is created. One bounded artifact per call.
    return { base64: bytes.toString('base64'), contentType: descriptor?.contentType ?? 'application/json',
      name, sha256: checksum(bytes), descriptor: descriptor ?? null, partCount: job.partCount };
  }
  return { runUnit, sweep, getPlatformJob, retryPlatformJob, startRestoreDryRun, getBackupDownload, cancelPlatformBackup, readPart };
}
