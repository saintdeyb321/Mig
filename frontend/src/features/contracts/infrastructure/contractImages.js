import { doc, getDoc } from 'firebase/firestore/lite';
import { auth, db } from '../../../core/firebase/client.js';
import { getServerReadDatabase } from '../../../core/firebase/serverReadDatabase.js';
import offlineDB from '../../../offlineDB.js';
import { safeImageUrl } from '../../../shared/security/html.js';
import { imageCanvas, MAX_RASTER_INPUT_BYTES } from '../../../shared/images/raster.js';
import { createContractMediaRepository, imageHash } from './contractMediaRepository.js';
import { contractMediaId, LOCAL_IMAGE, MAX_CONTRACT_IMAGES, MAX_CONTRACT_IMAGE_BYTES, MAX_CONTRACT_IMAGE_DIMENSION,
  MEDIA_PREFIX, TARGET_CONTRACT_IMAGE_BYTES } from '../application/contractImagePolicy.js';

export { MAX_CONTRACT_IMAGES };
export const MAX_IMAGE_BYTES = MAX_RASTER_INPUT_BYTES;
const imageKey = (uid, reference) => `contract-image:${uid}:${reference}`;
const jobPrefix = ({ uid, businessId, contractId }) => `contract-media:${uid}:${businessId}:${contractId}:`;
const sameScope = (a, b) => a.uid === b.uid && a.businessId === b.businessId && a.contractId === b.contractId && a.branchId === b.branchId;
const media = createContractMediaRepository(db, { currentUser: () => auth.currentUser,
  readDocument: (...path) => getDoc(doc(getServerReadDatabase(), ...path)) });

export function contractImageList(contract) {
  const legacy = contract?.referenceImages?.length ? contract.referenceImages : contract?.referenceImage ? [contract.referenceImage] : [];
  return [...legacy, ...(contract?.mediaIds ?? []).map(id => MEDIA_PREFIX + id)];
}

export function contractImageScope(contract, uid = auth.currentUser?.uid) {
  return { uid, businessId: contract?.businessId, branchId: contract?.branchId, contractId: contract?.id };
}

const encode = (canvas, type, quality) => new Promise((resolve, reject) => canvas.toBlob(
  blob => blob ? resolve(blob) : reject(new Error('No se pudo comprimir la foto.')), type, quality));

export async function compressContractPhoto(input) {
  const canvas = await imageCanvas(input, MAX_CONTRACT_IMAGE_DIMENSION);
  let blob = await encode(canvas, 'image/webp', 0.78);
  if (blob.type !== 'image/webp') blob = await encode(canvas, 'image/jpeg', 0.80);
  // Only one modest quality reduction. Retain the sharper version if both stay within the hard limit.
  if (blob.size > TARGET_CONTRACT_IMAGE_BYTES) {
    const smaller = await encode(canvas, blob.type, blob.type === 'image/webp' ? 0.73 : 0.76);
    if (smaller.size <= TARGET_CONTRACT_IMAGE_BYTES || (blob.size > MAX_CONTRACT_IMAGE_BYTES && smaller.size < blob.size)) blob = smaller;
  }
  if (!blob.size || blob.size > MAX_CONTRACT_IMAGE_BYTES || !['image/webp', 'image/jpeg'].includes(blob.type)) {
    throw new Error('La foto supera 160 KiB. Recorta el área importante o elige otra foto para conservar el detalle.');
  }
  return { blob, width: canvas.width, height: canvas.height, sha256: await imageHash(new Uint8Array(await blob.arrayBuffer())) };
}

function assertActive(scope, signal) {
  signal?.throwIfAborted();
  if (!scope.uid || auth.currentUser?.uid !== scope.uid) throw new Error('La cuenta cambió.');
}

async function legacyPhoto(scope, reference, thumbnails = false) {
  const match = LOCAL_IMAGE.exec(reference);
  if (!scope.uid || auth.currentUser?.uid !== scope.uid || (scope.businessId && scope.businessId !== match?.[1])
    || (scope.contractId && scope.contractId !== match?.[2])) return null;
  const saved = await offlineDB.settings.get(imageKey(scope.uid, reference));
  if (!saved || saved.userId !== scope.uid || saved.businessId !== match?.[1] || saved.contractId !== match?.[2]
    || auth.currentUser?.uid !== scope.uid) return null;
  return (thumbnails ? saved.thumbnail : null) ?? saved.main;
}

export async function stageContractMediaJobs(scope, { files = [], removeIds = [], migration = [] }, signal) {
  assertActive(scope, signal);
  if (files.length + migration.length > MAX_CONTRACT_IMAGES || removeIds.length > MAX_CONTRACT_IMAGES) {
    throw new Error(`Máximo ${MAX_CONTRACT_IMAGES} fotos por pedido.`);
  }
  const prefix = jobPrefix(scope), jobs = [];
  for (const input of [...files.map(file => ({ file })), ...migration.map(legacyRef => ({ legacyRef }))]) {
    assertActive(scope, signal);
    const file = input.file ?? await legacyPhoto(scope, input.legacyRef);
    if (!file) throw new Error('Foto histórica no disponible; vuelve a adjuntarla desde el archivo original.');
    const mediaId = crypto.randomUUID(), data = await compressContractPhoto(file);
    jobs.push({ ...scope, id: prefix + mediaId, mediaId, legacyRef: input.legacyRef ?? null, ...data });
  }
  for (const mediaId of removeIds) jobs.push({ ...scope, id: prefix + 'remove:' + mediaId, mediaId, remove: true });
  assertActive(scope, signal);
  if (jobs.length) {
    try {
      await offlineDB.transaction('rw', offlineDB.settings, async () => {
        const existing = await offlineDB.settings.where('id').startsWith(prefix).limit(41).count();
        if (existing + jobs.length > MAX_CONTRACT_IMAGES * 2) {
          throw Object.assign(new Error('Revisa las fotos pendientes de este pedido antes de adjuntar más.'), { code: 'media-pending-limit' });
        }
        await offlineDB.settings.bulkPut(jobs);
      });
    } catch (error) {
      if (error.code === 'media-pending-limit') throw error;
      throw new Error('No se pudieron guardar las fotos pendientes en este dispositivo. Libera espacio o retira las fotos y reintenta.');
    }
  }
  return jobs;
}

export async function availableLegacyPhotos(scope, references) {
  const available = [];
  for (const ref of references) if (LOCAL_IMAGE.test(ref) && await legacyPhoto(scope, ref)) available.push(ref);
  assertActive(scope);
  return available;
}

export async function readContractMediaJobs(scope) {
  assertActive(scope);
  const jobs = await offlineDB.settings.where('id').startsWith(jobPrefix(scope)).limit(40).toArray();
  assertActive(scope);
  return jobs.filter(row => sameScope(scope, row));
}

export async function finishContractMediaJobs(scope, { jobs, pending, signal } = {}) {
  const local = jobs ?? await readContractMediaJobs(scope);
  if (local.some(job => !sameScope(scope, job))) throw new Error('Las fotos pendientes pertenecen a otro alcance.');
  let remaining = local.length, error, parent;
  const matchingPending = pending && local.find(job => !job.remove && job.mediaId === pending.id);
  if (pending) {
    try {
      assertActive(scope, signal);
      parent = (await media.resume(scope, pending.id, { signal, expectedHash: matchingPending?.sha256 })).parent;
      if (matchingPending) { await offlineDB.settings.delete(matchingPending.id); remaining--; }
    } catch (cause) { return { remaining: remaining + (matchingPending ? 0 : 1), error: cause }; }
  }
  // Removals are explicit and come first so replacing a photo can free a slot at the limit.
  const ordered = [...local].sort((a, b) => Number(Boolean(b.remove)) - Number(Boolean(a.remove)));
  for (const job of ordered) {
    if (job === matchingPending) continue;
    try {
      assertActive(scope, signal);
      parent = job.remove ? await media.remove(scope, job.mediaId, signal) : (await media.upload(scope, job, signal)).parent;
      assertActive(scope, signal);
      await offlineDB.settings.delete(job.id);
      remaining--;
    } catch (cause) { error = cause; break; }
  }
  return { remaining, error, manifest: parent && { mediaIds: parent.mediaIds,
    referenceImages: parent.referenceImages, pendingMedia: parent.pendingMedia, mediaRevision: parent.mediaRevision } };
}

export async function resolveContractImageUrls(images, { scope = {}, thumbnails = false, preserveSlots = false, signal, verifiedBlobs } = {}) {
  const identity = { ...scope, uid: scope.uid ?? auth.currentUser?.uid };
  const urls = Array(images?.length ?? 0).fill(null), owned = [], warnings = [];
  const release = () => owned.splice(0).forEach(url => URL.revokeObjectURL(url));
  let cursor = 0;
  async function worker() {
    while (cursor < urls.length) {
      const index = cursor++, reference = images[index];
      signal?.throwIfAborted();
      const mediaId = contractMediaId(reference);
      try {
        if (mediaId || (typeof reference === 'string' && LOCAL_IMAGE.test(reference))) {
          assertActive(identity, signal);
          const cached = mediaId && verifiedBlobs?.get(mediaId);
          const blob = mediaId ? (cached?.until > Date.now() ? cached.blob : (await media.readPhoto(identity, mediaId, { signal })).blob)
            : await legacyPhoto(identity, reference, thumbnails);
          if (!blob) throw new Error('Foto histórica no disponible; vuelve a adjuntarla desde el archivo original.');
          assertActive(identity, signal);
          if (mediaId && (!cached || cached.until <= Date.now()) && verifiedBlobs) {
            if (verifiedBlobs.size >= MAX_CONTRACT_IMAGES) verifiedBlobs.delete(verifiedBlobs.keys().next().value);
            verifiedBlobs.set(mediaId, { blob, until: Date.now() + 30000 });
          }
          const url = URL.createObjectURL(blob);
          owned.push(url); urls[index] = url;
        } else if (typeof reference === 'string' && /^(data:image\/(jpeg|png|webp);base64,|blob:)/.test(reference) && safeImageUrl(reference)) {
          urls[index] = reference;
        } else warnings.push('Referencia histórica conservada. Su foto no está disponible.');
      } catch {
        if (signal?.aborted) return;
        warnings.push(mediaId ? 'Foto remota no disponible o pendiente de verificar.' :
          'Foto histórica no disponible; vuelve a adjuntarla desde el archivo original.');
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(3, urls.length) }, worker));
    signal?.throwIfAborted();
    if (identity.uid && auth.currentUser?.uid !== identity.uid) throw new Error('La cuenta cambió.');
    return { urls: preserveSlots ? urls : urls.filter(Boolean), warnings: [...new Set(warnings)], release };
  } catch (error) { release(); throw error; }
}

export async function withResolvedContractImages(contract, callback, { signal } = {}) {
  const resolved = await resolveContractImageUrls(contractImageList(contract), { scope: contractImageScope(contract), signal });
  try { return await callback({ ...contract, referenceImages: resolved.urls, referenceImage: resolved.urls[0] ?? null,
    imageAvailabilityNote: resolved.warnings.join(' ') }); }
  finally { resolved.release(); }
}
