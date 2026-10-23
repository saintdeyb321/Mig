import { safeImageUrl } from '../../../shared/security/html.js';

export async function resolveImageSources(images, { load, thumbnails = false, createUrl = blob => URL.createObjectURL(blob), revokeUrl = url => URL.revokeObjectURL(url) }) {
  const created = [];
  const release = () => created.splice(0).forEach(revokeUrl);
  const resolved = await Promise.allSettled((images ?? []).map(async image => {
    if (typeof image === 'string') {
      const source = safeImageUrl(image);
      if (!source) throw new Error('Fuente de imagen no permitida.');
      return source;
    }
    const path = thumbnails ? image?.thumbnailPath || image?.storagePath : image?.storagePath;
    if (typeof path !== 'string' || !path.startsWith('contracts/')) throw new Error('Referencia de imagen inválida.');
    const url = createUrl(await load(path));
    created.push(url);
    return url;
  }));
  const failure = resolved.find(result => result.status === 'rejected');
  if (failure) { release(); throw failure.reason; }
  return { urls: resolved.map(result => result.value), release };
}

export async function usingImageSources(images, callback, options) {
  const { urls, release } = await resolveImageSources(images, options);
  try { return await callback(urls); } finally { release(); }
}
