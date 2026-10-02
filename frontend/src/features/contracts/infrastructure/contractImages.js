import { getBlob, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../../../core/firebase/client';

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

export async function prepareContractImages({ businessId, contractId, newImages = [], retainedImages = [] }) {
  const prefix = `contracts/${safeSegment(businessId)}/${safeSegment(contractId)}/`;
  if (!Array.isArray(newImages) || !Array.isArray(retainedImages)
    || newImages.length + retainedImages.length > MAX_CONTRACT_IMAGES) {
    throw new Error(`El pedido admite hasta ${MAX_CONTRACT_IMAGES} imágenes.`);
  }
  const upload = async blob => {
    const { main, thumbnail } = await optimizedImages(blob);
    const imageId = crypto.randomUUID();
    const storagePath = `${prefix}${imageId}.jpg`;
    const thumbnailPath = `${prefix}thumbs/${imageId}.jpg`;
    await Promise.all([
      uploadBytes(ref(storage, storagePath), main, { contentType: 'image/jpeg' }),
      uploadBytes(ref(storage, thumbnailPath), thumbnail, { contentType: 'image/jpeg' }),
    ]);
    return { storagePath, thumbnailPath, contentType: 'image/jpeg' };
  };
  const retained = await Promise.all(retainedImages.map(image => typeof image === 'string'
    ? upload(legacyBlob(image)) : retainedMetadata(image, prefix)));
  const added = await Promise.all(newImages.map(upload));
  return [...retained, ...added];
}

export async function resolveContractImageUrls(images, { thumbnails = false } = {}) {
  const createdUrls = [];
  const release = () => createdUrls.splice(0).forEach(value => URL.revokeObjectURL(value));
  const resolved = await Promise.allSettled((images ?? []).map(async image => {
    // Legacy data strings remain readable until their explicit Storage migration.
    if (typeof image === 'string') return image;
    const path = thumbnails ? image?.thumbnailPath || image?.storagePath : image?.storagePath;
    if (typeof path !== 'string' || !path.startsWith('contracts/')) throw new Error('Referencia de imagen inválida.');
    const blob = await getBlob(ref(storage, path), MAX_IMAGE_BYTES);
    const url = URL.createObjectURL(blob);
    createdUrls.push(url);
    return url;
  }));
  const failure = resolved.find(result => result.status === 'rejected');
  if (failure) { release(); throw failure.reason; }
  return { urls: resolved.map(result => result.value), release };
}

export async function withResolvedContractImages(contract, callback) {
  const { urls, release } = await resolveContractImageUrls(contractImageList(contract));
  try {
    return await callback({ ...contract, referenceImages: urls, referenceImage: urls[0] || null });
  } finally {
    release();
  }
}
