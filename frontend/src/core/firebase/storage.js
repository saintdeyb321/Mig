import { requireCapability } from '../../config/runtimeCapabilities.js';

// Keep legacy references and local images intact. No Storage SDK in Spark runtime.
export async function readStorageBlob(path) {
  requireCapability('cloudStorage', `Leer imagen (${path})`);
  throw new Error('Repositorio de imágenes Spark pendiente.');
}

export async function uploadStorageBlob(path) {
  requireCapability('cloudStorage', `Subir imagen (${path})`);
  throw new Error('Repositorio de imágenes Spark pendiente.');
}

export async function deleteStorageObject(path) {
  requireCapability('cloudStorage', `Eliminar imagen (${path})`);
  throw new Error('Repositorio de imágenes Spark pendiente.');
}

export function requireLocalImageSources(images) {
  if ((images ?? []).some(image => typeof image !== 'string' || /^https:/i.test(image))) {
    requireCapability('cloudStorage', 'Recuperar imágenes antiguas');
  }
}
