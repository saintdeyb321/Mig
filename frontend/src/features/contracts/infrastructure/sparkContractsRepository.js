import { isBranchOperational } from '../../branches/domain/branchPolicy.js';
import { writeOperationNotice } from '../../notifications/infrastructure/sparkOperationNotice.js';
import * as firestoreSDK from 'firebase/firestore';
import { commercialFields, contractAmount, paymentMethod, operationId, financialProjection } from '../../../../../functions/src/contracts/domain/contractModel.js';
import { money } from '../../sales/domain/saleModel.js';
import { cashLockId } from '../../cash-register/infrastructure/sparkCashRepository.js';

const emptyMethods = () => ({ efectivo: 0, yape: 0, plin: 0 });
const projection = (total, byMethod, status) => financialProjection(total,
  Object.values(byMethod).filter(value => value > 0).map(amount => ({ type: 'payment', amount })), status);
const fail = message => { throw new Error(message); };
const signature = async command => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(command)))))
  .map(value => value.toString(16).padStart(2, '0')).join('');

export function createSparkContractsRepository(database, { currentUser, sdk = firestoreSDK } = {}) {
  const { doc, runTransaction, serverTimestamp, Timestamp, getDocFromServer } = sdk;
  const who = () => currentUser()?.uid || fail('Inicia sesión.');
  async function actor(tx, branchId, { cashRequired = true } = {}) {
    const uid = who(), profile = (await tx.get(doc(database, 'users', uid))).data();
    if (!profile || !['dueño', 'cajero'].includes(profile.role)) fail('Perfil operativo requerido.');
    const branch = (await tx.get(doc(database, 'branches', branchId))).data();
    if (!isBranchOperational(branch) || branch.businessId !== profile.businessId) fail('Sede inactiva o no verificada.');
    const lock = cashRequired ? (await tx.get(doc(database, 'active_cash_sessions', await cashLockId(profile.businessId, branchId)))).data() : null;
    if (cashRequired && (!lock || lock.userId !== uid || lock.runtime !== 'spark')) fail('Abre tu caja Spark en la sede antes de registrar cobros/devoluciones.');
    return { businessId: profile.businessId, branchId, userId: uid, sessionId: lock?.sessionId ?? null,
      cashierName: `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() };
  }
  const result = (id, d) => ({ contractId: id, contractNumber: d.contractNumber, paidTotal: d.paidTotal, balance: d.balance, contractStatus: d.status });
  async function confirmed(id, uid) {
    const saved = await getDocFromServer(doc(database, 'contracts', id));
    if (who() !== uid) fail('La sesión cambió.');
    return result(id, saved.data());
  }
  const commercial = (input, businessId, id) => {
    const fields = commercialFields(input, { businessId, contractId: id, allowLegacyImages: true });
    const images = input.referenceImages ?? [];
    if (!Array.isArray(images) || images.length > 20 || images.some(image => typeof image !== 'string'
      || !image.startsWith(`local-image:${businessId}:${id}:`) || image.length > 350)) fail('Solo referencias locales acotadas; las referencias históricas se conservan en modo lectura.');
    return { ...fields, deliveryDate: fields.deliveryDate ? Timestamp.fromDate(new Date(fields.deliveryDate)) : null, referenceImages: images };
  };
  const payment = (context, id, contract, op, amount, method, type) => ({ ...context, sourceType: 'contract', sourceId: id,
    contractNumber: contract.contractNumber, clientName: contract.clientName, operationId: op,
    amount, method, type, runtime: 'spark', occurredAt: serverTimestamp(), createdAt: serverTimestamp() });
  async function change(id, work) {
    const uid = who();
    await runTransaction(database, async tx => {
      const ref = doc(database, 'contracts', id), saved = await tx.get(ref), contract = saved.data();
      if (!contract || contract.sparkContractVersion !== 1) fail('Contrato histórico: lectura disponible; escrituras y migración financiera pendientes de revisión.');
      if (who() !== uid) fail('La sesión cambió.');
      await work(tx, ref, contract);
    });
    return confirmed(id, uid);
  }
  return {
    async create(input) {
      const id = operationId(input.contractId), op = operationId(input.operationId), uid = who();
      const hash = await signature(input);
      await runTransaction(database, async tx => {
        const ref = doc(database, 'contracts', id), previous = await tx.get(ref);
        if (previous.exists()) {
          if (previous.data().createRequestHash !== hash || previous.data().createdBy !== uid) fail('ID de contrato utilizado con otros datos.');
          return;
        }
        const operationRef = doc(database, 'spark_contract_operations', op);
        if ((await tx.get(operationRef)).exists()) fail('El ID de creación ya pertenece a otro contrato.');
        const context = await actor(tx, input.branchId, { cashRequired: !!input.initialPayment }), fields = commercial(input, context.businessId, id);
        const initial = input.initialPayment;
        const amount = initial ? contractAmount(initial.amount, { positive: true }) : 0;
        const byMethod = emptyMethods();
        if (initial) byMethod[paymentMethod(initial.method)] = amount;
        if (amount > fields.total) fail('El anticipo supera el total.');
        const payId = initial ? operationId(initial.operationId) : null;
        if (payId && (await tx.get(doc(database, 'payments', payId))).exists()) fail('ID de anticipo ocupado.');
        const contract = { ...fields, businessId: context.businessId, branchId: input.branchId,
          contractNumber: `PED-${id.slice(0, 8).toUpperCase()}`, contractId: `PED-${id.slice(0, 8).toUpperCase()}`,
          ...projection(fields.total, byMethod), paidByMethod: byMethod, ledgerVersion: initial ? 1 : 0,
          lastPaymentId: payId, sparkContractVersion: 1, createdBy: uid, creatorName: context.cashierName,
          startDate: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          paymentsMigrated: true, createOperationId: op, createRequestHash: hash };
        if (who() !== uid) fail('La sesión cambió.');
        tx.set(ref, contract);
        tx.set(operationRef, { businessId: context.businessId, branchId: context.branchId, userId: uid, contractId: id, requestHash: hash, createdAt: serverTimestamp() });
        if (initial) { tx.set(doc(database, 'payments', payId), payment(context, id, contract, payId, amount, initial.method, 'advance'));
          writeOperationNotice(tx, database, sdk, 'payment', payId, context); }
      });
      return confirmed(id, uid);
    },
    update: (id, changes) => change(id, async (tx, ref, contract) => {
      await actor(tx, contract.branchId, { cashRequired: false });
      if (contract.status === 'cancelado') fail('El pedido está cancelado.');
      const fields = commercial({ ...contract, ...changes }, contract.businessId, id);
      if (fields.total < contract.paidTotal) fail('El nuevo total no puede ser menor al importe ya abonado.');
      tx.update(ref, { ...fields, ...projection(fields.total, contract.paidByMethod, contract.status), updatedAt: serverTimestamp() });
    }),
    addPayment: input => change(input.contractId, async (tx, ref, contract) => {
      const op = operationId(input.operationId), amount = contractAmount(input.amount, { positive: true }), method = paymentMethod(input.method);
      const payRef = doc(database, 'payments', op), previous = await tx.get(payRef);
      if (previous.exists()) {
        const p = previous.data();
        if (p.sourceId !== ref.id || p.userId !== who() || p.amount !== amount || p.method !== method || p.branchId !== input.branchId) fail('ID de pago utilizado con otros datos.');
        return;
      }
      if (input.branchId !== contract.branchId) fail('Los movimientos Spark requieren la sede de origen del contrato.');
      const context = await actor(tx, input.branchId);
      if (contract.status === 'cancelado' || amount > contract.balance) fail('Pago superior al saldo o pedido cancelado.');
      const byMethod = { ...contract.paidByMethod, [method]: money(contract.paidByMethod[method] + amount) };
      tx.set(payRef, payment(context, ref.id, contract, op, amount, method, 'payment'));
      writeOperationNotice(tx, database, sdk, 'payment', op, context);
      tx.update(ref, { ...projection(contract.total, byMethod, contract.status), paidByMethod: byMethod,
        ledgerVersion: contract.ledgerVersion + 1, lastPaymentId: op, updatedAt: serverTimestamp() });
    }),
    cancel: input => change(input.contractId, async (tx, ref, contract) => {
      const op = operationId(input.operationId), reason = String(input.reason ?? '').trim();
      if (!reason || reason.length > 1000) fail('Indica un motivo de hasta 1000 caracteres.');
      if (contract.status === 'cancelado') {
        if (contract.cancelOperationId !== op || contract.voidReason !== reason || contract.voidedBy !== who()) fail('El pedido ya tiene otra cancelación.');
        return;
      }
      if (input.branchId !== contract.branchId) fail('Cancela desde la sede de origen del contrato.');
      const methods = Object.entries(contract.paidByMethod).filter(([, amount]) => amount > 0);
      const context = await actor(tx, input.branchId, { cashRequired: methods.length > 0 });
      const refs = methods.map(([method]) => doc(database, 'payments', `${op}_${method}`));
      if ((await Promise.all(refs.map(r => tx.get(r)))).some(row => row.exists())) fail('ID de devolución ocupado.');
      methods.forEach(([method, amount], index) => { tx.set(refs[index], {
        ...payment(context, ref.id, contract, op, -amount, method, 'refund'), reason, reversalScope: 'contract-method-balance' }); writeOperationNotice(tx, database, sdk, 'payment', refs[index].id, context); });
      tx.update(ref, { ...projection(contract.total, emptyMethods(), 'cancelado'), paidByMethod: emptyMethods(),
        ledgerVersion: contract.ledgerVersion + 1, cancelOperationId: op, voidReason: reason,
        voidedBy: who(), voidedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }),
    deliver: id => change(id, async (tx, ref, contract) => {
      if (contract.status === 'cancelado') fail('El pedido está cancelado.');
      if (contract.deliveredAt) return;
      await actor(tx, contract.branchId, { cashRequired: false });
      tx.update(ref, { ...projection(contract.total, contract.paidByMethod, 'entregado'),
        deliveredAt: serverTimestamp(), deliveredBy: who(), updatedAt: serverTimestamp() });
    }),
  };
}
