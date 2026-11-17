/**
 * @typedef {object} DocumentReportReaders
 * @property {object} dashboardReads - Period readers for the existing dashboard model.
 * @property {object} exportReads - Authorized snapshot and on-demand contract audit readers.
 *
 * @typedef {DocumentReportReaders & { kind: 'detailed', representation: 'documents' }} DetailedReportSource
 * @typedef {DocumentReportReaders & { kind: 'summary', representation: 'document-fallback' }} SummaryReportSource
 */

export const reportExportSummariesEnabled = import.meta.env?.VITE_REPORT_EXPORT_SUMMARIES_ENABLED === 'true';
export const isSummaryPeriod = period => ['mes', 'todo'].includes(period.filter);

/** @returns {DetailedReportSource | SummaryReportSource} */
export function reportSourceForPeriod(period, reads) {
  const { sales, payments, contracts, voids, exportSnapshot, withContractAudit, discardSnapshot } = typeof reads === 'function' ? reads() : reads;
  const documentSource = {
    dashboardReads: { readSales: sales, readPayments: payments, readContracts: contracts, readVoids: voids },
    exportReads: { exportSnapshot, withContractAudit, discardSnapshot },
  };
  if (!isSummaryPeriod(period)) return { ...documentSource, kind: 'detailed', representation: 'documents' };
  // The dashboard and explicitly authorized historical exports use the existing document source.
  return { ...documentSource, kind: 'summary', representation: 'document-fallback' };
}

export function exportReportSourceForPeriod(period, reads, { readSummary, acceptHistorical = false,
  enabled = reportExportSummariesEnabled } = {}) {
  if (!isSummaryPeriod(period) || acceptHistorical) return reportSourceForPeriod(period, reads);
  return { kind: 'summary', representation: 'snapshots', readSummary: async () => {
    if (!enabled || !readSummary) throw Object.assign(new Error('Resumen no disponible. Falta habilitar la fuente verificada.'),
      { code: 'report-summary-pending' });
    return readSummary();
  } };
}
