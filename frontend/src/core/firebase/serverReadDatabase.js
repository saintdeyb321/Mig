import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore/lite';
import { auth } from './client.js';

let database;

// Firestore Lite provides server-only reads without sharing the full SDK's persistent cache.
export function getServerReadDatabase() {
  if (!database) {
    database = getFirestore(auth.app);
    if (auth.app.options.projectId === 'demo-migapos') connectFirestoreEmulator(database, '127.0.0.1', 8080);
  }
  return database;
}
