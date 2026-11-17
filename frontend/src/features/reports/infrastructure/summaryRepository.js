import { auth, db } from '../../../core/firebase/client.js';
import { createVerifiedSummaryReader } from './summaryReader.js';

export const readVerifiedSummary = createVerifiedSummaryReader(db, { currentUid: () => auth.currentUser?.uid });
