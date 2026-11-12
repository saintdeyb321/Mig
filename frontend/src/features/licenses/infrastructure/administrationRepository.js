import { confirmedWrite } from '../../../core/firebase/confirmedWrite.js';
import { callBackend } from '../../../core/firebase/callable.js';
import { db, auth } from '../../../core/firebase/client.js';
import { createSparkAdministrationRepository } from './sparkAdministrationRepository.js';
import * as lite from 'firebase/firestore/lite';
import { getPlatformReadDatabase } from '../../backups/infrastructure/remoteBackup.js';

const currentUser = () => auth.currentUser;
const repository = createSparkAdministrationRepository(db, { currentUser });
let reader;
const readRepository = () => reader ??= createSparkAdministrationRepository(getPlatformReadDatabase(), { currentUser,
  sdk: { ...lite, getDocFromServer: lite.getDoc, getDocsFromServer: lite.getDocs } });
export const administrationPage = data => readRepository().administrationPage(data);
export const administrationContact = data => readRepository().administrationContact(data);
export const administrationLicense = data => readRepository().administrationLicense(data);
export const adminCall = confirmedWrite((name, data) => Object.hasOwn(repository, name) ? repository[name](data) : callBackend(name, data));
