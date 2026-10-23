import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { validateWebEnvironment } from '../../config/environments.js';
import { reportDiagnostic } from '../errors/diagnostics.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from 'firebase/firestore';

function readFirebaseConfig(env) {
  const requiredVariables = {
    apiKey: 'VITE_FIREBASE_API_KEY',
    authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
    projectId: 'VITE_FIREBASE_PROJECT_ID',
    storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
    messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
    appId: 'VITE_FIREBASE_APP_ID',
  };
  const config = {};
  const missingVariables = [];

  for (const [field, variable] of Object.entries(requiredVariables)) {
    const value = env[variable]?.trim();
    if (!value) {
      missingVariables.push(variable);
      continue;
    }
    config[field] = value;
  }

  if (missingVariables.length) {
    throw new Error(
      `Falta configuración Firebase: ${missingVariables.join(', ')}. ` +
      'Completa frontend/.env.local usando frontend/.env.example.',
    );
  }

  const measurementId = env.VITE_FIREBASE_MEASUREMENT_ID?.trim();
  if (measurementId) config.measurementId = measurementId;
  return config;
}

const firebaseConfig = readFirebaseConfig(import.meta.env);
const environment = validateWebEnvironment(import.meta.env);
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, environment.region);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
if (environment.emulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
export const appCheckReady = (async () => {
  if (environment.emulator || import.meta.env.VITE_APP_CHECK_MODE !== 'monitor') return;
  try {
    const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_APP_CHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
  } catch (error) { reportDiagnostic('functions', error, 'pending'); }
})();

// Analytics is optional and becomes available asynchronously in supported browsers.
export let analytics = null;

async function initializeOptionalAnalytics() {
  if (environment.emulator || !firebaseConfig.measurementId || typeof window === 'undefined') return;

  try {
    const { getAnalytics, isSupported } = await import('firebase/analytics');
    if (await isSupported()) analytics = getAnalytics(app);
  } catch {
    console.warn('Firebase Analytics no está disponible en este entorno.');
  }
}

void initializeOptionalAnalytics();
