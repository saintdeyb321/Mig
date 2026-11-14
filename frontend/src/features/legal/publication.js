export const legalRoutes = Object.freeze({ terms: '/legal/terminos', privacy: '/legal/privacidad' });
export const legalTitles = Object.freeze({ terms: 'Términos y Condiciones', privacy: 'Política de Privacidad' });

export const legacyTerms = Object.freeze({
  version: '1.1',
  path: '/legal/terminos-1.1.txt',
  sha256: 'c6ffe9ffddd9eaae1e0cf4854feb054c9023a438d927b0a24e75b79148a12254',
  dateLabel: 'Abril de 2026',
});
export const legalArchives = Object.freeze([legacyTerms]);

// The proposed texts in docs/ are outside public/ and the application import graph.
export const legalPublication = Object.freeze({
  state: 'legacy',
  terms: legacyTerms,
  privacy: null,
  provider: null,
});

export function requiresVersionedAcceptance(profile, publication = legalPublication) {
  return publication.state === 'approved' && ['dueño', 'cajero'].includes(profile?.role);
}

export function termsFor(profile, publication = legalPublication) {
  return profile?.role === 'superadmin' ? legacyTerms : publication.terms;
}

export function legalAcceptanceMarker({ id, uid, businessId, role, termsVersion, termsSha256 }) {
  return { id, uid, businessId, role, termsVersion, termsSha256 };
}

export function hasCurrentTerms(profile, publication = legalPublication) {
  if (!profile) return false;
  if (!requiresVersionedAcceptance(profile, publication)) {
    return profile.hasAcceptedTerms === true && (profile.termsVersion == null || profile.termsVersion === legacyTerms.version);
  }
  const evidence = profile.legalAcceptance;
  return Boolean(evidence && profile.uid && evidence.uid === profile.uid && evidence.businessId === profile.businessId && evidence.role === profile.role
    && evidence.termsVersion === publication.terms.version && evidence.termsSha256 === publication.terms.sha256
    && /^[A-Za-z0-9]{20}$/.test(evidence.id));
}

export async function fetchLegalText(document, signal) {
  const response = await fetch(document.path, { signal });
  if (!response.ok || !response.headers.get('Content-Type')?.startsWith('text/plain')) {
    throw new Error('No se pudo cargar el documento oficial.');
  }
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (sha256 !== document.sha256) throw new Error('El documento no coincide con la versión oficial.');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
