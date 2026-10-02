import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useTenantData } from '../../branches/context/TenantContext';
import {
  subscribeActiveContracts, getContractHistoryPage, createContractDocument, updateContractDocument,
  addContractPayment, cancelContractDocument, markContractDelivered, ACTIVE_CONTRACT_LIMIT,
} from '../infrastructure/contractRepository';
import { prepareContractImages } from '../infrastructure/contractImages';
import { commercialContractFields, contractCommandSignature, createContractCommandRegistry, mergeContractPages } from '../application/contractCommands';
import { useScopedSubscription } from '../../../shared/hooks/useScopedSubscription';

const emptyHistory = scopeKey => ({ scopeKey, contracts: [], cursor: null, hasMore: true, loading: false, started: false });

export const useContracts = (user, { historyEnabled = false } = {}) => {
  const { activeBranchId, identityKey } = useTenantData();
  const businessId = user?.businessId;
  const [isProcessing, setIsProcessing] = useState(false);
  const processing = useRef(false);
  const historyRequest = useRef(null);
  const commands = useMemo(() => createContractCommandRegistry(), [identityKey]);
  const scope = useMemo(() => ({ active: true }), [identityKey]);
  useEffect(() => {
    scope.active = true;
    return () => { scope.active = false; };
  }, [scope]);

  const watchContracts = useCallback((onData, onError) => subscribeActiveContracts(businessId, onData, error => {
    toast.error('Error al cargar los pedidos activos.', { id: 'agenda-err' });
    onError(error);
  }), [businessId]);
  const { data: activeContracts, isLoading } = useScopedSubscription(businessId ? identityKey : null, watchContracts);
  const [history, setHistory] = useState(() => emptyHistory(identityKey));
  if (history.scopeKey !== identityKey) setHistory(emptyHistory(identityKey));
  const currentHistory = history.scopeKey === identityKey ? history : emptyHistory(identityKey);

  const loadMoreHistory = useCallback(async () => {
    if (!businessId || !scope.active || !currentHistory.hasMore || historyRequest.current === identityKey) return;
    historyRequest.current = identityKey;
    setHistory(previous => previous.scopeKey === identityKey ? { ...previous, loading: true, started: true } : previous);
    try {
      const page = await getContractHistoryPage(businessId, currentHistory.cursor);
      if (!scope.active) return;
      setHistory(previous => previous.scopeKey === identityKey ? {
        ...previous, contracts: mergeContractPages(previous.contracts, page.contracts),
        cursor: page.cursor, hasMore: page.hasMore, loading: false,
      } : previous);
    } catch (error) {
      if (!scope.active) return;
      setHistory(previous => previous.scopeKey === identityKey ? { ...previous, loading: false } : previous);
      toast.error(error.message || 'Error al cargar el historial. Puedes reintentar.');
    } finally {
      if (historyRequest.current === identityKey) historyRequest.current = null;
    }
  }, [businessId, scope, identityKey, currentHistory.hasMore, currentHistory.cursor]);

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
      if (!scope.active) { toast.dismiss(toastId); return false; }
      toast.success(typeof success === 'function' ? success(result) : success, { id: toastId });
      return true;
    } catch (error) {
      if (scope.active) toast.error(error.message || 'No se pudo confirmar la operación. Reintenta con los mismos datos.', { id: toastId });
      else toast.dismiss(toastId);
      return false;
    } finally {
      processing.current = false;
      if (scope.active) setIsProcessing(false);
    }
  }, [businessId, scope]);

  const physicalBranch = useCallback(() => {
    if (!activeBranchId || activeBranchId === 'global') {
      toast.error('Selecciona una sede física para registrar cobros o pedidos.');
      return null;
    }
    return activeBranchId;
  }, [activeBranchId]);

  const imagesForCommand = useCallback(async (command, contractId, data) => {
    if (!command.images) command.images = await prepareContractImages({
      businessId, contractId, newImages: data.newImages ?? [], retainedImages: data.retainedImages ?? [],
    });
    if (!scope.active) throw new Error('La sesión cambió durante la operación.');
    return command.images;
  }, [businessId, scope]);

  const createContract = useCallback(async data => {
    const branchId = physicalBranch();
    if (!branchId || !data) return false;
    const fields = commercialContractFields(data);
    const signature = contractCommandSignature({ ...fields, branchId, initialPayment: data.initialPayment,
      retainedImages: data.retainedImages, newImages: data.newImages });
    const command = commands.retain('create', signature);
    return runCommand('Registrando pedido...', async () => {
      const referenceImages = await imagesForCommand(command, command.contractId, data);
      const result = await createContractDocument({ ...fields, contractId: command.contractId,
        operationId: command.operationId, branchId, referenceImages,
        ...(data.initialPayment ? { initialPayment: {
          amount: data.initialPayment.amount, method: data.initialPayment.method, operationId: command.initialOperationId,
        } } : {}),
      });
      commands.complete('create', command);
      return result;
    }, result => `Pedido ${result.contractNumber || 'registrado'} confirmado`);
  }, [physicalBranch, commands, runCommand, imagesForCommand]);

  const updateContract = useCallback(async (contractId, data) => {
    if (!data) return false;
    const fields = commercialContractFields(data);
    const key = `update:${contractId}`;
    const command = commands.retain(key, contractCommandSignature({ ...fields, retainedImages: data.retainedImages, newImages: data.newImages }));
    return runCommand('Actualizando pedido...', async () => {
      const referenceImages = await imagesForCommand(command, contractId, data);
      const result = await updateContractDocument(contractId, { ...fields, referenceImages });
      commands.complete(key, command);
      return result;
    }, 'Pedido actualizado');
  }, [commands, runCommand, imagesForCommand]);

  const cancelContract = useCallback(async (contractId, reason = 'Anulado por el usuario') => {
    const branchId = physicalBranch();
    if (!branchId) return false;
    const key = `cancel:${contractId}`;
    const command = commands.retain(key, JSON.stringify({ contractId, reason, branchId }));
    return runCommand('Anulando y procesando reembolsos...', async () => {
      const result = await cancelContractDocument({ contractId, reason, branchId, operationId: command.operationId });
      commands.complete(key, command);
      setHistory(previous => previous.scopeKey === identityKey ? emptyHistory(identityKey) : previous);
      return result;
    }, 'Pedido anulado y reembolsos confirmados');
  }, [physicalBranch, commands, runCommand, identityKey]);

  const addPayment = useCallback(async (contractId, amount, method) => {
    const branchId = physicalBranch();
    if (!branchId) return false;
    const key = `payment:${contractId}`;
    const command = commands.retain(key, JSON.stringify({ contractId, amount, method, branchId }));
    return runCommand('Procesando abono...', async () => {
      const result = await addContractPayment({ contractId, amount, method, branchId, operationId: command.operationId });
      commands.complete(key, command);
      return result;
    }, 'Abono confirmado');
  }, [physicalBranch, commands, runCommand]);

  const markDelivered = useCallback(contract => runCommand('Confirmando entrega...', async () => {
    const result = await markContractDelivered(contract.id);
    setHistory(previous => previous.scopeKey === identityKey ? emptyHistory(identityKey) : previous);
    return result;
  }, 'Entrega confirmada'), [runCommand, identityKey]);

  const contracts = useMemo(() => mergeContractPages(currentHistory.contracts, activeContracts), [currentHistory.contracts, activeContracts]);
  return { contracts, activeContracts, historyContracts: currentHistory.contracts, isLoading, isProcessing,
    isHistoryLoading: currentHistory.loading, historyStarted: currentHistory.started,
    hasMoreHistory: currentHistory.hasMore, loadMoreHistory,
    activeLimitReached: activeContracts.length === ACTIVE_CONTRACT_LIMIT,
    createContract, updateContract, cancelContract, addPayment, markDelivered };
};
