import { getIdentityKey } from './identity.js';
let profile = null, license = null;

// In-memory server evidence only. Presentation cache never sets either grant.
export function setProfileAuthority(user, confirmed) {
  if (!user) { if (profile) profile = { ...profile, confirmed: false }; return; }
  const key = getIdentityKey(user);
  if (profile?.key !== key) license = null;
  profile = { uid: user.uid, businessId: user.businessId, role: user.role, key, confirmed: confirmed === true };
}
export function resetAccessAuthority() { profile = null; license = null; }
export function setLicenseAuthority(key, confirmed) {
  if (profile?.key === key) license = { key, confirmed: confirmed === true };
}
export function assertConfirmedWrite({ uid, online, profileOnly = false }) {
  if (!online || !uid || profile?.uid !== uid || !profile.confirmed
    || (!profileOnly && profile.role !== 'superadmin' && (license?.key !== profile.key || !license.confirmed))) {
    throw Object.assign(new Error('Operación bloqueada: conecta el dispositivo y espera la confirmación de cuenta, negocio y licencia. Los pendientes se conservan.'), { code: 'access-unverified' });
  }
}


const denied = new Set();
export function isAccessCacheDenied(scope) {
  try { return denied.has(scope) || sessionStorage.getItem(`migapos:access-denied:${scope}`) === '1'; }
  catch { return denied.has(scope); }
}
export function recordAccessDenial(scope, value) {
  if (value) denied.add(scope); else denied.delete(scope);
  try { if (value) sessionStorage.setItem(`migapos:access-denied:${scope}`, '1'); else sessionStorage.removeItem(`migapos:access-denied:${scope}`); }
  catch { /* A restrictive in-memory verdict still applies when storage is unavailable. */ }
}


// Historical absence is presentation metadata, never a write grant.
const absentTenants = new Set();
export function wasTenantAbsent(scope) {
  try { return absentTenants.has(scope) || localStorage.getItem(`migapos:tenant-absent:${scope}`) === '1'; }
  catch { return absentTenants.has(scope); }
}
export function rememberTenantAbsence(scope, absent) {
  if (absent) absentTenants.add(scope); else absentTenants.delete(scope);
  try { if (absent) localStorage.setItem(`migapos:tenant-absent:${scope}`, '1'); else localStorage.removeItem(`migapos:tenant-absent:${scope}`); }
  catch { /* Missing metadata requires a later server check; existing data is retained. */ }
}
