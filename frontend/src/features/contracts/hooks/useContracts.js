import { isBranchOperational } from '../../branches/domain/branchPolicy';
import { useCallback, useMemo, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useTenantData } from '../../branches/context/TenantContext';
import {
  subscribeActiveContracts, getContractHistoryPage, createContractDocument, updateContractDocument,
  addContractPayment, cancelContractDocument, markContractDelivered, ACTIVE_CONTRACT_LIMIT,
} from '../infrastructure/contractRepository';
import { prepareContractImages, cleanupContractImagePaths, cleanupRetiredContractImages, retryContractImageCleanup } from '../infrastructure/contractImages';
import { runtimeCapabilities } from '../../../config/runtimeCapabilities.js';
import { commercialContractFields, contractCommandSignature, createContractCommandRegistry, mergeContractPages } from '../application/contractCommands';
import { useSessionResources, useSessionState, useSharedSubscription } from '../../../core/session/sessionResourceHooks.js';
import { firebaseErrorMessage } from '../../../core/errors/firebaseErrors.js';

const emptyHistory = scopeKey => ({ scopeKey, contracts: [], cursor: null, hasMore: true, loading: false, started: false, loadedAt: 0, revision: 0 });

export const useContracts = (user, { historyEnabled = false } = {}) => {
  const { activeBranchId, identityKey, businessBranches } = useTenantData();
  const businessId = user?.businessId;
  const resources = useSessionResources();
  const [isProcessing, setIsProcessing] = useSessionState('contracts:busy', false);
  const processing = resources.value('contracts:mutex', () => ({ current: false }));
  const historyRequest = resources.value(`contracts:request:${activeBranchId}`, () => ({ current: null }));
  const commands = resources.value('contracts:commands', createContractCommandRegistry);
  const scope = useMemo(() => ({ active: true, identityKey }), [identityKey]);
  useEffect(() => {
    if (!businessId || !runtimeCapabilities.cloudStorage) return;
    const retry = () => { void retryContractImageCleanup(businessId).catch(() => console.warn('Cleanup de imágenes pendiente.')); };
    retry(); window.addEventListener('online', retry);
    const timer = setInterval(retry, 60000);
    return () => { clearInterval(timer); window.removeEventListener('online', retry); };
  }, [businessId, identityKey]);
  useEffect(() => {
    scope.active = true;
    return () => { scope.active = false; };
  }, [scope]);

  const watchContracts = useCallback((onData, onError) => subscribeActiveContracts(businessId, onData, error => {
    toast.error(firebaseErrorMessage(error), { id: 'agenda-err' });
    onError(error);
  }, { branchId: activeBranchId }), [businessId, activeBranchId]);
  const { data: activeContracts, isLoading, isStale, updatedAt, error, retry } = useSharedSubscription(`contracts:active:${activeBranchId}`, watchContracts);
  const [currentHistory, setHistory, historyCell] = useSessionState(`contracts:history:${activeBranchId}`, () => emptyHistory(identityKey));
  const contracts = useMemo(() => mergeContractPages(currentHistory.contracts, activeContracts), [currentHistory.contracts, activeContracts]);

  const loadMoreHistory = useCallback(async () => {
    const history = historyCell.get();
    if (!businessId || !resources.active || !history.hasMore || historyRequest.current) return;
    const request = { revision: history.revision };
    historyRequest.current = request;
    setHistory(previous => ({ ...previous, loading: true, started: true }));
    try {
      const page = await getContractHistoryPage(businessId, history.cursor, { branchId: activeBranchId });
      if (!resources.active || historyRequest.current !== request) return;
      setHistory(previous => previous.revision === request.revision ? {
        ...previous, contracts: mergeContractPages(previous.contracts, page.contracts),
        cursor: page.cursor, hasMore: page.hasMore, loading: false, loadedAt: Date.now(),
      } : previous);
    } catch (error) {
      if (!resources.active || historyRequest.current !== request) return;
      setHistory(previous => ({ ...previous, loading: false }));
      toast.error(firebaseErrorMessage(error));
    } finally {
      if (historyRequest.current === request) historyRequest.current = null;
    }
  }, [businessId, activeBranchId, resources, historyRequest, historyCell, setHistory]);

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
    if (!businessId || processing.current || !scope.active) return false;
    processing.current = true;
    setIsProcessing(true);
    const toastId = toast.loading(label);
    try {
      const result = await work();
      resources.invalidate('report:');
      resources.clearValue('report:cache');
      if (!scope.active) { toast.dismiss(toastId); return false; }
      toast.success(typeof success === 'function' ? success(result) : success, { id: toastId });
      return true;
    } catch (error) {
      if (scope.active) toast.error(error.message || 'No se pudo confirmar la operación. Reintenta con los mismos datos.', { id: toastId });
      else toast.dismiss(toastId);
      return false;
    } finally {
      processing.current = false;
      if (resources.active) setIsProcessing(false);
    }
  }, [businessId, scope, resources, processing, setIsProcessing]);

  const physicalBranch = useCallback(() => {
    if (!activeBranchId || activeBranchId === 'global' || !businessBranches.some(branch => branch.id === activeBranchId && isBranchOperational(branch))) {
      toast.error('Selecciona una sede física para registrar cobros o pedidos.');
      return null;
    }
    return activeBranchId;
  }, [activeBranchId, businessBranches]);

  const discardUploads = useCallback(async (command, contractId, error) => {
    if (['unavailable', 'internal', 'deadline-exceeded', 'unknown', 'cancelled', 'network-request-failed'].includes(error.code)) return;
    await cleanupContractImagePaths(businessId, contractId, command.uploadedPaths ?? []).catch(() => console.warn('Cleanup pendiente.'));
    command.images = null; command.uploadedPaths = [];
  }, [businessId]);
  const imagesForCommand = useCallback(async (command, contractId, data) => {
    command.uploadedPaths ??= [];
    try {
      if (!command.images) command.images = await prepareContractImages({
        businessId, contractId, newImages: data.newImages ?? [], retainedImages: data.retainedImages ?? [], uploadedPaths: command.uploadedPaths,
      });
    } catch (error) { await discardUploads(command, contractId, error); throw error; }
    if (!scope.active) throw new Error('La sesión cambió durante la operación.');
    return command.images;
  }, [businessId, scope, discardUploads]);

  const createContract = useCallback(async data => {
    const branchId = physicalBranch();
    if (!branchId || !data) return false;
    const fields = commercialContractFields(data);
    const signature = contractCommandSignature({ ...fields, branchId, initialPayment: data.initialPayment,
      retainedImages: data.retainedImages, newImages: data.newImages });
    const command = commands.retain('create', signature);
    return runCommand('Registrando pedido...', async () => {
      const referenceImages = await imagesForCommand(command, command.contractId, data);
      let result;
      try { result = await createContractDocument({ ...fields, contractId: command.contractId,
        operationId: command.operationId, branchId, referenceImages,
        ...(data.initialPayment ? { initialPayment: {
          amount: data.initialPayment.amount, method: data.initialPayment.method, operationId: command.initialOperationId,
        } } : {}),
      }); } catch (error) { await discardUploads(command, command.contractId, error); throw error; }
      commands.complete('create', command);
      return result;
    }, result => `Pedido ${result.contractNumber || 'registrado'} confirmado`);
  }, [physicalBranch, commands, runCommand, imagesForCommand, discardUploads]);

  const updateContract = useCallback(async (contractId, data) => {
    if (!data) return false;
    const fields = commercialContractFields(data);
    const key = `update:${contractId}`;
    const command = commands.retain(key, contractCommandSignature({ ...fields, retainedImages: data.retainedImages, newImages: data.newImages }));
    return runCommand('Actualizando pedido...', async () => {
      const referenceImages = await imagesForCommand(command, contractId, data);
      let result;
      try { result = await updateContractDocument(contractId, { ...fields, referenceImages }); }
      catch (error) { await discardUploads(command, contractId, error); throw error; }
      const previousImages = contracts.find(contract => contract.id === contractId)?.referenceImages ?? [];
      await cleanupRetiredContractImages(businessId, contractId, previousImages, referenceImages)
        .catch(() => console.warn('Pedido confirmado; limpieza de imágenes pendiente.'));
      commands.complete(key, command);
      return result;
    }, 'Pedido actualizado');
  }, [commands, runCommand, imagesForCommand, discardUploads, contracts, businessId]);

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
    isStale, updatedAt, error, retry, historyUpdatedAt: currentHistory.loadedAt,
    activeLimitReached: activeContracts.length === ACTIVE_CONTRACT_LIMIT,
    createContract, updateContract, cancelContract, addPayment, markDelivered };
};
