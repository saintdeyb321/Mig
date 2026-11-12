import * as lite from 'firebase/firestore/lite';
import { auth } from '../../../core/firebase/client.js';
import { createBackupRepository } from './backupRepository.js';
import { getServerReadDatabase } from '../../../core/firebase/serverReadDatabase.js';

export { getServerReadDatabase as getPlatformReadDatabase };
let read;
// Explicit one-shot server reads. Keep the full SDK's listeners/offline cache untouched.
export function readRemoteBackup(options) {
  if (!read) {
    const database = getServerReadDatabase();
    read = createBackupRepository(database, { currentUser: () => auth.currentUser,
      sdk: { ...lite, getDocFromServer: lite.getDoc, getDocsFromServer: lite.getDocs } });
  }
  return read(options);
}
