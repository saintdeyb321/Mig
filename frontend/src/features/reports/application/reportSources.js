/**
 * @typedef {object} DocumentReportReaders
 * @property {object} dashboardReads - Period readers for the existing dashboard model.
 * @property {object} exportReads - Authorized snapshot and on-demand contract audit readers.
 *
 * @typedef {DocumentReportReaders & { kind: 'detailed', representation: 'documents' }} DetailedReportSource
 * @typedef {{kind: 'summary', representation: 'snapshots', readSummary: Function}} SummaryReportSource
 */

export const isSummaryPeriod = period => ['mes', 'todo'].includes(period.filter);

/** @returns {DetailedReportSource | SummaryReportSource} */
export function reportSourceForPeriod(period, reads, { readSummary } = {}) {
  if (isSummaryPeriod(period)) return { kind: 'summary', representation: 'snapshots', readSummary: async options => {
    if (!readSummary) throw Object.assign(new Error('Resumen no disponible. Falta una fuente verificada.'),
      { code: 'report-summary-pending' });
    try { return await readSummary(options); }
    catch (error) {
      if (error.name === 'AbortError' || ['report-summary-pending', 'report-bootstrap-required', 'report-history-unverified', 'report-integrity'].includes(error.code)) throw error;
      throw Object.assign(new Error('Resumen no disponible. Comprueba la conexión y la cobertura del período.'),
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
