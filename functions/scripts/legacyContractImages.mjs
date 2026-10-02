import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { documentId } from '../src/sales/domain/saleModel.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function legacyImages(contract) {
  if (Array.isArray(contract.referenceImages) && contract.referenceImages.length) return contract.referenceImages;
  return contract.referenceImage ? [contract.referenceImage] : [];
}

function decodeLegacyImage(value) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(value);
  if (!match) throw new Error('La imagen legacy usa un formato no admitido.');
  const encoded = match[2].replace(/\s/g, '');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString('base64') !== encoded) {
    throw new Error('La imagen legacy tiene Base64 inválido o supera 5 MB.');
  }
  const [mime] = [match[1]];
  const signatureValid = mime === 'image/jpeg'
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mime === 'image/png'
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!signatureValid) throw new Error('El contenido legacy no coincide con su tipo de imagen.');
  return { bytes, contentType: mime };
}

export async function migrateLegacyContractImages({ database, bucket, contractId, contract, dryRun = true }) {
  const businessId = documentId(contract.businessId, 'businessId');
  const sourceId = documentId(contractId, 'contractId');
  const images = legacyImages(contract);
  const uploads = [];
  const referenceImages = images.map((image, index) => {
    if (typeof image !== 'string' || !image.startsWith('data:')) return image;
    const { bytes, contentType } = decodeLegacyImage(image);
    const digest = createHash('sha256').update(`${sourceId}:${index}:`).update(bytes).digest('hex');
    const storagePath = `contracts/${businessId}/${sourceId}/legacy-${digest}.${IMAGE_EXTENSIONS[contentType]}`;
    uploads.push({ storagePath, bytes, contentType });
    return { storagePath, contentType };
  });
  const result = { changed: uploads.length > 0, imageCount: images.length, referenceImages };
  if (dryRun || !result.changed) return result;
  if (!database || !bucket) throw new Error('La migración requiere Firestore y Storage ambientales.');

  for (const { storagePath, bytes, contentType } of uploads) {
    try {
      await bucket.file(storagePath).save(bytes, {
        resumable: false, contentType,
        metadata: { cacheControl: 'private,max-age=3600' },
        preconditionOpts: { ifGenerationMatch: 0 },
      });
    } catch (error) {
      // A deterministic object from an earlier partial run is safe to reuse.
      if (Number(error.code) !== 412) throw error;
    }
  }
  await database.runTransaction(async transaction => {
    const reference = database.collection('contracts').doc(sourceId);
    const snapshot = await transaction.get(reference);
    const current = snapshot.data();
    if (!current || current.businessId !== businessId) throw new Error('El contrato cambió de tenant o ya no existe.');
    if (JSON.stringify(legacyImages(current)) === JSON.stringify(referenceImages)) return;
    if (JSON.stringify(legacyImages(current)) !== JSON.stringify(images)) {
      throw new Error('Las imágenes cambiaron durante la migración; vuelve a ejecutar dry-run.');
    }
    transaction.update(reference, {
      referenceImages,
      referenceImage: FieldValue.delete(),
      imagesMigratedAt: FieldValue.serverTimestamp(),
    });
  });
  return result;
}
