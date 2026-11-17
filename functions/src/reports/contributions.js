import { createHash } from 'node:crypto';
import { money } from '../sales/domain/saleModel.js';
import { planLegacyPayments } from '../contracts/domain/legacyPaymentPlan.js';
import { dayInLima, failReport, millis, positiveState, toCents, validScopePart, vector } from './summaryModel.js';

export const stable = value => JSON.stringify(value, (_key, part) => part && Object.getPrototypeOf(part) === Object.prototype
  ? Object.fromEntries(Object.keys(part).sort().map(name => [name, part[name]])) : part);
export const hash = value => createHash('sha256').update(stable(value)).digest('hex');
const evidence = message => failReport('report-evidence', message);

function split(method, total, fields) {
  const signed = toCents(total);
  if (method === 'efectivo') return [signed, 0];
  if (['yape', 'plin'].includes(method)) return [0, signed];
  if (method !== 'mixto') throw evidence('Método de pago sin evidencia.');
  const cash = toCents(fields?.efectivo), digital = toCents(fields?.yape ?? fields?.plin);
  if (cash < 0 || digital < 0 || cash + digital !== Math.abs(signed)) throw evidence('El pago mixto no concilia.');
  return [Math.sign(signed) * cash || 0, Math.sign(signed) * digital || 0];
}
const lineSignature = items => stable(items.map(item => [item.id, item.qty, item.price]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
const orderOf = (priority, date, id, line) =>
  priority + ':' + String(millis(date)).padStart(16, '0') + ':' + id + ':' + String(line).padStart(4, '0');

function productLines(source, id, row, date, sign, total) {
  if (!Array.isArray(row.items) || !row.items.length || row.items.length > 200) throw evidence('Artículos sin evidencia.');
  const priority = source === 'pos_voids' ? 3 : row.confirmedAt != null ? 0 : typeof row.createdAt === 'string' ? 2 : 1;
  const seen = new Set();
  let sum = 0;
  const products = row.items.map((item, i) => {
    const product = item.id ?? item.name;
    if (typeof product !== 'string' || !product || product.length > 250 || typeof item.name !== 'string' || item.name.length > 250
      || !Number.isSafeInteger(item.qty) || item.qty <= 0 || toCents(item.price) < 0
      || (source === 'pos_voids' && (!item.id || seen.has(product)))) throw evidence('Artículo financiero inválido.');
    seen.add(product);
    const key = orderOf(priority, date, id, i);
    const cents = toCents(money(item.qty * item.price));
    sum += cents;
    return { id: product, name: item.name, branchId: row.branchId, qty: sign * item.qty, cents: sign * cents || 0, first: key, last: key };
  });
  if (sum !== total) throw evidence('Los artículos no concilian con el comprobante.');
  return products;
}

export function legacyPayments(id, contract) {
  if (!Array.isArray(contract.payments) && contract.payments !== undefined) throw evidence('Pagos históricos incompletos.');
  if (contract.payments === undefined && contract.paymentsMigrated !== true
    && (contract.paidTotal > 0 || contract.total > contract.balance)) throw evidence('Pedido sin ledger verificable.');
  if ((contract.payments?.length ?? 0) > 80) throw evidence('Cobertura histórica fuera del límite por pedido.');
  return planLegacyPayments(id, contract, { timestampFromDate: date => date, digest: hash });
}

export function safeSourceScope(row) {
  if (!validScopePart(row.businessId) || ['global', 'platform-admin'].includes(row.businessId)
    || !validScopePart(row.branchId) || row.branchId === 'global' || row.isOffline || row.hasPendingWrites || row.fromCache) {
    throw evidence('Movimiento sin negocio o sede verificable.');
  }
}

export function normalizeContribution(source, id, row, through, related = {}) {
  safeSourceScope(row);
  const atoms = [];
  const add = (date, values, products = [], scope = row) => {
    if (millis(date) > through) return;
    safeSourceScope(scope);
    if (scope.businessId !== row.businessId) throw evidence('Pago fuera del negocio del pedido.');
    atoms.push({ branchId: scope.branchId, day: dayInLima(date), values: vector(values), products });
  };
  if (source === 'sales') {
    if ((row.status != null || row.confirmedAt != null) && row.status !== 'confirmed') {
      throw evidence('Venta pendiente o sin confirmación.');
    }
    const date = row.confirmedAt ?? row.createdAt;
    if (row.voided) {
      const proof = related.void;
      if (!proof || proof.businessId !== row.businessId || proof.branchId !== row.branchId || proof.saleId !== id
        || proof.authority !== 'pos-compensation' || millis(proof.occurredAt) > through || millis(proof.occurredAt) < millis(date)
        || lineSignature(proof.items) !== lineSignature(row.items)) throw evidence('Anulación histórica sin comprobante vinculado.');
      const [cash, digital] = split(row.payment, row.total, row.splitPayments);
      if (toCents(proof.amount) !== -toCents(row.total) || toCents(proof.cashAmount) !== -cash || toCents(proof.digitalAmount) !== -digital) {
        throw evidence('El comprobante histórico no concilia.');
      }
    }
    const [saleCash, saleDigital] = split(row.payment, row.total, row.splitPayments);
    add(date, { saleCash, saleDigital, tickets: 1 }, productLines(source, id, row, date, 1, toCents(row.total)));
  } else if (source === 'pos_voids') {
    const voidCash = toCents(row.cashAmount), voidDigital = toCents(row.digitalAmount);
    if (row.authority !== 'pos-compensation' || row.saleId !== id || voidCash > 0 || voidDigital > 0
      || row.amount >= 0 || voidCash + voidDigital !== toCents(row.amount)) throw evidence('Compensación POS sin evidencia.');
    const original = related.sale;
    if (original) {
      const [cash, digital] = split(original.payment, original.total, original.splitPayments);
      if (original.businessId !== row.businessId || original.branchId !== row.branchId || -cash !== voidCash || -digital !== voidDigital
        || lineSignature(row.items) !== lineSignature(original.items) || millis(original.confirmedAt ?? original.createdAt) > millis(row.occurredAt)) {
        throw evidence('La compensación no coincide con el original.');
      }
    }
    add(row.occurredAt, { voidCash, voidDigital, voids: 1 }, productLines(source, id, row, row.occurredAt, -1, -toCents(row.amount)));
  } else if (source === 'payments') {
    addPayment(row, add);
  } else if (source === 'contracts') {
    if (!positiveState.includes(row.status) || (row.status !== 'cancelado' && (!Number.isFinite(row.balance) || row.balance < 0))) {
      throw evidence('Cohorte de pedidos sin estado verificable.');
    }
    const cancelled = row.status === 'cancelado', delivered = row.status === 'entregado' || row.status === 'entregado_con_deuda';
    add(row.createdAt, { created: 1, pending: Number(!cancelled && !delivered), delivered: Number(delivered),
      createdCancelled: Number(cancelled), debt: Number(!cancelled && row.balance > 0) });
    if (cancelled) {
      if (!(row.voidedAt instanceof Date) && typeof row.voidedAt?.toDate !== 'function') throw evidence('Cancelación sin fecha de servidor.');
      add(row.voidedAt, { cancelled: 1 });
    }
    for (const payment of related.legacy ?? []) addPayment(payment, add);
  } else if (source === 'cash_sessions') {
    add(row.openedAt, { openings: 1 });
    if (row.status === 'expired_unreconciled') add(row.expiredAt, { expired: 1, review: 1 });
    else if (row.status === 'open' && row.runtime === 'spark' && [10, 14].includes(row.durationHours)) {
      add(millis(row.openedAt) + row.durationHours * 3600000, { expired: 1, review: 1 });
    } else if (['closed', 'closed_with_discrepancy'].includes(row.status)) {
      const counted = row.declaredAmount;
      const expected = row.closeEstimate?.expectedCash ?? row.expectedCash ?? row.expectedAmount;
      const difference = row.closeEstimate?.difference ?? row.difference ?? row.discrepancy;
      const known = [counted, expected, difference].every(Number.isFinite);
      const verified = known && !(row.reconciliationPending || row.requiresFinancialReview || row.closeEstimate?.authority === 'client-estimate');
      add(row.closedAt, { closings: 1, balanced: Number(verified && difference === 0), verifiedClosings: Number(verified),
        extra: Number(known && difference > 0), short: Number(known && difference < 0), review: Number(!known || difference !== 0),
        unverified: Number(!verified), confirmedExtra: verified && difference > 0 ? toCents(difference) : 0,
        confirmedShort: verified && difference < 0 ? toCents(difference) : 0 });
    }
  } else throw evidence('Tipo de fuente inválido.');
  return atoms;
}
function addPayment(row, add) {
  const kind = row.type;
  if (!row.sourceId || !['advance', 'payment', 'refund'].includes(kind) || (kind === 'refund' ? row.amount >= 0 : row.amount <= 0)) {
    throw evidence('Movimiento de pedido sin signo o identidad verificable.');
  }
  const [cash, digital] = split(row.method, row.amount, row.splitPayments);
  add(row.occurredAt, { [kind + 'Cash']: cash, [kind + 'Digital']: digital, [kind + 's']: 1 }, [], row);
}
