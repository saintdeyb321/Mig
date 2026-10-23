import { requireCapability } from '../../../config/runtimeCapabilities.js';
import { auth } from '../../../core/firebase/client';
import offlineDB from '../../../offlineDB.js';
import { safeImageUrl } from '../../../shared/security/html.js';

export const MAX_CONTRACT_IMAGES = 20;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const localReference = /^local-image:([A-Za-z0-9_-]{1,128}):([A-Za-z0-9_-]{1,128}):([A-Za-z0-9_-]{36})$/;
const imageKey = (uid, reference) => `contract-image:${uid}:${reference}`;
export function contractImageList(contract) {
  return contract?.referenceImages?.length ? contract.referenceImages : contract?.referenceImage ? [contract.referenceImage] : [];
}
function validateBlob(blob) {
  if (!(blob instanceof Blob) || !IMAGE_TYPES.has(blob.type) || !blob.size || blob.size > MAX_IMAGE_BYTES) {
    throw new Error('Usa JPEG, PNG o WebP de hasta 5 MB; puedes guardar el contrato sin foto.');
  }
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
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 24000000) throw new Error('La imagen no tiene dimensiones válidas.');
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
    const [main, thumbnail] = await Promise.all([render(960, 0.68), render(240, 0.6)]);
    if (main.size > 256 * 1024 || thumbnail.size > 64 * 1024) throw new Error('Imagen comprimida demasiado grande; usa una foto más pequeña o guarda el contrato sin imagen.');
    validateBlob(main);
    validateBlob(thumbnail);
    return { main, thumbnail };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export async function prepareContractImages({ businessId, contractId, newImages = [], retainedImages = [] }) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Inicia sesión.');
  if (newImages.length + retainedImages.length > MAX_CONTRACT_IMAGES) throw new Error('Máximo 20 referencias por contrato.');
  // Retained historical references are never deleted or silently migrated.
  const references = [...retainedImages];
  for (const blob of newImages) {
    const { main, thumbnail } = await optimizedImages(blob);
    const reference = `local-image:${businessId}:${contractId}:${crypto.randomUUID()}`;
    if (!localReference.test(reference)) throw new Error('Identidad de imagen inválida.');
    if (auth.currentUser?.uid !== uid) throw new Error('La sesión cambió.');
    await offlineDB.settings.put({ id: imageKey(uid, reference), businessId, userId: uid,
      contractId, reference, main, thumbnail, bytes: main.size + thumbnail.size, deviceOnly: true });
    references.push(reference);
  }
  return references;
}
// No automatic collection or deletion: retain old Storage jobs and local references for explicit review.
export async function cleanupContractImagePaths(_businessId, _contractId, paths = []) { if (paths.length) requireCapability('cloudStorage', 'Limpieza remota de imágenes históricas'); }
export const cleanupRetiredContractImages = async () => {};
export async function retryContractImageCleanup() { requireCapability('cloudStorage', 'Limpieza remota de imágenes históricas'); }

export async function resolveContractImageUrls(images, { thumbnails = false } = {}) {
  const uid = auth.currentUser?.uid, urls = [], owned = [], warnings = [];
  for (const image of images ?? []) {
    if (typeof image === 'string' && localReference.test(image)) {
      let saved;
      try { saved = uid ? await offlineDB.settings.get(imageKey(uid, image)) : null; }
      catch { warnings.push('Foto local no disponible: IndexedDB no pudo leerla. Puedes imprimir sin ella.'); continue; }
      if (!saved || saved.userId !== uid || auth.currentUser?.uid !== uid) { warnings.push('Foto local no disponible en este dispositivo/cuenta.'); continue; }
      const url = URL.createObjectURL(thumbnails ? saved.thumbnail : saved.main); owned.push(url); urls.push(url);
    } else if (typeof image === 'string' && /^(data:image\/(jpeg|png|webp);base64,|blob:)/.test(image) && safeImageUrl(image)) {
      urls.push(image);
    } else warnings.push('Referencia histórica conservada; Firebase Storage no está disponible en Spark.');
  }
  return { urls, warnings, release: () => owned.splice(0).forEach(url => URL.revokeObjectURL(url)) };
}
export async function withResolvedContractImages(contract, callback) {
  const resolved = await resolveContractImageUrls(contractImageList(contract));
  try { return await callback({ ...contract, referenceImages: resolved.urls, referenceImage: resolved.urls[0] ?? null,
    imageAvailabilityNote: resolved.warnings.length ? resolved.warnings.join(' ') : 'Imágenes locales: solo este dispositivo/cuenta.' }); }
  finally { resolved.release(); }
}
