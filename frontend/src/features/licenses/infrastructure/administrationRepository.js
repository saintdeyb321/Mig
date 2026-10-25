import { confirmedWrite } from '../../../core/firebase/confirmedWrite.js';
import { callBackend } from '../../../core/firebase/callable.js';
import { db, auth } from '../../../core/firebase/client.js';
import { createSparkAdministrationRepository } from './sparkAdministrationRepository.js';

const repository = createSparkAdministrationRepository(db, { currentUser: () => auth.currentUser });
export const administrationPage = data => repository.administrationPage(data);
export const adminCall = confirmedWrite((name, data) => Object.hasOwn(repository, name) ? repository[name](data) : callBackend(name, data));
