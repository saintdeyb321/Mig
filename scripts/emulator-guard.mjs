import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export function assertEmulatorEnvironment(env) {
  if (env.GCLOUD_PROJECT !== 'demo-migapos') throw new Error('Las pruebas destructivas solo aceptan GCLOUD_PROJECT=demo-migapos.');
  const expected = { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199' };
  for (const [key, value] of Object.entries(expected)) if (env[key] !== value) throw new Error(`Emulator requerido: ${key}=${value}.`);
  if (env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_PROJECT_ID !== 'demo-migapos') throw new Error('Las pruebas no pueden usar configuración Web de producción.');
  if (env.FIREBASE_CONFIG && JSON.parse(env.FIREBASE_CONFIG).projectId !== 'demo-migapos') throw new Error('FIREBASE_CONFIG no corresponde al Emulator.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { assertEmulatorEnvironment(process.env); console.log('Emuladores locales demo-migapos verificados.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
