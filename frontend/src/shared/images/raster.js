export const RASTER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_RASTER_INPUT_BYTES = 5 * 1024 * 1024;
export const MAX_PRODUCT_IMAGE_CHARS = 128 * 1024;
export const MAX_QR_IMAGE_CHARS = 384 * 1024;

export async function imageCanvas(blob, maxDimension, { smooth = true } = {}) {
  if (!(blob instanceof Blob) || !RASTER_TYPES.includes(blob.type) || !blob.size || blob.size > MAX_RASTER_INPUT_BYTES) {
    throw new Error('Usa una imagen JPEG, PNG o WebP de hasta 5 MiB.');
  }
  const source = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = source;
    await image.decode().catch(() => { throw new Error('No se pudo leer la imagen.'); });
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height || width * height > 24000000) throw new Error('La imagen excede el límite de dimensiones.');
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const drawing = canvas.getContext('2d');
    if (!drawing) throw new Error('El navegador no pudo preparar la imagen.');
    drawing.imageSmoothingEnabled = smooth;
    drawing.fillStyle = '#ffffff';
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    drawing.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { URL.revokeObjectURL(source); }
}

export function boundedImageDataUrl(canvas, type, maxChars, quality) {
  const encoded = canvas.toDataURL(type, quality);
  if (!encoded.startsWith(`data:${type};base64,`) || encoded.length > maxChars) {
    throw new Error('La imagen supera el tamaño permitido. Recórtala conservando sus detalles y vuelve a intentar.');
  }
  return encoded;
}
