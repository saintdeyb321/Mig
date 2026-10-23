// The pinned Admin SDK's collection.listDocuments() auto-paginates. Use its same authenticated
// transport with autoPaginate:false to include missing parents without reading an entire subtree.
// This adapter fails closed on an SDK change and is exercised against the Firestore emulator.
export async function subtreeDocumentPage(database, path, pageToken = null) {
  const segments = path.split('/'), collectionId = segments.pop(), parentPath = segments.join('/');
  if (!parentPath || segments.length % 2 !== 0) throw new Error('invalid-subtree-path');
  const firestore = database.doc(parentPath).firestore;
  if (!firestore._clientPool?.run || typeof firestore.initializeIfNeeded !== 'function' || typeof firestore.createCallOptions !== 'function') throw new Error('unsupported-firestore-paging');
  const tag = 'platform-subtree-page';
  await firestore.initializeIfNeeded(tag);
  const [documents, , response] = await firestore._clientPool.run(tag, false, client => client.listDocuments({
    parent: `projects/${database.projectId}/databases/(default)/documents/${parentPath}`, collectionId,
    showMissing: true, pageSize: 20, mask: { fieldPaths: [] }, ...(pageToken ? { pageToken } : {}),
  }, { ...firestore.createCallOptions('listDocuments'), autoPaginate: false }));
  const refs = documents.map(document => {
    const name = document.name.split('/documents/')[1];
    if (!name?.startsWith(path + '/') || name.slice(path.length + 1).includes('/')) throw new Error('foreign-subtree-response');
    return database.doc(name);
  });
  const docs = refs.length ? await firestore.getAll(...refs) : [];
  return { docs, next: response?.nextPageToken || null };
}
