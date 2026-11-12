// A media error must never turn a confirmed commercial command into a retryable sale.
export async function completeContractPhotos(result, pendingCount, finish) {
  try {
    const { remaining } = await finish();
    return { ...result, remaining, photosNeedReview: false };
  } catch {
    return { ...result, remaining: pendingCount, photosNeedReview: true };
  }
}
