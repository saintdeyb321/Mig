import { canonicalJSON, sha256 } from '../../backups/domain/backupFile.js';
import { cashExpiryWindow } from '../../cash-register/domain/cashExpiry.js';
import { toDateSafe } from '../../../core/dates/dateValues.js';
import { classifyCashEvent, verifiedCashDifference } from '../application/cashAuditRows.js';
import { reportViewModel } from '../application/reportViewModel.js';
import { dayDate, reportDay, reportPeriod } from './reportPeriod.js';
import { aggregateReport, emptyMetrics } from './reportTotals.js';
import { contractCounts } from './sparkReport.js';

const MAX_JSON_BYTES = 512 * 1024;
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const coverageBySource = {
  sales: ['sparkSales', 'legacySales'], payments: ['migratedLedger', 'legacyLedger'],
  voids: ['posVoids'], contracts: ['createdContracts', 'contractCancellations'], sessions: ['cashSessions'],
};
const coverageKeys = Object.values(coverageBySource).flat();
const issues = ['source-coverage-missing', 'legacy-void-unlinked', 'cancellation-date-unverified', 'contract-status-unverified'];
const contractStatuses = ['pendiente', 'en_produccion', 'listo_para_entrega', 'entregado', 'entregado_con_deuda', 'cancelado'];
const financeKeys = ['netCents', 'posNetCents', 'contractNetCents', 'cashNetCents', 'digitalNetCents'];
const countKeys = ['tickets', 'voidedTickets', 'contractPayments', 'adjustments', 'contractsCreated',
  'contractsPending', 'contractsDelivered', 'createdContractsCancelled', 'contractsWithDebt', 'contractsCancelledInPeriod'];
const channelKeys = ['collectionsCents', 'posCompensationsCents', 'contractRefundsCents', 'netCents'];
const cashKeys = ['openings', 'closings', 'expiries', 'confirmedBalanced', 'estimatedClosings', 'unverifiedClosings',
  'reviewRequiredCount', 'confirmedShortCents', 'confirmedExtraCents'];
const zero = keys => Object.fromEntries(keys.map(key => [key, 0]));
const emptyBucket = () => ({ finance: zero(financeKeys), counts: zero(countKeys),
  channels: { cash: zero(channelKeys), digital: zero(channelKeys) }, cashReview: zero(cashKeys) });
const bucketKeys = ['finance', 'counts', 'channels', 'cashReview'];
const validId = value => typeof value === 'string' && idPattern.test(value) && value !== 'global';
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function requiredDate(value) {
  const date = toDateSafe(value);
  requireValue(date, 'Fecha de proyección inválida.');
  return date;
}
function safeInteger(value) {
  requireValue(Number.isSafeInteger(value), 'La proyección requiere enteros seguros.');
  return value || 0;
}
function cents(value) {
  const result = safeInteger(Math.round(value * 100));
  requireValue(typeof value === 'number' && result / 100 === value, 'Importe de proyección fuera de céntimos.');
  return result;
}
function monthPeriod(key) {
  requireValue(typeof key === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(key), 'Mes de proyección inválido.');
  const period = reportPeriod('mes', dayDate(key + '-01'));
  requireValue(period.start === key + '-01', 'Mes de proyección inválido.');
  return period;
}
function assertKeys(value, keys) {
  requireValue(value && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), 'Estructura de proyección inválida.');
}
function freeze(value) {
  for (const item of Object.values(value)) if (item && typeof item === 'object') freeze(item);
  return Object.freeze(value);
}
function distinctRows(rows, businessId) {
  const records = new Map();
  for (const row of rows) {
    requireValue(row?.businessId === businessId && validId(row.branchId) && validId(row.id), 'Registro fuera del negocio o sin identidad verificable.');
    requireValue(!row.isOffline && !row.hasPendingWrites && !row.fromCache, 'La proyección requiere registros confirmados.');
    const signature = canonicalJSON(row);
    const previous = records.get(row.id);
    requireValue(!previous || previous.signature === signature, 'Hay registros en conflicto para el mismo identificador.');
    if (!previous) records.set(row.id, { signature, row });
  }
  return [...records].sort(([a], [b]) => compareText(a, b)).map(([, { row }]) => row);
}
function cashSummary(events) {
  const summary = zero(cashKeys);
  for (const event of events) {
    if (classifyCashEvent(event).incident) summary.reviewRequiredCount++;
    if (event.kind === 'opening') summary.openings++;
    if (event.kind === 'expiry') summary.expiries++;
    if (event.kind !== 'closing') continue;
    summary.closings++;
    if (event.estimated) summary.estimatedClosings++;
    if (!verifiedCashDifference(event) || !Number.isFinite(event.reference)) summary.unverifiedClosings++;
    else if (event.difference === 0) summary.confirmedBalanced++;
    else {
      const key = event.difference < 0 ? 'confirmedShortCents' : 'confirmedExtraCents';
      summary[key] = safeInteger(summary[key] + cents(event.difference));
    }
  }
  return summary;
}
function makeBucket({ metrics = emptyMetrics(), orders = [], cancelled = 0, events = [] }) {
  const status = contractCounts(orders);
  const channel = ({ collections, posCompensations, contractRefunds, net }) => ({
    collectionsCents: cents(collections), posCompensationsCents: cents(posCompensations),
    contractRefundsCents: cents(contractRefunds), netCents: cents(net),
  });
  return {
    finance: { netCents: cents(metrics.netRevenue), posNetCents: cents(metrics.posRevenue), contractNetCents: cents(metrics.contractRevenue),
      cashNetCents: cents(metrics.cashRevenue), digitalNetCents: cents(metrics.digitalRevenue) },
    counts: { tickets: metrics.posTicketCount, voidedTickets: metrics.voidedTicketCount, contractPayments: metrics.contractPaymentCount,
      adjustments: metrics.refundCount, contractsCreated: orders.length, contractsPending: status.pending, contractsDelivered: status.delivered,
      createdContractsCancelled: status.cancelled, contractsWithDebt: status.withDebt, contractsCancelledInPeriod: cancelled },
    channels: { cash: channel(metrics.channels.cash), digital: channel(metrics.channels.digital) },
    cashReview: cashSummary(events),
  };
}
function bucketsFor(model, orders, cancellations, events, basis) {
  const groups = new Map();
  const group = key => {
    if (!groups.has(key)) groups.set(key, { metrics: [], orders: [], cancelled: 0, events: [] });
    return groups.get(key);
  };
  const id = basis === 'branchId' ? row => row.branchId : (_row, date) => reportDay(date);
  const metrics = basis === 'branchId' ? model.branches.values() : model.days;
  for (const metric of metrics) group(metric[basis]).metrics.push(makeBucket({ metrics: metric }));
  for (const order of orders) group(id(order, order.createdAt)).orders.push(order);
  for (const order of cancellations) group(id(order, order.voidedAt)).cancelled++;
  for (const event of events) group(id(event, event.date)).events.push(event);
  return [...groups].sort(([a], [b]) => compareText(a, b)).map(([key, { metrics, orders, cancelled, events }]) => ({
    [basis]: key, ...mergeBuckets([...metrics, makeBucket({ orders, cancelled, events })]),
  }));
}
function checkSummary(snapshot) {
  const { finance, counts, channels, cashReview } = snapshot;
  for (const [record, keys] of [[finance, financeKeys], [counts, countKeys], [cashReview, cashKeys],
    [channels?.cash, channelKeys], [channels?.digital, channelKeys]]) {
    assertKeys(record, keys);
    Object.values(record).forEach(safeInteger);
  }
  assertKeys(channels, ['cash', 'digital']);
  const { cash, digital } = channels;
  for (const channel of [cash, digital]) {
    requireValue(channel.collectionsCents >= 0 && channel.posCompensationsCents <= 0 && channel.contractRefundsCents <= 0
      && safeInteger(channel.collectionsCents + channel.posCompensationsCents + channel.contractRefundsCents) === channel.netCents,
    'Los canales no concilian.');
  }
  requireValue(safeInteger(finance.posNetCents + finance.contractNetCents) === finance.netCents
    && safeInteger(cash.netCents + digital.netCents) === finance.netCents && cash.netCents === finance.cashNetCents
    && digital.netCents === finance.digitalNetCents, 'Los netos de la proyección no concilian.');
  requireValue(Object.values(counts).every(value => value >= 0)
    && counts.contractsCreated === safeInteger(counts.contractsPending + counts.contractsDelivered + counts.createdContractsCancelled)
    && counts.contractsWithDebt <= counts.contractsCreated - counts.createdContractsCancelled, 'Los conteos de la proyección no concilian.');
  requireValue(cashKeys.slice(0, -2).every(key => cashReview[key] >= 0) && cashReview.confirmedShortCents <= 0 && cashReview.confirmedExtraCents >= 0
    && cashReview.estimatedClosings <= cashReview.unverifiedClosings && cashReview.unverifiedClosings <= cashReview.closings
    && cashReview.confirmedBalanced <= cashReview.closings - cashReview.unverifiedClosings
    && cashReview.reviewRequiredCount >= cashReview.expiries
    && cashReview.reviewRequiredCount <= safeInteger(cashReview.expiries + cashReview.closings), 'Los estados de caja no concilian.');
}
function mergeBuckets(rows, template = emptyBucket()) {
  return Object.fromEntries(Object.entries(template).map(([key, value]) => [key, typeof value === 'object'
    ? mergeBuckets(rows.map(row => row[key]), value)
    : rows.reduce((total, row) => safeInteger(total + row[key]), 0)]));
}

export function validateMonthlySnapshotV1(snapshot) {
  assertKeys(snapshot, ['schemaVersion', 'businessId', 'periodKey', 'scope', 'status', 'sourceRevision', 'calculatedThrough',
    'evidenceThrough', 'closed', 'coverage', 'issues', ...bucketKeys, 'branches', 'byDay']);
  requireValue(snapshot.schemaVersion === 1 && validId(snapshot.businessId) && snapshot.scope === 'global'
    && typeof snapshot.sourceRevision === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(snapshot.sourceRevision),
  'Versión, negocio o revisión de la proyección inválidos.');
  const period = monthPeriod(snapshot.periodKey), through = requiredDate(snapshot.calculatedThrough), evidence = requiredDate(snapshot.evidenceThrough);
  requireValue(through.toISOString() === snapshot.calculatedThrough && evidence.toISOString() === snapshot.evidenceThrough
    && through >= period.startDate && +through === Math.min(+evidence, +period.endDate)
    && snapshot.closed === (+through === +period.endDate), 'Cobertura temporal de la proyección inválida.');
  assertKeys(snapshot.coverage, [...coverageKeys, 'products']);
  requireValue(coverageKeys.every(key => typeof snapshot.coverage[key] === 'boolean') && snapshot.coverage.products === 'unavailable',
    'Falta evidencia de cobertura por fuente.');
  requireValue(Array.isArray(snapshot.issues) && new Set(snapshot.issues).size === snapshot.issues.length
    && snapshot.issues.every(issue => issues.includes(issue)), 'Diagnóstico de cobertura inválido.');
  const complete = coverageKeys.every(key => snapshot.coverage[key]);
  if (!complete) {
    requireValue(snapshot.status === 'incomplete' && snapshot.issues.length > 0
      && [...bucketKeys, 'branches', 'byDay'].every(key => snapshot[key] === null), 'Una cobertura incompleta carece de cifras verificables.');
    return snapshot;
  }
  requireValue(['shadow', 'verified'].includes(snapshot.status) && !snapshot.issues.length, 'Estado de la proyección inválido.');
  checkSummary(snapshot);
  for (const [rows, key, valid] of [
    [snapshot.branches, 'branchId', validId],
    [snapshot.byDay, 'day', day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= period.start
      && day <= reportDay(through) && reportDay(dayDate(day)) === day],
  ]) {
    requireValue(Array.isArray(rows), 'Faltan desgloses de la proyección.');
    let prior = '';
    for (const row of rows) {
      assertKeys(row, [key, ...bucketKeys]);
      requireValue(valid(row[key]) && compareText(prior, row[key]) < 0, 'Desglose repetido o fuera de período.');
      prior = row[key];
      checkSummary(row);
    }
    for (const [metric, total] of Object.entries(mergeBuckets(rows))) {
      requireValue(canonicalJSON(total) === canonicalJSON(snapshot[metric]), 'El desglose no concilia con el total global.');
    }
  }
  requireValue(new TextEncoder().encode(JSON.stringify(snapshot)).length <= MAX_JSON_BYTES, 'La proyección supera el presupuesto de tamaño.');
  return snapshot;
}

export function buildMonthlySnapshotV1({ businessId, periodKey, coveredThrough, sourceRevision, coverage, ...sources }) {
  const month = monthPeriod(periodKey), observed = requiredDate(coveredThrough);
  const through = new Date(Math.min(+observed, +month.endDate));
  assertKeys(coverage, coverageKeys);
  requireValue(coverageKeys.every(key => typeof coverage[key] === 'boolean'), 'Falta evidencia de cobertura por fuente.');
  const evidence = { ...coverage, products: 'unavailable' };
  const base = { schemaVersion: 1, businessId, periodKey, scope: 'global', sourceRevision,
    calculatedThrough: through.toISOString(), evidenceThrough: observed.toISOString(),
    closed: +through === +month.endDate, coverage: evidence };
  const incomplete = issues => freeze(validateMonthlySnapshotV1({ ...base, status: 'incomplete', issues,
    finance: null, counts: null, channels: null, cashReview: null, branches: null, byDay: null }));
  for (const [source, keys] of Object.entries(coverageBySource)) {
    if (!Array.isArray(sources[source])) for (const key of keys) evidence[key] = false;
  }
  if (!coverageKeys.every(key => evidence[key])) return incomplete(['source-coverage-missing']);

  const rows = Object.fromEntries(Object.keys(coverageBySource).map(source => [source, distinctRows(sources[source], businessId)]));
  const sales = rows.sales.map(row => {
    requireValue(row.confirmedAt == null || row.status === 'confirmed', 'Venta sin confirmación del servidor.');
    cents(row.total);
    return { ...row, createdAt: requiredDate(row.confirmedAt ?? row.createdAt) };
  }).filter(row => row.createdAt <= observed);
  const payments = rows.payments.filter(row => requiredDate(row.occurredAt) <= through);
  payments.forEach(row => cents(row.amount));
  // A later receipt can establish the original of a legacy void from a closed month.
  const voids = rows.voids.filter(row => requiredDate(row.occurredAt) <= observed);
  const contracts = rows.contracts.filter(row => requiredDate(row.createdAt) <= through);
  if (contracts.some(row => row.status === 'cancelado' && (!toDateSafe(row.voidedAt) || toDateSafe(row.voidedAt) > observed))) {
    evidence.contractCancellations = false;
    return incomplete(['cancellation-date-unverified']);
  }
  const inMonth = date => date >= month.startDate && date <= through;
  const orders = contracts.filter(row => inMonth(requiredDate(row.createdAt)));
  if (orders.some(row => !contractStatuses.includes(row.status)
    || (row.status !== 'cancelado' && (!Number.isFinite(row.balance) || row.balance < 0)))) {
    evidence.createdContracts = false;
    return incomplete(['contract-status-unverified']);
  }
  const cancellations = contracts.filter(row => row.status === 'cancelado' && inMonth(requiredDate(row.voidedAt)));
  const period = { ...month, endDate: through, end: reportDay(through) };
  const scope = { businessId, branchId: 'global', period, sales: sales.filter(row => row.createdAt <= through), payments, voids };
  const model = aggregateReport({ ...scope, sales });
  const view = reportViewModel(model, contracts, { ...scope, loadedAt: +through, cashReferenceAsOf: +observed }, rows.sessions);
  if (view.historyUnresolved) {
    evidence.legacySales = false;
    return incomplete(['legacy-void-unlinked']);
  }
  const events = view.cashEvents.filter(event => event.date <= through);
  return freeze(validateMonthlySnapshotV1({ ...base, status: 'shadow', issues: [],
    ...makeBucket({ metrics: model.summary, orders, cancelled: cancellations.length, events }),
    branches: bucketsFor(model, orders, cancellations, events, 'branchId'), byDay: bucketsFor(model, orders, cancellations, events, 'day') }));
}

export async function snapshotFingerprint(snapshot) {
  validateMonthlySnapshotV1(snapshot);
  const { sourceRevision: _checkpoint, evidenceThrough: _readCutoff, ...content } = snapshot;
  return sha256(canonicalJSON(content));
}

export function combineYearSnapshotsV1(months, asOf) {
  const date = requiredDate(asOf), [year, activeMonth] = reportDay(date).split('-');
  const expected = Array.from({ length: Number(activeMonth) }, (_, i) => year + '-' + String(i + 1).padStart(2, '0'));
  requireValue(Array.isArray(months), 'Faltan los meses de la proyección anual.');
  const byKey = new Map();
  for (const month of months) {
    validateMonthlySnapshotV1(month);
    requireValue(expected.includes(month.periodKey) && !byKey.has(month.periodKey), 'Mes duplicado o fuera del alcance anual.');
    byKey.set(month.periodKey, month);
  }
  requireValue(expected.length === byKey.size, 'Falta un mes transcurrido en la proyección anual.');
  const ordered = expected.map(key => byKey.get(key)), last = ordered.at(-1);
  for (const month of ordered) requireValue(month.status !== 'incomplete' && month.businessId === last.businessId
    && (month === last || month.closed) && requiredDate(month.evidenceThrough) <= date, 'Mes incompleto o negocio incompatible en la proyección anual.');
  const byBranch = new Map();
  for (const month of ordered) for (const row of month.branches) {
    if (!byBranch.has(row.branchId)) byBranch.set(row.branchId, []);
    byBranch.get(row.branchId).push(row);
  }
  return freeze({ schemaVersion: 1, businessId: last.businessId, scope: 'global', year, status: 'shadow',
    calculatedThrough: last.calculatedThrough, closed: last.periodKey.endsWith('-12') && last.closed, products: 'unavailable',
    ...mergeBuckets(ordered),
    branches: [...byBranch].sort(([a], [b]) => compareText(a, b)).map(([branchId, rows]) => ({ branchId, ...mergeBuckets(rows) })),
    byMonth: ordered.map(month => ({ periodKey: month.periodKey, calculatedThrough: month.calculatedThrough, ...mergeBuckets([month]) })) });
}

function eventDates(source, row) {
  switch (source) {
    case 'sales': return [row.confirmedAt ?? row.createdAt];
    case 'payments': return [row.occurredAt];
    case 'pos_voids': return [row.occurredAt];
    case 'contracts': return [row.createdAt, row.voidedAt];
    case 'cash_sessions': return [row.openedAt, row.closedAt, row.expiredAt,
      row.status === 'open' ? cashExpiryWindow(row)?.expiresAt : null];
    default: throw new Error('Origen de reconstrucción mensual inválido.');
  }
}

export function planMonthRebuild({ source, before, after, legacyOriginalAt }) {
  const rows = [before, after].filter(Boolean);
  const businessId = rows[0]?.businessId;
  requireValue(validId(businessId) && rows.every(row => row.businessId === businessId), 'Reconstrucción sin negocio único verificable.');
  const relevant = rows.flatMap(row => eventDates(source, row));
  // The original month changes only if its legacy void needs the linked receipt as evidence.
  if (source === 'pos_voids' && legacyOriginalAt != null) relevant.push(legacyOriginalAt);
  const periodKeys = [...new Set(relevant.filter(value => value != null).map(value => reportDay(requiredDate(value)).slice(0, 7)))].sort();
  requireValue(periodKeys.length > 0, 'Reconstrucción sin fecha verificable.');
  return { businessId, periodKeys };
}
