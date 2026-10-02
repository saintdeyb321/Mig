export const mapDocuments = snapshot => snapshot.docs.map(document => ({ ...document.data(), id: document.id }));
