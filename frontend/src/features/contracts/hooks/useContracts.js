import { invalidateReportScope } from '../../reports/application/reportResource.js';
import { isBranchOperational } from '../../branches/domain/branchPolicy';
import { useCallback, useMemo, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useTenantData } from '../../branches/context/TenantContext';
import {
  subscribeActiveContracts, getContractHistoryPage, createContractDocument, updateContractDocument,
  addContractPayment, cancelContractDocument, markContractDelivered, ACTIVE_CONTRACT_LIMIT,
} from '../infrastructure/contractRepository';
import { finishContractMediaJobs, forgetPhotoOrder, rememberPhotoOrder, stageContractMediaJobs } from '../infrastructure/contractImages.js';
import { completeContractPhotos } from '../application/contractPhotoCompletion.js';
import { contractMediaId } from '../application/contractImagePolicy.js';
import { commercialContractFields, contractCommandSignature, createContractCommandRegistry, mergeContractPages } from '../application/contractCommands';
import { useSessionResources, useSessionState, useSharedSubscription } from '../../../core/session/sessionResourceHooks.js';
import { firebaseErrorMessage } from '../../../core/errors/firebaseErrors.js';

const emptyHistory = scopeKey => ({ scopeKey, contracts: [], cursor: null, hasMore: true, loading: false, started: false, loadedAt: 0, revision: 0 });

const prepareMedia = async (command, mediaScope, data, signal, orderId) => {
  if (!command.images) command.images = await stageContractMediaJobs(mediaScope, {
    files: data.newImages ?? [], removeIds: data.removeMediaIds ?? [], orderId,
  }, signal);
  signal.throwIfAborted();
  return command.images;
};

export const useContracts = (user, { historyEnabled = false } = {}) => {
  const { activeBranchId, identityKey, businessBranches } = useTenantData();
  const businessId = user?.businessId;
  const branchVerified = user?.role === 'dueño' || (user?.role === 'cajero' && activeBranchId === user.branchId
    && businessBranches?.some(branch => branch.id === user.branchId && isBranchOperational(branch)));
  const resources = useSessionResources();
  const [isProcessing, setIsProcessing] = useSessionState('contracts:busy', false);
  const processing = resources.value('contracts:mutex', () => ({ current: false }));
  const historyRequest = resources.value(`contracts:request:${activeBranchId}`, () => ({ current: null }));
  const commands = resources.value('contracts:commands', createContractCommandRegistry);
  const commandScope = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    commandScope.current = controller;
    return () => { controller.abort(); commandScope.current = null; };
  }, [identityKey, activeBranchId]);

  const watchContracts = useCallback((onData, onError) => {
    if (!branchVerified) { onData([], { fromCache: true }); return () => {}; }
    return subscribeActiveContracts(businessId, onData, error => {
      toast.error(firebaseErrorMessage(error), { id: 'agenda-err' });
      onError(error);
    }, { branchId: activeBranchId });
  }, [businessId, activeBranchId, branchVerified]);
  const { data: activeContracts, isLoading, isStale, updatedAt, error, retry } = useSharedSubscription(`contracts:active:${activeBranchId}`, watchContracts);
  const [currentHistory, setHistory, historyCell] = useSessionState(`contracts:history:${activeBranchId}`, () => emptyHistory(identityKey));
  const contracts = useMemo(() => mergeContractPages(currentHistory.contracts, activeContracts), [currentHistory.contracts, activeContracts]);

  const loadMoreHistory = useCallback(async () => {
    const history = historyCell.get();
    if (!businessId || !branchVerified || !resources.active || !history.hasMore || historyRequest.current) return;
    const request = { revision: history.revision };
    historyRequest.current = request;
    setHistory(previous => ({ ...previous, loading: true, started: true, error: null }));
    try {
      const page = await getContractHistoryPage(businessId, history.cursor, { branchId: activeBranchId });
      if (!resources.active || historyRequest.current !== request) return;
      setHistory(previous => previous.revision === request.revision ? {
        ...previous, contracts: mergeContractPages(previous.contracts, page.contracts),
        cursor: page.cursor, hasMore: page.hasMore, loading: false, loadedAt: Date.now(),
      } : previous);
    } catch (error) {
      if (!resources.active || historyRequest.current !== request) return;
      setHistory(previous => ({ ...previous, loading: false, error }));
      toast.error(firebaseErrorMessage(error));
    } finally {
      if (historyRequest.current === request) historyRequest.current = null;
    }
  }, [businessId, activeBranchId, branchVerified, resources, historyRequest, historyCell, setHistory]);

  // Paged snapshots are display data. Expire them on re-entry, never use them to authorize payments.
  useEffect(() => {
    const history = historyCell.get();
    if (!history.loading && history.loadedAt && Date.now() - history.loadedAt > 120000) {
      setHistory({ ...emptyHistory(identityKey), revision: history.revision + 1 });
    }
  }, [historyCell, identityKey, setHistory, historyEnabled]);

  useEffect(() => {
    if (historyEnabled && !currentHistory.started) void loadMoreHistory();
  }, [historyEnabled, currentHistory.started, loadMoreHistory]);

  const runCommand = useCallback(async (label, work, success) => {
    const signal = commandScope.current?.signal;
    if (!businessId || processing.current || !signal || signal.aborted) return false;
    processing.current = true;
    setIsProcessing(true);
    const toastId = toast.loading(label);
    try {
      const result = await work(signal);
      invalidateReportScope(resources, businessId, activeBranchId);
      if (signal.aborted) { toast.dismiss(toastId); return false; }
      toast.success(typeof success === 'function' ? success(result) : success, { id: toastId });
      return true;
    } catch (error) {
      if (!signal.aborted) toast.error(error.message || 'No se pudo confirmar la operación. Reintenta con los mismos datos.', { id: toastId });
      else toast.dismiss(toastId);
      return false;
    } finally {
      processing.current = false;
      if (resources.active) setIsProcessing(false);
    }
  }, [businessId, activeBranchId, resources, processing, setIsProcessing]);

  const physicalBranch = useCallback(() => {
    if (!activeBranchId || activeBranchId === 'global' || !businessBranches.some(branch => branch.id === activeBranchId && isBranchOperational(branch))) {
      toast.error('Selecciona una sede física para registrar cobros o pedidos.');
      return null;
    }
    return activeBranchId;
  }, [activeBranchId, businessBranches]);

  const createContract = useCallback(async data => {
    const branchId = physicalBranch();
    if (!branchId || !data) return false;
    const fields = commercialContractFields(data);
    const signature = contractCommandSignature({ ...fields, branchId, initialPayment: data.initialPayment });
    const command = commands.retain('create', signature);
    return runCommand('Registrando pedido...', async signal => {
      const origin = { uid: user.uid, businessId, branchId };
      // Preserve the financial command across F5. File selection may change independently.
      const order = await rememberPhotoOrder(origin, command, signal);
      const mediaScope = { ...origin, contractId: order.contractId };
      const jobs = await prepareMedia(command, mediaScope, data, signal, order.id);
      const result = await createContractDocument({ ...fields, contractId: order.contractId,
        operationId: order.operationId, branchId, referenceImages: [],
        ...(data.initialPayment ? { initialPayment: {
          amount: data.initialPayment.amount, method: data.initialPayment.method, operationId: order.initialOperationId,
        } } : {}),
      });
      // The financial command is complete even if any later upload fails.
      commands.complete('create', command);
      return completeContractPhotos({ ...result, count: jobs.length }, jobs.length, async () => {
        // Keep the ID if this view disappeared before it could acknowledge the order.
        signal.throwIfAborted();
        const completion = await finishContractMediaJobs(mediaScope, { jobs, signal });
        if (!jobs.length && !signal.aborted) await forgetPhotoOrder(order.id).catch(() => {});
        return completion;
      });
    }, result => result.photosNeedReview ? 'Pedido guardado; falta comprobar las fotos. Abre el pedido para revisarlas.'
      : result.remaining ? `Pedido guardado; ${result.remaining}/${result.count} fotos pendientes. Abre el pedido para reintentar.`
        : `Pedido ${result.contractNumber || 'registrado'} confirmado`);
  }, [physicalBranch, commands, runCommand, user.uid, businessId]);

  const updateContract = useCallback(async (contractId, data) => {
    const previous = contracts.find(contract => contract.id === contractId);
    if (!data || !previous) return false;
    const fields = commercialContractFields(data);
    const key = `update:${contractId}`;
    const retained = data.retainedImages ?? [];
    const referenceImages = retained.filter(ref => !contractMediaId(ref));
    const command = commands.retain(key, contractCommandSignature({ ...fields, retained, newImages: data.newImages, removeMediaIds: data.removeMediaIds }));
    return runCommand('Actualizando pedido...', async signal => {
      const mediaScope = { uid: user.uid, businessId, branchId: previous.branchId, contractId };
      const jobs = await prepareMedia(command, mediaScope, data, signal);
      await updateContractDocument(contractId, { ...fields, referenceImages });
      commands.complete(key, command);
      return completeContractPhotos({}, jobs.length + Number(Boolean(previous.pendingMedia)),
        () => finishContractMediaJobs(mediaScope, { jobs, pending: previous.pendingMedia, signal }));
    }, result => result.photosNeedReview ? 'Pedido actualizado; falta comprobar las fotos. Abre el pedido para revisarlas.'
      : result.remaining ? `Pedido actualizado; ${result.remaining} cambios de fotos pendientes.` : 'Pedido actualizado');
  }, [contracts, commands, runCommand, user.uid, businessId]);

  const cancelContract = useCallback(async (contractId, reason = 'Anulado por el usuario') => {
    const branchId = physicalBranch();
    if (!branchId) return false;
    const key = `cancel:${contractId}`;
    const command = commands.retain(key, JSON.stringify({ contractId, reason, branchId }));
    return runCommand('Anulando y procesando reembolsos...', async () => {
      const result = await cancelContractDocument({ contractId, reason, branchId, operationId: command.operationId });
      commands.complete(key, command);
      historyRequest.current = null;
      setHistory(previous => previous.scopeKey === identityKey ? { ...emptyHistory(identityKey), revision: previous.revision + 1 } : previous);
      return result;
    }, 'Pedido anulado y reembolsos confirmados');
  }, [physicalBranch, commands, runCommand, identityKey, historyRequest, setHistory]);

  const addPayment = useCallback(async (contractId, amount, method) => {
    const branchId = physicalBranch();
    if (!branchId) return false;
    const key = `payment:${contractId}`;
    const command = commands.retain(key, JSON.stringify({ contractId, amount, method, branchId }));
    return runCommand('Procesando abono...', async () => {
      const result = await addContractPayment({ contractId, amount, method, branchId, operationId: command.operationId });
      commands.complete(key, command);
      if (result.contractStatus === 'entregado') {
        historyRequest.current = null;
        setHistory(previous => previous.scopeKey === identityKey ? { ...emptyHistory(identityKey), revision: previous.revision + 1 } : previous);
      }
      return result;
    }, 'Abono confirmado');
  }, [physicalBranch, commands, runCommand, identityKey, historyRequest, setHistory]);

  const markDelivered = useCallback(contract => runCommand('Confirmando entrega...', async () => {
    const result = await markContractDelivered(contract.id);
    historyRequest.current = null;
    setHistory(previous => previous.scopeKey === identityKey ? { ...emptyHistory(identityKey), revision: previous.revision + 1 } : previous);
    return result;
  }, 'Entrega confirmada'), [runCommand, identityKey, historyRequest, setHistory]);

  return { contracts, activeContracts, historyContracts: currentHistory.contracts, isLoading, isProcessing,
    isHistoryLoading: currentHistory.loading, historyStarted: currentHistory.started,
    hasMoreHistory: currentHistory.hasMore, loadMoreHistory,
    isStale, updatedAt, error: error || currentHistory.error, retry: () => { retry(); if (currentHistory.error) loadMoreHistory(); }, historyUpdatedAt: currentHistory.loadedAt,
    activeLimitReached: activeContracts.length === ACTIVE_CONTRACT_LIMIT,
    createContract, updateContract, cancelContract, addPayment, markDelivered };
};
