export const MAX_CONTRACT_IMAGES = 4;

export function fitsContractImageLimit(images, savedImages = []) {
  return images.length <= MAX_CONTRACT_IMAGES || (Array.isArray(savedImages) && images.length === savedImages.length
    && images.every((image, index) => image === savedImages[index]));
}
