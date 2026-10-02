import { Timestamp } from 'firebase-admin/firestore';
import { actorFor, authorizeBranch } from '../core/authorization.js';
import { documentId, SaleError, money } from '../sales/domain/saleModel.js';
import { COMMERCIAL_FIELDS, commercialFields, contractAmount, paymentMethod, operationId,
  financialProjection, assertPaymentWithinBalance } from './domain/contractModel.js';
import { digest, ensureLegacyPaymentsMigrated, remainingIncomePayments } from './legacyLedger.js';

function payload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SaleError('invalid-contract', 'Payload de pedido inválido.');
  return value;
}
function response(contractId, contract, status = 'APPLIED', extra = {}) {
  return { status, contractId, contractNumber: contract.contractNumber ?? contract.contractId ?? contractId,
    paidTotal: contract.paidTotal ?? 0, balance: contract.balance, contractStatus: contract.status, ...extra };
}
function storageFields(commercial) {
  return { ...commercial, deliveryDate: commercial.deliveryDate ? Timestamp.fromDate(new Date(commercial.deliveryDate)) : null };
}
function activeContract(contract) {
  if (contract.status === 'cancelado') throw new SaleError('cancelled-contract', 'El pedido está cancelado.');
}
async function readContract(transaction, database, actor, contractId) {
  const reference = database.doc(`contracts/${documentId(contractId)}`);
  const snapshot = await transaction.get(reference);
  const contract = snapshot.data();
  if (!contract) throw new SaleError('contract-not-found', 'Pedido inexistente.');
  if (contract.businessId !== actor.businessId) throw new SaleError('permission-denied', 'Pedido fuera de tu negocio.');
  return { reference, contract };
}
async function openCashSession(transaction, database, actor, branchId) {
  const snapshot = await transaction.get(database.collection('cash_sessions').where('businessId', '==', actor.businessId)
    .where('branchId', '==', branchId).where('userId', '==', actor.uid).where('status', '==', 'open').limit(2));
  if (snapshot.size !== 1) throw new SaleError('cash-session-required', 'Se requiere una única caja abierta del usuario en esta sede.');
  return snapshot.docs[0].id;
}
function paymentRequestHash(action, actor, input) {
  return digest([action, actor.businessId, actor.uid, input.contractId, input.operationId, input.branchId, input.amount, input.method]);
}
function verifyPaymentRetry(existing, hash, actor) {
  if (existing.businessId !== actor.businessId || existing.userId !== actor.uid || existing.requestHash !== hash) {
    throw new SaleError('payment-conflict', 'El ID de operación ya fue usado con otro movimiento financiero.');
  }
}
function newPayment(actor, contractId, contract, input, type, sessionId, timestamp, requestHash) {
  return { businessId: actor.businessId, branchId: input.branchId, sessionId, userId: actor.uid,
    cashierName: actor.name, sourceType: 'contract', sourceId: contractId,
    contractNumber: contract.contractNumber ?? contract.contractId ?? contractId, clientName: contract.clientName ?? '',
    type, method: input.method, amount: input.amount, occurredAt: timestamp, createdAt: timestamp,
    operationId: input.operationId, requestHash };
}
function orderNumber(contractId, timestamp) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: '2-digit', month: '2-digit', day: '2-digit' }).formatToParts(timestamp.toDate());
  const part = type => parts.find(value => value.type === type)?.value;
  return `PED-${part('year')}${part('month')}${part('day')}-${contractId.slice(0, 8).toUpperCase()}`;
}

export function createContractHandlers(database, { now = Date.now } = {}) {
  const createContract = request => database.runTransaction(async transaction => {
    const actor = await actorFor(transaction, database, request.auth?.uid);
    const raw = payload(request.data);
    const contractId = operationId(raw.contractId);
    const createOperationId = operationId(raw.operationId);
    const branchId = documentId(raw.branchId);
    await authorizeBranch(transaction, database, actor, branchId);
    if (raw.payments !== undefined) throw new SaleError('invalid-contract', 'Envía initialPayment, no un array de pagos.');
    const commercial = commercialFields(raw, { businessId: actor.businessId, contractId });
    const initial = raw.initialPayment == null ? null : {
      operationId: operationId(payload(raw.initialPayment).operationId), amount: contractAmount(raw.initialPayment.amount, { positive: true }),
      method: paymentMethod(raw.initialPayment.method), branchId, contractId };
    if (initial) assertPaymentWithinBalance(initial.amount, commercial.total);
    const hash = digest(['create', actor.businessId, actor.uid, createOperationId, contractId, branchId, commercial, initial]);
    const reference = database.doc(`contracts/${contractId}`);
    const existing = (await transaction.get(reference)).data();
    if (existing) {
      if (existing.businessId !== actor.businessId || existing.createdBy !== actor.uid || existing.createRequestHash !== hash) {
        throw new SaleError('payment-conflict', 'El ID del pedido ya fue utilizado con datos diferentes.');
      }
      return response(contractId, existing, 'ALREADY_APPLIED');
    }
    const paymentReference = initial ? database.doc(`payments/${initial.operationId}`) : null;
    if (paymentReference && (await transaction.get(paymentReference)).exists) {
      throw new SaleError('payment-conflict', 'El ID del adelanto ya fue utilizado.');
    }
    const sessionId = initial?.method === 'efectivo' ? await openCashSession(transaction, database, actor, branchId) : null;
    const timestamp = Timestamp.fromMillis(now());
    const contractNumber = orderNumber(contractId, timestamp);
    const projection = financialProjection(commercial.total, initial ? [{ amount: initial.amount, type: 'advance' }] : []);
    const contract = { ...storageFields(commercial), referenceImages: commercial.referenceImages ?? [],
      businessId: actor.businessId, branchId, contractNumber, contractId: contractNumber, ...projection,
      createdBy: actor.uid, creatorName: actor.name, startDate: timestamp, createdAt: timestamp, updatedAt: timestamp,
      paymentsMigrated: true, paymentsMigratedAt: timestamp, createOperationId, createRequestHash: hash };
    transaction.create(reference, contract);
    if (initial) transaction.create(paymentReference, newPayment(actor, contractId, contract, initial, 'advance', sessionId, timestamp,
      paymentRequestHash('advance', actor, initial)));
    return response(contractId, contract, 'APPLIED', initial ? { paymentId: initial.operationId } : {});
  });

  const updateContract = request => database.runTransaction(async transaction => {
    const actor = await actorFor(transaction, database, request.auth?.uid);
    const input = payload(request.data);
    const changes = payload(input.changes);
    if (Object.keys(changes).some(key => !COMMERCIAL_FIELDS.includes(key))) {
      throw new SaleError('protected-contract-field', 'La edición sólo permite datos comerciales.');
    }
    const { reference, contract } = await readContract(transaction, database, actor, input.contractId);
    activeContract(contract);
    const merged = { ...contract, ...changes };
    // Existing legacy images remain readable until migration; only submitted metadata is validated/written.
    if (!Object.hasOwn(changes, 'referenceImages')) delete merged.referenceImages;
    const commercial = commercialFields(merged, { businessId: actor.businessId, contractId: reference.id });
    const ledger = await ensureLegacyPaymentsMigrated(transaction, database, reference, contract, { now });
    const projection = financialProjection(commercial.total, ledger.payments, contract.status);
    assertPaymentWithinBalance(projection.paidTotal, commercial.total);
    ledger.write();
    const update = { ...storageFields(commercial), ...projection, ...ledger.migration, updatedAt: Timestamp.fromMillis(now()) };
    transaction.update(reference, update);
    return response(reference.id, { ...contract, ...update });
  });

  const addContractPayment = request => database.runTransaction(async transaction => {
    const actor = await actorFor(transaction, database, request.auth?.uid);
    const raw = payload(request.data);
    const input = { contractId: documentId(raw.contractId), operationId: operationId(raw.operationId),
      branchId: documentId(raw.branchId), amount: contractAmount(raw.amount, { positive: true }), method: paymentMethod(raw.method) };
    await authorizeBranch(transaction, database, actor, input.branchId);
    const { reference, contract } = await readContract(transaction, database, actor, input.contractId);
    const paymentReference = database.doc(`payments/${input.operationId}`);
    const previous = (await transaction.get(paymentReference)).data();
    const hash = paymentRequestHash('payment', actor, input);
    if (previous) {
      verifyPaymentRetry(previous, hash, actor);
      return response(reference.id, contract, 'ALREADY_APPLIED', { paymentId: input.operationId });
    }
    activeContract(contract);
    const ledger = await ensureLegacyPaymentsMigrated(transaction, database, reference, contract, { now });
    const current = financialProjection(contract.total, ledger.payments, contract.status);
    assertPaymentWithinBalance(input.amount, current.balance);
    const sessionId = input.method === 'efectivo' ? await openCashSession(transaction, database, actor, input.branchId) : null;
    const timestamp = Timestamp.fromMillis(now());
    const payment = newPayment(actor, reference.id, contract, input, 'payment', sessionId, timestamp, hash);
    const projection = financialProjection(contract.total, [...ledger.payments, payment], contract.status);
    ledger.write(); transaction.create(paymentReference, payment);
    transaction.update(reference, { ...projection, ...ledger.migration, updatedAt: timestamp });
    return response(reference.id, { ...contract, ...projection }, 'APPLIED', { paymentId: input.operationId });
  });

  const cancelContract = request => database.runTransaction(async transaction => {
    const actor = await actorFor(transaction, database, request.auth?.uid);
    const raw = payload(request.data);
    if (Object.keys(raw).some(key => !['contractId', 'operationId', 'reason', 'branchId'].includes(key))) {
      throw new SaleError('invalid-contract', 'La cancelación no acepta pagos ni metadata financiera.');
    }
    const input = { contractId: documentId(raw.contractId), operationId: operationId(raw.operationId), branchId: documentId(raw.branchId) };
    if (typeof raw.reason !== 'string' || !raw.reason.trim() || raw.reason.length > 1000) throw new SaleError('invalid-contract', 'Motivo de cancelación inválido.');
    const reason = raw.reason.trim();
    await authorizeBranch(transaction, database, actor, input.branchId);
    const { reference, contract } = await readContract(transaction, database, actor, input.contractId);
    const hash = digest(['cancel', actor.businessId, actor.uid, reference.id, input.operationId, input.branchId, reason]);
    if (contract.status === 'cancelado') {
      if (contract.cancelOperationId === input.operationId && contract.cancelRequestHash !== hash) {
        throw new SaleError('payment-conflict', 'El ID de cancelación ya se usó con datos diferentes.');
      }
      return response(reference.id, contract, 'ALREADY_APPLIED');
    }
    const ledger = await ensureLegacyPaymentsMigrated(transaction, database, reference, contract, { now });
    const outstanding = remainingIncomePayments(ledger.payments);
    const sessionId = outstanding.some(payment => payment.method === 'efectivo')
      ? await openCashSession(transaction, database, actor, input.branchId) : null;
    const timestamp = Timestamp.fromMillis(now());
    const refunds = outstanding.map(payment => {
      const id = `refund_${digest([actor.businessId, reference.id, input.operationId, payment.id])}`;
      return { ...newPayment(actor, reference.id, contract, { ...input, method: payment.method, amount: -money(payment.remaining) },
        'refund', payment.method === 'efectivo' ? sessionId : null, timestamp, hash), id, reversesPaymentId: payment.id, reason };
    });
    if (refunds.length) {
      const occupied = await transaction.getAll(...refunds.map(refund => database.doc(`payments/${refund.id}`)));
      if (occupied.some(doc => doc.exists)) throw new SaleError('payment-conflict', 'ID de reembolso ocupado; requiere revisión.');
    }
    const projection = financialProjection(contract.total, [...ledger.payments, ...refunds], 'cancelado');
    ledger.write();
    for (const { id, ...refund } of refunds) transaction.create(database.doc(`payments/${id}`), refund);
    const update = { ...projection, ...ledger.migration, cancelOperationId: input.operationId, cancelRequestHash: hash,
      voidedAt: timestamp, voidedBy: actor.uid, voidedByName: actor.name, voidReason: reason, updatedAt: timestamp };
    transaction.update(reference, update);
    transaction.create(database.doc(`alerts/VOIDED_CONTRACT_${reference.id}`), {
      businessId: actor.businessId, branchId: input.branchId, type: 'VOIDED_CONTRACT', sourceId: reference.id,
      title: 'Pedido anulado', message: `${contract.contractNumber ?? contract.contractId}: ${reason}`,
      userId: actor.uid, userName: actor.name, createdAt: timestamp, date: timestamp, read: false,
    });
    return response(reference.id, { ...contract, ...update }, 'APPLIED', { refundIds: refunds.map(refund => refund.id) });
  });

  const markContractDelivered = request => database.runTransaction(async transaction => {
    const actor = await actorFor(transaction, database, request.auth?.uid);
    const input = payload(request.data);
    if (Object.keys(input).some(key => key !== 'contractId')) throw new SaleError('protected-contract-field', 'El servidor determina el estado de entrega.');
    const { reference, contract } = await readContract(transaction, database, actor, input.contractId);
    activeContract(contract);
    const ledger = await ensureLegacyPaymentsMigrated(transaction, database, reference, contract, { now });
    const projection = financialProjection(contract.total, ledger.payments, 'entregado');
    const repeated = contract.status === projection.status && contract.deliveredAt != null;
    ledger.write();
    transaction.update(reference, { ...projection, ...ledger.migration,
      ...(repeated ? {} : { deliveredAt: Timestamp.fromMillis(now()), deliveredBy: actor.uid }), updatedAt: Timestamp.fromMillis(now()) });
    return response(reference.id, { ...contract, ...projection }, repeated ? 'ALREADY_APPLIED' : 'APPLIED');
  });
  return { createContract, updateContract, addContractPayment, cancelContract, markContractDelivered };
}
