import { auth, db } from '../../../core/firebase/client.js';
import { createSparkSummaryReader } from './sparkSummaryReader.js';
import { createSparkReportMigration } from './sparkReportMigration.js';

export const readVerifiedSummary = createSparkSummaryReader(db, { currentUid: () => auth.currentUser?.uid });
export const prepareReportHistory = createSparkReportMigration(db, { currentUid: () => auth.currentUser?.uid });
