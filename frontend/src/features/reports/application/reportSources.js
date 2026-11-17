/**
 * @typedef {object} DocumentReportReaders
 * @property {object} dashboardReads - Period readers for the existing dashboard model.
 * @property {object} exportReads - Authorized snapshot and on-demand contract audit readers.
 *
 * @typedef {DocumentReportReaders & { kind: 'detailed', representation: 'documents' }} DetailedReportSource
 * @typedef {{kind: 'summary', representation: 'snapshots', readSummary: Function}} SummaryReportSource
 */

export const reportExportSummariesEnabled = import.meta.env?.VITE_REPORT_EXPORT_SUMMARIES_ENABLED === 'true';
export const isSummaryPeriod = period => ['mes', 'todo'].includes(period.filter);

/** @returns {DetailedReportSource | SummaryReportSource} */
export function reportSourceForPeriod(period, reads, { readSummary, enabled = reportExportSummariesEnabled } = {}) {
  if (isSummaryPeriod(period)) return { kind: 'summary', representation: 'snapshots', readSummary: async options => {
    if (!enabled || !readSummary) throw Object.assign(new Error('Resumen no disponible. Pendiente de actualización administrativa.'),
      { code: 'report-summary-pending' });
    try { return await readSummary(options); }
    catch (error) {
      if (error.name === 'AbortError' || error.code === 'report-summary-pending') throw error;
      throw Object.assign(new Error('Resumen no disponible. Comprueba la conexión o solicita actualización administrativa.'),
        { code: 'report-summary-pending', cause: error });
    }
  } };
  const { sales, payments, contracts, voids, exportSnapshot, withContractAudit, discardSnapshot } = typeof reads === 'function' ? reads() : reads;
  const documentSource = {
    dashboardReads: { readSales: sales, readPayments: payments, readContracts: contracts, readVoids: voids },
    exportReads: { exportSnapshot, withContractAudit, discardSnapshot },
  };
  return { ...documentSource, kind: 'detailed', representation: 'documents' };
}
