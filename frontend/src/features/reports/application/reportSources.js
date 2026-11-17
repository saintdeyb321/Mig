/**
 * @typedef {object} DocumentReportReaders
 * @property {object} dashboardReads - Period readers for the existing dashboard model.
 * @property {object} exportReads - Authorized snapshot and on-demand contract audit readers.
 *
 * @typedef {DocumentReportReaders & { kind: 'detailed', representation: 'documents' }} DetailedReportSource
 * @typedef {DocumentReportReaders & { kind: 'summary', representation: 'document-fallback' }} SummaryReportSource
 */

/** @returns {DetailedReportSource | SummaryReportSource} */
export function reportSourceForPeriod(period, reads) {
  const { sales, payments, contracts, voids, exportSnapshot, withContractAudit, discardSnapshot } = reads;
  const documentSource = {
    dashboardReads: { readSales: sales, readPayments: payments, readContracts: contracts, readVoids: voids },
    exportReads: { exportSnapshot, withContractAudit, discardSnapshot },
  };
  if (period.filter === 'hoy' || period.filter === 'semana') return { ...documentSource, kind: 'detailed', representation: 'documents' };
  // The monthly/yearly adapter keeps the existing document source until a complete projection is verified.
  return { ...documentSource, kind: 'summary', representation: 'document-fallback' };
}
