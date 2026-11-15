export const legalRoutes = Object.freeze({ terms: '/legal/terminos', privacy: '/legal/privacidad' });
export const legalTitles = Object.freeze({ terms: 'Términos y Condiciones', privacy: 'Política de Privacidad' });

export const legacyTerms = Object.freeze({
  version: '1.1',
  path: '/legal/terminos-1.1.txt',
  sha256: '0f012fdb5bef0a04ec051701964852453b3cf62d804184840b03b86405dd4771',
  dateLabel: 'Noviembre de 2026',
});
export const legalArchives = Object.freeze([legacyTerms]);

export const legalPublication = Object.freeze({
  state: 'approved',
  terms: legacyTerms,
  privacy: Object.freeze({
    version: '1.0',
    path: '/legal/privacidad-1.0.txt',
    sha256: 'abf245649048e8c50cd595d6aa90fc03271ed3f93a8b387727b44758ba0174d8',
    dateLabel: '15 de noviembre de 2026',
  }),
  provider: Object.freeze({
    name: 'Deyvid Alexander Pariona Ramos',
    ruc: '10735959811',
    address: 'Av. Ramón Castilla S/N, Concepción, Junín, Perú',
    supportEmail: 'deyvidparionaramos@gmail.com',
    privacyEmail: 'deyvidparionaramos@gmail.com',
    complaintsRequired: true,
    complaintsUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSfobnWtfvGtFoDqeDMGcIQvFmBOpKdYkCFmyfA4rlzkHMAtKg/viewform?usp=publish-editor',
  }),
});

export function requiresVersionedAcceptance(profile, publication = legalPublication) {
  return publication.state === 'approved' && ['dueño', 'cajero'].includes(profile?.role);
}

export function termsFor(profile, publication = legalPublication) {
  return profile?.role === 'superadmin' ? legacyTerms : publication.terms;
}

export function legalAcceptanceMarker({ id, uid, businessId, role, termsVersion, termsSha256, privacyVersion, privacySha256 }) {
  return { id, uid, businessId, role, termsVersion, termsSha256, privacyVersion, privacySha256 };
}

export function legalConfirmationComplete(confirmation, needsPrivacy = true) {
  return confirmation?.acceptedTerms === true && (!needsPrivacy || confirmation.acknowledgedPrivacy === true);
}

export function legalAcceptanceEvidence({ id, uid, businessId, role }, publication, acceptedAt) {
  return {
    id, uid, businessId, role, acceptedAt,
    termsVersion: publication.terms.version, termsSha256: publication.terms.sha256,
    privacyVersion: publication.privacy.version, privacySha256: publication.privacy.sha256,
  };
}

export function hasCurrentTerms(profile, publication = legalPublication) {
  if (!profile) return false;
  if (!requiresVersionedAcceptance(profile, publication)) {
    return profile.hasAcceptedTerms === true && (profile.termsVersion == null || profile.termsVersion === legacyTerms.version);
  }
  const evidence = profile.legalAcceptance;
  return Boolean(publication.privacy && evidence && profile.uid && evidence.uid === profile.uid && evidence.businessId === profile.businessId && evidence.role === profile.role
    && evidence.termsVersion === publication.terms.version && evidence.termsSha256 === publication.terms.sha256
    && evidence.privacyVersion === publication.privacy.version && evidence.privacySha256 === publication.privacy.sha256
    && typeof evidence.id === 'string' && /^[A-Za-z0-9]{20}$/.test(evidence.id));
}

export async function fetchLegalText(document, signal) {
  const response = await fetch(document.path, { signal, cache: 'no-cache' });
  if (!response.ok || !response.headers.get('Content-Type')?.startsWith('text/plain')) {
    throw new Error('No se pudo cargar el documento oficial.');
  }
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (sha256 !== document.sha256) throw new Error('El documento no coincide con la versión oficial.');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
