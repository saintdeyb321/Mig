import * as firestore from 'firebase/firestore';
import { MAX_CONTRACT_IMAGE_BYTES, MAX_CONTRACT_IMAGE_DIMENSION, MEDIA_ID } from '../application/contractImagePolicy.js';

const key = /^[A-Za-z0-9_-]{1,128}$/;
const types = ['image/webp', 'image/jpeg'];
const conflict = message => new Error(message);
const uncertain = error => ['aborted', 'deadline-exceeded', 'unavailable', 'unknown', 'internal'].includes(error.code);
const nextRevision = parent => (parent.mediaRevision ?? 0) + 1;
const textAt = (bytes, offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));

export const imageHash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  value => value.toString(16).padStart(2, '0')).join('');

function validPhoto(bytes, contentType) {
  return contentType === 'image/webp' ? textAt(bytes, 0, 4) === 'RIFF' && textAt(bytes, 8, 4) === 'WEBP'
    : contentType === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
}

export function createContractMediaRepository(database, { currentUser, sdk = firestore, readDocument } = {}) {
  const { Bytes, doc, getDocFromServer, runTransaction, serverTimestamp } = sdk;
  const read = readDocument ?? ((...path) => getDocFromServer(doc(database, ...path)));
  const active = (scope, signal) => {
    signal?.throwIfAborted();
    if (!scope.uid || currentUser()?.uid !== scope.uid || ![scope.businessId, scope.contractId, scope.branchId].every(value => key.test(value ?? ''))
      || scope.branchId === 'global') throw conflict('La cuenta, el pedido o la sede cambiaron.');
  };
  const parent = (scope, data) => {
    if (!data || data.businessId !== scope.businessId || data.branchId !== scope.branchId) throw conflict('El pedido no pertenece al negocio y sede de origen.');
    return data;
  };
  const parentRef = scope => doc(database, 'contracts', scope.contractId);
  const mediaRef = (scope, id) => {
    if (!MEDIA_ID.test(id ?? '')) throw conflict('Referencia de foto inválida.');
    return doc(database, 'contracts', scope.contractId, 'media', id);
  };
  const snapshotData = snapshot => {
    if (snapshot.metadata?.fromCache || snapshot.metadata?.hasPendingWrites) throw conflict('La foto está pendiente de confirmación del servidor.');
    return snapshot.data();
  };
  async function readParent(scope, signal) {
    active(scope, signal);
    const snapshot = await read('contracts', scope.contractId);
    active(scope, signal);
    return parent(scope, snapshotData(snapshot));
  }
  async function readPhoto(scope, id, { signal, expectedHash } = {}) {
    active(scope, signal);
    if (!MEDIA_ID.test(id ?? '')) throw conflict('Referencia de foto inválida.');
    const saved = snapshotData(await read('contracts', scope.contractId, 'media', id));
    active(scope, signal);
    const bytes = saved?.data?.toUint8Array?.();
    if (saved?.businessId !== scope.businessId || saved?.originBranchId !== scope.branchId || saved?.version !== 1
      || !types.includes(saved?.contentType) || !bytes?.length || bytes.length !== saved.byteLength || bytes.length > MAX_CONTRACT_IMAGE_BYTES
      || ![saved.width, saved.height].every(value => Number.isInteger(value) && value > 0 && value <= MAX_CONTRACT_IMAGE_DIMENSION)
      || !validPhoto(bytes, saved.contentType) || (expectedHash && expectedHash !== saved.sha256) || await imageHash(bytes) !== saved.sha256) {
      throw conflict('La foto no coincide con su tamaño, tipo o huella de integridad.');
    }
    active(scope, signal);
    return { blob: new Blob([bytes], { type: saved.contentType }), sha256: saved.sha256, width: saved.width, height: saved.height };
  }
  async function publish(scope, id, sha256, signal) {
    active(scope, signal);
    const ref = parentRef(scope);
    try {
      await runTransaction(database, async tx => {
        const saved = parent(scope, (await tx.get(ref)).data());
        active(scope, signal);
        const ids = saved.mediaIds ?? [];
        if (ids.includes(id)) return;
        if (saved.pendingMedia?.id !== id || saved.pendingMedia.sha256 !== sha256) throw conflict('La reserva de la foto cambió.');
        // Media documents are immutable. The verified hash is bound to this exact reservation and ID.
        const pending = saved.pendingMedia;
        const referenceImages = (saved.referenceImages ?? []).filter(image => image !== pending.legacyRef);
        tx.update(ref, { mediaIds: [...ids, id], pendingMedia: null, mediaRevision: nextRevision(saved), ...(pending.legacyRef ? { referenceImages } : {}) });
      });
    } catch (error) {
      if (!uncertain(error)) throw error;
    }
    const saved = await readParent(scope, signal);
    if (!saved.mediaIds?.includes(id)) throw conflict('Foto verificada; su asociación al pedido sigue pendiente.');
    return saved;
  }
  async function resume(scope, id, { signal, expectedHash } = {}) {
    const proof = await readPhoto(scope, id, { signal, expectedHash });
    return { ...proof, parent: await publish(scope, id, proof.sha256, signal) };
  }
  return {
    readPhoto, resume,

    async upload(scope, job, signal) {
      active(scope, signal);
      const ref = parentRef(scope), image = mediaRef(scope, job.mediaId);
      const bytes = new Uint8Array(await job.blob.arrayBuffer());
      if (!validPhoto(bytes, job.blob.type) || !bytes.length || bytes.length > MAX_CONTRACT_IMAGE_BYTES || await imageHash(bytes) !== job.sha256) {
        throw conflict('La foto pendiente perdió su integridad.');
      }
      active(scope, signal);
      try {
        await runTransaction(database, async tx => {
          const saved = parent(scope, (await tx.get(ref)).data());
          active(scope, signal);
          if (saved.mediaIds?.includes(job.mediaId) || saved.pendingMedia?.id === job.mediaId) return;
          if (saved.pendingMedia) throw conflict('Termina la foto pendiente antes de adjuntar otra.');
          tx.set(image, { businessId: scope.businessId, originBranchId: scope.branchId, contentType: job.blob.type,
            data: Bytes.fromUint8Array(bytes), byteLength: bytes.length, width: job.width, height: job.height, sha256: job.sha256,
            version: 1, createdAt: serverTimestamp(), createdBy: scope.uid });
          tx.update(ref, { mediaRevision: nextRevision(saved), pendingMedia: { id: job.mediaId, legacyRef: job.legacyRef ?? null, sha256: job.sha256 } });
        });
      } catch (error) {
        if (!uncertain(error)) throw error;
      }
      return resume(scope, job.mediaId, { signal, expectedHash: job.sha256 });
    },
    async remove(scope, id, signal) {
      active(scope, signal);
      const ref = parentRef(scope), image = mediaRef(scope, id);
      try {
        await runTransaction(database, async tx => {
          const saved = parent(scope, (await tx.get(ref)).data());
          active(scope, signal);
          if (!saved.mediaIds?.includes(id)) return;
          tx.update(ref, { mediaIds: saved.mediaIds.filter(value => value !== id), mediaRevision: nextRevision(saved) });
          tx.delete(image);
        });
      } catch (error) {
        if (!uncertain(error)) throw error;
      }
      const saved = await readParent(scope, signal);
      if (saved.mediaIds?.includes(id)) throw conflict('El retiro de la foto sigue pendiente.');
      return saved;
    },
  };
}
