import { doc, getDocFromServer } from 'firebase/firestore';
import { db, auth } from '../../../core/firebase/client';
import { readStorageBlob, uploadStorageBlob, deleteStorageObject, requireLocalImageSources } from '../../../core/firebase/storage.js';
import { requireCapability } from '../../../config/runtimeCapabilities.js';
import { resolveImageSources, usingImageSources } from '../application/imageSources.js';
import offlineDB from '../../../offlineDB.js';
import { cleanupUnreferencedImages, imagePaths } from '../application/imageCleanup.js';

export const MAX_CONTRACT_IMAGES = 20;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function safeSegment(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('La ruta de imagen requiere identificadores válidos.');
  }
  return value;
}

export function contractImageList(contract) {
  if (Array.isArray(contract?.referenceImages) && contract.referenceImages.length) {
    return contract.referenceImages;
  }
  return contract?.referenceImage ? [contract.referenceImage] : [];
}

function validateBlob(blob) {
  if (!(blob instanceof Blob) || !IMAGE_TYPES.has(blob.type)) {
    throw new Error('Solo se admiten imágenes JPEG, PNG o WebP.');
  }
  if (!blob.size || blob.size > MAX_IMAGE_BYTES) {
    throw new Error('Cada imagen debe pesar como máximo 5 MB.');
  }
  if (blob.name && !/\.(jpe?g|png|webp)$/i.test(blob.name)) {
    throw new Error('La extensión de la imagen no es válida.');
  }
}

function legacyBlob(value) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(value);
  if (!match) throw new Error('La imagen antigua debe migrarse antes de guardar el pedido.');
  const encoded = match[2].replace(/\s/g, '');
  if (encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
    throw new Error('La imagen antigua supera el límite de 5 MB.');
  }
  const decoded = atob(encoded);
  return new Blob([Uint8Array.from(decoded, character => character.charCodeAt(0))], { type: match[1] });
}

async function optimizedImages(blob) {
  validateBlob(blob);
  const sourceUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise((resolve, reject) => {
      const value = new Image();
      value.onload = () => resolve(value);
      value.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
      value.src = sourceUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('La imagen no tiene dimensiones válidas.');
    const render = (maxSize, quality) => new Promise((resolve, reject) => {
      const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const drawing = canvas.getContext('2d');
      if (!drawing) { reject(new Error('No se pudo preparar la imagen.')); return; }
      drawing.fillStyle = '#ffffff';
      drawing.fillRect(0, 0, canvas.width, canvas.height);
      drawing.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('No se pudo comprimir la imagen.')),
        'image/jpeg', quality);
    });
    const [main, thumbnail] = await Promise.all([render(1280, 0.82), render(320, 0.7)]);
    validateBlob(main);
    validateBlob(thumbnail);
    return { main, thumbnail };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function retainedMetadata(image, prefix) {
  if (!image || typeof image !== 'object' || !IMAGE_TYPES.has(image.contentType)) {
    throw new Error('La referencia de imagen es inválida.');
  }
  const main = new RegExp(`^${prefix}[A-Za-z0-9_-]+\\.(?:jpg|jpeg|png|webp)$`);
  const thumbnail = new RegExp(`^${prefix}thumbs/[A-Za-z0-9_-]+\\.(?:jpg|jpeg|png|webp)$`);
  if (!main.test(image.storagePath) || (image.thumbnailPath && !thumbnail.test(image.thumbnailPath))) {
    throw new Error('La imagen pertenece a otro pedido o negocio.');
  }
  return {
    storagePath: image.storagePath,
    ...(image.thumbnailPath ? { thumbnailPath: image.thumbnailPath } : {}),
    contentType: image.contentType,
  };
}

export async function prepareContractImages({ businessId, contractId, newImages = [], retainedImages = [], uploadedPaths = [] }) {
  const prefix = `contracts/${safeSegment(businessId)}/${safeSegment(contractId)}/`;
  if (!Array.isArray(newImages) || !Array.isArray(retainedImages)
    || newImages.length + retainedImages.length > MAX_CONTRACT_IMAGES) {
    throw new Error(`El pedido admite hasta ${MAX_CONTRACT_IMAGES} imágenes.`);
  }
  if (newImages.length || retainedImages.some(image => typeof image === 'string')) requireCapability('cloudStorage', 'Guardar imágenes del contrato');
  const upload = async blob => {
    const { main, thumbnail } = await optimizedImages(blob);
    const imageId = crypto.randomUUID();
    const storagePath = `${prefix}${imageId}.jpg`;
    const thumbnailPath = `${prefix}thumbs/${imageId}.jpg`;
    const results = await Promise.allSettled([[storagePath, main], [thumbnailPath, thumbnail]].map(async ([path, bytes]) => {
      uploadedPaths.push(path); await uploadStorageBlob(path, bytes, { contentType: 'image/jpeg' });
    }));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    return { storagePath, thumbnailPath, contentType: 'image/jpeg' };
  };
  const results = await Promise.allSettled([...retainedImages.map(async image => typeof image === 'string'
    ? upload(legacyBlob(image)) : retainedMetadata(image, prefix)), ...newImages.map(upload)]);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  return results.map(result => result.value);
}

export async function cleanupContractImagePaths(businessId, contractId, paths, { retry = null } = {}) {
  const userId = auth.currentUser?.uid;
  if (!userId || !paths.length) return;
  requireCapability('cloudStorage', 'Limpiar imágenes del contrato');
  const prefix = `contracts/${safeSegment(businessId)}/${safeSegment(contractId)}/`;
  if (paths.some(path => !path.startsWith(prefix))) throw new Error('Cleanup fuera del pedido.');
  const id = retry?.id ?? `image-cleanup:${businessId}:${userId}:${crypto.randomUUID()}`;
  const result = await cleanupUnreferencedImages({ paths,
    readCurrent: async () => {
      if (auth.currentUser?.uid !== userId) throw new Error('La sesión cambió.');
      const snapshot = await getDocFromServer(doc(db, 'contracts', contractId));
      if (snapshot.exists() && snapshot.data().businessId !== businessId) throw new Error('Pedido fuera del negocio.');
      return snapshot.data()?.referenceImages ?? [];
    },
    remove: async path => {
      if (auth.currentUser?.uid !== userId) throw new Error('La sesión cambió.');
      try { await deleteStorageObject(path); } catch (error) { if (error.code !== 'storage/object-not-found') throw error; }
    },
    onFailure: async pending => {
      console.warn('Limpieza de imágenes pendiente de reintento.');
      const retries = (retry?.retries ?? 0) + 1;
      await offlineDB.settings.put({ id, businessId, userId, contractId, paths: pending, retries,
        nextRetryAt: Date.now() + Math.min(300000, 5000 * 2 ** retries) });
    },
  });
  if (!result.pending.length) await offlineDB.settings.delete(id);
}

export async function retryContractImageCleanup(businessId) {
  requireCapability('cloudStorage', 'Reintentar limpieza de imágenes');
  const userId = auth.currentUser?.uid;
  if (!userId || !navigator.onLine) return;
  const jobs = await offlineDB.settings.where('id').startsWith(`image-cleanup:${businessId}:${userId}:`).limit(20).toArray();
  for (const job of jobs) if (job.retries < 3 && job.nextRetryAt <= Date.now()) {
    await cleanupContractImagePaths(businessId, job.contractId, job.paths, { retry: job });
  }
}

export async function cleanupRetiredContractImages(businessId, contractId, previous, current) {
  const retained = new Set(imagePaths(current));
  await cleanupContractImagePaths(businessId, contractId, imagePaths(previous).filter(path => !retained.has(path)));
}

export async function resolveContractImageUrls(images, { thumbnails = false } = {}) {
  requireLocalImageSources(images);
  return resolveImageSources(images, { thumbnails, load: readStorageBlob });
}

export async function withResolvedContractImages(contract, callback) {
  requireLocalImageSources(contractImageList(contract));
  return usingImageSources(contractImageList(contract), urls => callback({ ...contract, referenceImages: urls, referenceImage: urls[0] || null }),
    { load: readStorageBlob });
}
