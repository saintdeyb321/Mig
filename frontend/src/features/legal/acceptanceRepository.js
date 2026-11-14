import { hasCurrentTerms, legalAcceptanceMarker, requiresVersionedAcceptance } from './publication.js';

export async function recordLegalAcceptance(db, user, publication, sdk) {
  if (!requiresVersionedAcceptance(user, publication) || !publication.privacy || !user.uid || !user.businessId) {
    throw new Error('No hay documentos aprobados para esta cuenta.');
  }
  const { collection, doc, getDocFromServer, runTransaction, serverTimestamp } = sdk;
  const profileRef = doc(db, 'users', user.uid);
  const evidenceRef = doc(collection(profileRef, 'legal_acceptances'));
  const accept = async transaction => {
    const profile = { ...(await transaction.get(profileRef)).data(), uid: user.uid };
    if (profile.businessId !== user.businessId || profile.role !== user.role || (profile.status ?? 'activo') !== 'activo') {
      throw new Error('La cuenta o el negocio cambió. Vuelve a comprobar tu acceso.');
    }
    if (hasCurrentTerms(profile, publication)) return;
    const evidence = {
      id: evidenceRef.id, uid: user.uid, businessId: user.businessId, role: user.role,
      termsVersion: publication.terms.version, termsSha256: publication.terms.sha256,
      privacyVersion: publication.privacy.version, privacySha256: publication.privacy.sha256,
      acceptedAt: serverTimestamp(),
    };
    transaction.set(evidenceRef, evidence);
    transaction.update(profileRef, { legalAcceptance: legalAcceptanceMarker(evidence) });
  };
  try {
    await runTransaction(db, accept);
  } catch (error) {
    if (error.code !== 'permission-denied') throw error;
    // A competing transaction may already have published the same acceptance.
    const profile = (await getDocFromServer(profileRef)).data();
    if (profile?.businessId !== user.businessId || profile.role !== user.role || (profile.status ?? 'activo') !== 'activo'
      || !hasCurrentTerms({ ...profile, uid: user.uid }, publication)) throw error;
  }
}
