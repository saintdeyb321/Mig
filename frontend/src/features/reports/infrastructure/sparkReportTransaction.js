import { blank, vector, plus, maxSummaryBytes } from '../../../../../functions/src/reports/summaryModel.js';
import { reportDay } from '../domain/reportPeriod.js';

export const sparkReportCollections = { days: 'spark_report_days_v1', months: 'spark_report_months_v1' };
const origins = new Set(['sales', 'pos_voids', 'contracts', 'cash_sessions']);
const cents = value => Math.round((value ?? 0) * 100);
const timestamp = (value, now) => value?.toDate?.() ?? (typeof value === 'number' || typeof value === 'string' ? new Date(value) : now);
const state = contract => ({ created: 1,
  pending: Number(!['cancelado', 'entregado', 'entregado_con_deuda'].includes(contract.status)),
  delivered: Number(['entregado', 'entregado_con_deuda'].includes(contract.status)),
  createdCancelled: Number(contract.status === 'cancelado'), debt: Number(contract.status !== 'cancelado' && contract.balance > 0) });

export function reportContribution(collection, before, after, now) {
  const today = reportDay(now), captured = before?.reporting?.version === 1;
  let day = today, first = blank(), second = blank();
  if (collection === 'sales') {
    const cash = after.payment === 'efectivo' ? cents(after.total) : after.payment === 'mixto' ? cents(after.splitPayments.efectivo) : 0;
    first = vector({ saleCash: cash, saleDigital: cents(after.total) - cash, tickets: 1 });
  } else if (collection === 'pos_voids') {
    first = vector({ voidCash: cents(after.cashAmount), voidDigital: cents(after.digitalAmount), voids: 1 });
  } else if (collection === 'contracts') {
    day = reportDay(timestamp(after.createdAt, now));
    first = plus(vector(state(after)), captured ? vector(state(before)) : blank(), -1);
    const cash = cents(after.paidByMethod.efectivo) - cents(before?.paidByMethod?.efectivo);
    const digital = cents(after.paidByMethod.yape) + cents(after.paidByMethod.plin)
      - cents(before?.paidByMethod?.yape) - cents(before?.paidByMethod?.plin);
    if (!before) second = vector({ advanceCash: cash, advanceDigital: digital, advances: Number(cash + digital > 0) });
    else if (after.status === 'cancelado' && before.status !== 'cancelado') {
      second = vector({ refundCash: cash, refundDigital: digital, cancelled: 1,
        refunds: Object.values(before.paidByMethod).filter(value => value > 0).length });
    } else second = vector({ paymentCash: cash, paymentDigital: digital, payments: Number(cash + digital > 0) });
  } else {
    day = reportDay(timestamp(after.openedAt, now));
    first = vector({ openings: Number(!captured) });
    if (after.status === 'expired_unreconciled') {
      second = vector({ expired: 1, review: 1 });
    } else if (after.status !== 'open') {
      const difference = after.closeEstimate?.difference;
      second = vector({ closings: 1, extra: Number(difference > 0), short: Number(difference < 0),
        review: Number(!Number.isFinite(difference) || difference !== 0), unverified: 1 });
    }
  }
  const eventDay = collection === 'cash_sessions' && after.status === 'expired_unreconciled'
    ? reportDay(timestamp(after.expiredAt, now)) : today;
  if (day === eventDay) { first = plus(first, second); second = blank(); }
  return { version: 1, revision: (before?.reporting?.revision ?? 0) + 1,
    rows: [{ day, values: first }, { day: eventDay, values: second }] };
}

// Buffer the existing writes so all aggregate reads still precede the first write.
// Firebase can retry this entire function; no projection is applied outside its commit.
export function runSparkReportTransaction(database, sdk, work) {
  return sdk.runTransaction(database, async transaction => {
    const reads = new Map(), writes = [];
    const get = async ref => {
      if (!reads.has(ref.path)) reads.set(ref.path, await transaction.get(ref));
      return reads.get(ref.path);
    };
    const tx = { get, set: (ref, data, options) => writes.push({ kind: 'set', ref, data, options }),
      update: (ref, data) => writes.push({ kind: 'update', ref, data }), delete: ref => writes.push({ kind: 'delete', ref }) };
    const result = await work(tx), now = new Date();
    const changes = [];
    for (const write of writes) {
      const [collection, id, nested] = write.ref.path.split('/');
      if (!origins.has(collection) || nested || write.kind === 'delete') continue;
      const before = reads.get(write.ref.path)?.data(), after = write.kind === 'update' ? { ...before, ...write.data } : write.data;
      // Media-only changes do not alter a report's accounting state.
      if (collection === 'contracts' && write.kind === 'update' && !Object.hasOwn(write.data, 'updatedAt')) continue;
      const branch = (await get(sdk.doc(database, 'branches', after.branchId))).data();
      if (branch?.reportProtocol !== 1) continue;
      const reporting = reportContribution(collection, before, after, now);
      write.data = { ...write.data, reporting: { version: reporting.version, revision: reporting.revision,
        rows: reporting.rows.map(({ day }) => ({ day })) } };
      changes.push({ collection, id, after, reporting });
    }
    if (changes.length > 2 || (changes.length === 2 && changes.some(change => change.collection !== 'cash_sessions'))) {
      throw new Error('El protocolo de informes admite una operación financiera o un reemplazo atómico de caja.');
    }
    const buckets = new Map();
    for (const change of changes) for (const row of change.reporting.rows) {
      for (const [collection, period] of [[sparkReportCollections.days, row.day], [sparkReportCollections.months, row.day.slice(0, 7)]]) {
        const id = `${change.after.businessId}:${change.after.branchId}:${period}`, key = `${collection}/${id}`;
        if (!buckets.has(key)) {
          const ref = sdk.doc(database, collection, id), saved = (await get(ref)).data();
          buckets.set(key, { ref, body: saved ? { ...saved, rows: { ...saved.rows }, products: { ...saved.products }, sources: [] }
            : { version: 1, businessId: change.after.businessId, branchId: change.after.branchId, period, rows: {}, products: {}, sources: [] } });
        }
        const body = buckets.get(key).body;
        body.rows[row.day] = plus(body.rows[row.day] ?? blank(), row.values);
        const source = { collection: change.collection, id: change.id, revision: change.reporting.revision };
        if (!body.sources.some(item => item.collection === source.collection && item.id === source.id)) body.sources.push(source);
      }
    }
    for (const { collection, after, reporting } of changes) if (['sales', 'pos_voids'].includes(collection)) {
      const sign = collection === 'sales' ? 1 : -1, day = reporting.rows[0].day;
      for (const { body } of buckets.values()) if (body.branchId === after.branchId && body.period === day.slice(0, 7)) {
        for (const item of after.items) {
          const old = body.products[item.id] ?? [item.name, 0, 0];
          body.products[item.id] = [old[0], old[1] + sign * item.qty, old[2] + sign * cents(item.price) * item.qty];
        }
      }
    }
    for (const { body } of buckets.values()) {
      if (new TextEncoder().encode(JSON.stringify(body)).length > maxSummaryBytes) {
        throw Object.assign(new Error('El agregado excede el tamaño seguro. No se confirmó ni modificó la operación.'), { code: 'report-capacity' });
      }
      body.updatedAt = sdk.serverTimestamp();
    }
    for (const write of writes) {
      if (write.kind === 'delete') transaction.delete(write.ref);
      else if (write.kind === 'update') transaction.update(write.ref, write.data);
      else if (write.options) transaction.set(write.ref, write.data, write.options);
      else transaction.set(write.ref, write.data);
    }
    for (const { ref, body } of buckets.values()) transaction.set(ref, body);
    return result;
  });
}
