import { checkedRead } from '../../../core/firebase/readDiagnostics.js';
import * as firestoreSDK from 'firebase/firestore';
import { planLegacyPayments } from '../../../../../functions/src/contracts/domain/legacyPaymentPlan.js';
import { toMillisSafe } from '../../../core/dates/dateValues.js';

async function webDigest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes)).map(value => value.toString(16).padStart(2, '0')).join('');
}
// The shared historical plan is synchronous. Resolve its hashes in bounded passes using Web Crypto.
export async function legacyPaymentView(id, contract, sdk = firestoreSDK) {
  const hashes = new Map();
  for (let pass = 0; pass < 3; pass++) {
    const missing = new Map();
    const plan = planLegacyPayments(id, contract, { timestampFromDate: sdk.Timestamp.fromDate,
      digest: value => { const key = JSON.stringify(value); if (!hashes.has(key)) missing.set(key, value); return hashes.get(key) ?? 'pending'; } });
    if (!missing.size) return plan;
    await Promise.all([...missing].map(async ([key, value]) => hashes.set(key, await webDigest(value))));
  }
  throw new Error('No se pudo construir la vista histórica determinista.');
}
export function createSparkLegacyPaymentReader(database, { sdk = firestoreSDK } = {}) {
  const { doc, getDocFromServer, collection, query, where, orderBy, documentId, startAfter, limit, getDocsFromServer } = sdk;
  return async (businessId, input, { maxRows = 10000, signal } = {}) => {
    const readPage = checkedRead(getDocsFromServer, 'legacy-contracts', signal);
    const readDoc = checkedRead(getDocFromServer, 'legacy-document', signal);
    let contracts = [];
    if (input.contractId) {
      const saved = await readDoc(doc(database, 'contracts', input.contractId));
      if (saved.exists()) contracts = [{ ...saved.data(), id: saved.id }];
    } else {
      let cursor;
      do {
        const page = await readPage(query(collection(database, 'contracts'), where('businessId', '==', businessId),
          orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(100)));
        contracts.push(...page.docs.map(row => ({ ...row.data(), id: row.id })));
        if (contracts.length > 500) throw new Error('La lectura histórica supera 500 contratos del negocio; requiere revisión/migración autorizada. No se emitió un reporte parcial.');
        cursor = page.size === 100 ? page.docs.at(-1) : null;
      } while (cursor);
    }
    const rows = [], branches = new Map();
    for (const contract of contracts) {
      signal?.throwIfAborted();
      if (contract.businessId !== businessId) throw new Error('Contrato fuera de tu negocio.');
      if (contract.payments === undefined) {
        if (contract.paymentsMigrated !== true && (contract.paidTotal > 0 || contract.total > contract.balance)) throw new Error('Contrato histórico con cobros sin libro verificable; requiere revisión antes de emitir el reporte.');
        continue;
      }
      const legacy = await legacyPaymentView(contract.id, contract, sdk);
      for (const payment of legacy) {
        // Never infer a cash session or a branch from a client timestamp.
        if (!payment.branchId || payment.branchId === 'global') throw new Error('Pago histórico sin sede verificable: requiere revisión.');
        if (input.branchId !== 'global' && input.branchId && payment.branchId !== input.branchId) continue;
        if (input.sessionId && payment.sessionId !== input.sessionId) continue;
        const time = toMillisSafe(payment.occurredAt);
        if (input.startDate && time < +new Date(input.startDate) || input.endDate && time > +new Date(input.endDate)) continue;
        if (!branches.has(payment.branchId)) {
          const branch = await readDoc(doc(database, 'branches', payment.branchId));
          if (!branch.exists() || branch.data().businessId !== businessId) throw new Error('Pago histórico sin sede del negocio verificable; requiere revisión.');
          branches.set(payment.branchId, true);
        }
        rows.push(payment);
        if (rows.length > maxRows) throw new Error('Demasiados pagos históricos; selecciona un período menor.');
      }
    }
    return rows;
  };
}
