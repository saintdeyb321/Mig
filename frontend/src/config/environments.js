export const environments = Object.freeze({
  production: { projectId: 'migapos', hostingSite: 'migapos-peru', authDomain: 'migapos.firebaseapp.com', region: 'us-central1' },
  emulator: { projectId: 'demo-migapos', hostingSite: null, authDomain: 'demo-migapos.firebaseapp.com', region: 'us-central1' },
  // No staging resources exist. A future independent project must be explicitly configured.
  staging: { projectId: null, hostingSite: null, authDomain: null, region: 'us-central1' },
});

export function environmentFor(name, profiles = environments) {
  const profile = profiles[name];
  if (!profile?.projectId || (name !== 'emulator' && !profile.hostingSite)) throw new Error(`Entorno ${name}: configuración pendiente.`);
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(profile.projectId)) throw new Error('Project ID inválido.');
  if (name === 'emulator' && profile.projectId !== 'demo-migapos') throw new Error('Emuladores requieren demo-migapos.');
  if (name !== 'emulator' && profile.projectId.startsWith('demo-')) throw new Error('Un identificador demo solo puede usar emuladores.');
  if (name !== 'emulator' && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(profile.hostingSite)) throw new Error('Hosting site inválido.');
  if (name === 'staging' && (profile.projectId === profiles.production.projectId || profile.hostingSite === profiles.production.hostingSite)) throw new Error('Staging debe estar separado de producción.');
  if (!/^[a-z0-9-]+\.firebaseapp\.com$/.test(profile.authDomain) || !/^[a-z]+-[a-z]+\d$/.test(profile.region)) throw new Error('Auth domain o región inválidos.');
  if (![`${profile.projectId}.firebaseapp.com`, `${profile.hostingSite}.firebaseapp.com`].includes(profile.authDomain)) throw new Error('Auth domain no pertenece al proyecto/site configurado.');
  return { ...profile, name, emulator: name === 'emulator' };
}

export function validateWebEnvironment(env, requested, profiles = environments) {
  if (Object.keys(env).some(key => key.startsWith('VITE_') && /PRIVATE|PASSWORD|SECRET|SERVICE_ACCOUNT|ACCESS_TOKEN|REFRESH_TOKEN/i.test(key))) throw new Error('Las variables VITE_ no pueden contener credenciales privadas.');
  const name = requested || env.VITE_APP_ENV || (env.VITE_FIREBASE_PROJECT_ID === 'demo-migapos' ? 'emulator' : 'production');
  const profile = environmentFor(name, profiles);
  const required = ['API_KEY', 'PROJECT_ID', 'AUTH_DOMAIN', 'MESSAGING_SENDER_ID', 'APP_ID'];
  for (const field of required) if (!env[`VITE_FIREBASE_${field}`]?.trim()) throw new Error(`Falta configuración Firebase: VITE_FIREBASE_${field}`);
  if (env.VITE_APP_ENV && env.VITE_APP_ENV !== name) throw new Error('VITE_APP_ENV no coincide con el entorno solicitado.');
  if (env.VITE_FIREBASE_PROJECT_ID !== profile.projectId || env.VITE_FIREBASE_AUTH_DOMAIN !== profile.authDomain) throw new Error('Proyecto/Auth domain no corresponden al entorno.');
  const buckets = profile.storageBucket ? [profile.storageBucket] : [`${profile.projectId}.appspot.com`, `${profile.projectId}.firebasestorage.app`];
  if (name === 'staging' && [profiles.production.storageBucket, `${profiles.production.projectId}.appspot.com`, `${profiles.production.projectId}.firebasestorage.app`].filter(Boolean).includes(env.VITE_FIREBASE_STORAGE_BUCKET)) throw new Error('Staging no puede usar Storage de producción.');
  if (env.VITE_FIREBASE_STORAGE_BUCKET && !buckets.includes(env.VITE_FIREBASE_STORAGE_BUCKET)) throw new Error('Storage bucket no corresponde al proyecto.');
  if (!env.VITE_FIREBASE_APP_ID.startsWith(`1:${env.VITE_FIREBASE_MESSAGING_SENDER_ID}:web:`)) throw new Error('App ID/Sender ID incompatibles.');
  if (env.VITE_USE_EMULATORS && env.VITE_USE_EMULATORS !== String(profile.emulator)) throw new Error('No mezclar proyecto real y emuladores.');
  if (!['off', 'monitor'].includes(env.VITE_APP_CHECK_MODE || 'off')) throw new Error('Modo App Check inválido.');
  if (profile.emulator && env.VITE_APP_CHECK_MODE && env.VITE_APP_CHECK_MODE !== 'off') throw new Error('App Check real no se activa en Emulator/CI.');
  if (env.VITE_APP_CHECK_MODE === 'monitor' && !/^[A-Za-z0-9_-]{20,}$/.test(env.VITE_APP_CHECK_SITE_KEY || '')) throw new Error('Falta la clave pública válida de reCAPTCHA Enterprise.');
  return profile;
}

export function hostingHeaders(profile, { appCheck = false } = {}) {
  const connection = profile.emulator ? ['http://127.0.0.1:9099', 'http://127.0.0.1:8080']
    : ['https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com', 'https://firestore.googleapis.com', 'https://firebaseinstallations.googleapis.com', 'https://firebase.googleapis.com', 'https://www.google-analytics.com', 'https://region1.google-analytics.com', 'https://analytics.google.com'];
  const frames = profile.emulator ? ['http://127.0.0.1:9099'] : [`https://${profile.authDomain}`, 'https://accounts.google.com'];
  // Firebase's popup resolver loads GAPI even when its Auth helper is local to Emulator.
  const scripts = ['https://apis.google.com', ...(profile.emulator ? [] : ['https://www.googletagmanager.com'])];
  if (appCheck && !profile.emulator) { scripts.push('https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/'); frames.push('https://www.google.com/recaptcha/'); connection.push('https://recaptchaenterprise.googleapis.com', 'https://www.google.com/recaptcha/'); }
  // React/toasts and print layouts require inline styles. Scripts remain external; this is not a strict CSP.
  const policy = `default-src 'self'; script-src 'self' ${scripts.join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://www.gstatic.com; font-src 'self'; connect-src 'self' ${connection.join(' ')}; frame-src 'self' ${frames.join(' ')}; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`;
  return [
    { key: 'Content-Security-Policy', value: policy }, { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' }, { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];
}
