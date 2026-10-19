export const imagePaths = images => [...new Set((images ?? []).flatMap(image =>
  typeof image === 'object' && image ? [image.storagePath, image.thumbnailPath].filter(Boolean) : []))];

export async function cleanupUnreferencedImages({ paths, readCurrent, remove, onFailure = () => {} }) {
  const unique = [...new Set(paths)];
  if (!unique.length) return { deleted: 0, pending: [] };
  let retained;
  try { retained = new Set(imagePaths(await readCurrent())); }
  catch (error) { await onFailure(unique, error); return { deleted: 0, pending: unique }; }
  const retired = unique.filter(path => !retained.has(path));
  const results = await Promise.allSettled(retired.map(remove));
  const pending = retired.filter((_, index) => results[index].status === 'rejected');
  if (pending.length) await onFailure(pending, results.find(result => result.status === 'rejected').reason);
  return { deleted: retired.length - pending.length, pending };
}
