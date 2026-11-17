/**
 * @typedef {object} DocumentReportReaders
 * @property {object} dashboardReads - Period readers for the existing dashboard model.
 * @property {object} exportReads - Authorized snapshot and on-demand contract audit readers.
 *
 * @typedef {DocumentReportReaders & { kind: 'detailed', representation: 'documents' }} DetailedReportSource
 * @typedef {DocumentReportReaders & { kind: 'summary', representation: 'document-fallback' }} SummaryReportSource
 */

/** @returns {DetailedReportSource | SummaryReportSource | {kind: 'summary', representation: 'snapshots', readSummary: Function}} */
export const reportSummariesEnabled = import.meta.env?.VITE_REPORT_SUMMARIES_ENABLED === 'true';
export const isSummaryPeriod = period => ['mes', 'todo'].includes(period.filter);

export function reportSourceForPeriod(period, reads, { readSummary } = {}) {
  if (isSummaryPeriod(period) && readSummary) return { kind: 'summary', representation: 'snapshots', readSummary };
  const { sales, payments, contracts, voids, exportSnapshot, withContractAudit, discardSnapshot } = typeof reads === 'function' ? reads() : reads;
  const documentSource = {
    dashboardReads: { readSales: sales, readPayments: payments, readContracts: contracts, readVoids: voids },
    exportReads: { exportSnapshot, withContractAudit, discardSnapshot },
  };
  if (!isSummaryPeriod(period)) return { ...documentSource, kind: 'detailed', representation: 'documents' };
  // The monthly/yearly adapter keeps the existing document source until a complete projection is verified.
  return { ...documentSource, kind: 'summary', representation: 'document-fallback' };
}
