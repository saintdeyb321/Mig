import * as lite from 'firebase/firestore/lite';
import { auth } from '../../../core/firebase/client.js';
import { createBackupRepository } from './backupRepository.js';

let read, platformDatabase;
export function getPlatformReadDatabase() {
  if (!platformDatabase) {
    platformDatabase = lite.getFirestore(auth.app);
    if (auth.app.options.projectId === 'demo-migapos') lite.connectFirestoreEmulator(platformDatabase, '127.0.0.1', 8080);
  }
  return platformDatabase;
}
// Explicit one-shot server reads. Keep the full SDK's listeners/offline cache untouched.
export function readRemoteBackup(options) {
  if (!read) {
    const database = getPlatformReadDatabase();
    read = createBackupRepository(database, { currentUser: () => auth.currentUser,
      sdk: { ...lite, getDocFromServer: lite.getDoc, getDocsFromServer: lite.getDocs } });
  }
  return read(options);
}
