import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { createReportBackfill } from './backfill.js';
import { createProjectionStore } from './projectionStore.js';
import { sourceTypes } from './summaryModel.js';

export function reportingFunctions(database, env = process.env) {
  if (env.REPORT_SUMMARIES_ENABLED !== 'true') return {};
  const maxDocuments = Number(env.REPORT_MAX_SOURCE_DOCUMENTS);
  if (!Number.isSafeInteger(maxDocuments) || maxDocuments < 100 || maxDocuments > 40000) {
    throw new Error('REPORT_MAX_SOURCE_DOCUMENTS requiere un presupuesto explícito entre 100 y 40000.');
  }
  const projection = createProjectionStore(database), backfill = createReportBackfill(database);
  const triggers = Object.fromEntries(sourceTypes.map(source => [source, onDocumentWritten({
    document: source + '/{sourceId}', region: 'us-central1', retry: true, maxInstances: 5,
  }, async event => {
    try { await projection.sync(source, event.params.sourceId); }
    catch (error) {
      if (!['report-evidence', 'report-budget', 'report-source-deleted', 'migration-required'].includes(error.code)) throw error;
      await projection.quarantine(source, [event.data?.before.data(), event.data?.after.data()]);
    }
  })]));
  return { ...triggers, reconcile: onSchedule({ schedule: 'every 5 minutes', timeZone: 'America/Lima', region: 'us-central1',
    maxInstances: 1, timeoutSeconds: 240, memory: '512MiB' }, async () => {
    const states = await backfill.sweep({ maxDocuments, limit: 4 });
    console.info('report_projection', states);
  }) };
}
