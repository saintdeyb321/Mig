export const MAX_CONTRACT_IMAGES = 6;
export const MAX_HISTORICAL_CONTRACT_IMAGES = 20;
export const TARGET_CONTRACT_IMAGE_BYTES = 100 * 1024;
export const MAX_CONTRACT_IMAGE_BYTES = 160 * 1024;
export const MAX_CONTRACT_IMAGE_DIMENSION = 960;
export const MEDIA_PREFIX = 'media-image:';
export const MEDIA_ID = /^[a-f0-9-]{36}$/;
export const LOCAL_IMAGE = /^local-image:([A-Za-z0-9_-]{1,128}):([A-Za-z0-9_-]{1,128}):([A-Za-z0-9_-]{36})$/;

export function contractMediaId(reference) {
  return typeof reference === 'string' && reference.startsWith(MEDIA_PREFIX)
    && MEDIA_ID.test(reference.slice(MEDIA_PREFIX.length)) ? reference.slice(MEDIA_PREFIX.length) : null;
}

export function fitsContractImageLimit(images, savedImages = []) {
  if (images.length <= MAX_CONTRACT_IMAGES) return true;
  if (!Array.isArray(savedImages) || images.length > savedImages.length) return false;
  let retained = 0;
  for (const image of savedImages) if (image === images[retained] && ++retained === images.length) return true;
  return false;
}

export function validateContractMediaStaging({ files, migration, removeIds }) {
  if (files.length > MAX_CONTRACT_IMAGES) throw new Error(`Máximo ${MAX_CONTRACT_IMAGES} fotos por pedido.`);
  if (migration.length > MAX_HISTORICAL_CONTRACT_IMAGES || removeIds.length > MAX_HISTORICAL_CONTRACT_IMAGES) {
    throw new Error('Hay demasiadas fotos históricas en esta operación. Divide los cambios y vuelve a intentar.');
  }
}
