import { createHash, randomUUID } from 'node:crypto';
import * as logger from 'firebase-functions/logger';
import { SaleError } from '../sales/domain/saleModel.js';

export const opaqueId = value => value == null ? undefined : createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
const safeCode = value => /^[a-z0-9-]{1,64}$/.test(String(value)) ? String(value) : 'internal';
export function observeOperation(operation, handler, { log = logger, now = Date.now } = {}) {
  return async request => {
    const start = now(), data = request?.data;
    const trace = request?.rawRequest?.get?.('x-cloud-trace-context')?.match(/^([a-f0-9]{32})\//)?.[1];
    const context = { event: 'operation', operation, requestId: trace || randomUUID(),
      operationId: opaqueId(data?.operationId ?? data?.saleId ?? data?.localId ?? data?.contractId),
      appCheck: request?.app ? 'verified' : 'missing' };
    const emit = (level, fields) => {
      try { log[level]('operation_result', { ...context, durationMs: Math.max(0, now() - start), slow: now() - start >= 2000, ...fields }); } catch { /* Logging must never change a financial result. */ }
    };
    try {
      const result = await handler(request);
      const retry = /^ALREADY_/.test(result?.status || '');
      const backgroundErrors = Number.isSafeInteger(result?.errors) ? result.errors : 0;
      emit(backgroundErrors ? 'warn' : 'info', { outcome: backgroundErrors ? 'completed_with_errors' : retry ? 'confirmed_retry' : 'confirmed',
        metrics: { retries: Number(retry), reconciliation_pending: Number(result?.reconciliationPending === true), background_errors: backgroundErrors } });
      return result;
    } catch (error) {
      const expected = error instanceof SaleError;
      const code = safeCode(error?.code);
      emit(expected ? 'info' : 'error', { outcome: expected ? 'rejected' : 'failed', errorCode: code,
        metrics: { function_errors: Number(!expected), sales_rejected: Number(expected && operation === 'submitSale') } });
      throw error;
    }
  };
}

export function logJobState(before, after, log = logger) {
  if (!after || before?.status === after.status || !['failed', 'completed', 'cancelled'].includes(after.status)) return;
  const failed = after.status === 'failed';
  log[failed ? 'error' : 'info']('platform_job_result', { event: 'platform_job', operation: ['backup', 'purge', 'restore-dry-run'].includes(after.kind) ? after.kind : 'job',
    operationId: opaqueId(after.id), outcome: after.status, errorCode: failed ? safeCode(after.lastError) : undefined,
    metrics: { backups_failed: Number(failed && after.kind === 'backup'), purge_jobs_failed: Number(failed && after.kind === 'purge') } });
}
