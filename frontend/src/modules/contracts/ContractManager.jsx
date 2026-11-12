import { useCashRegister } from '../../features/cash-register/hooks/useCashRegister';
import { CashRegisterModals } from '../CashRegisterModals';
import CashRecoveryStatus from '../CashRecoveryStatus.jsx';
import { CashStatus } from '../pos/TicketParts';
import FirestoreQueryError from '../../components/FirestoreQueryError';
import { isBranchOperational } from '../../features/branches/domain/branchPolicy';
import { CakeSlice, History, Package, Plus, WalletCards } from 'lucide-react';
import { Alert, Button, PageHeader, Select, SearchField, EmptyState } from "../../shared/ui";
// src/modules/contracts/ContractManager.jsx
import React, { useState, useMemo, useCallback } from 'react';
import { useContracts } from '../../features/contracts/hooks/useContracts';
import { useTenantData } from '../../features/branches/context/TenantContext';
import toast from 'react-hot-toast';
import { toMillisSafe } from '../../core/dates/dateValues';
import ContractCard from './components/ContractCard';
import ContractDetailsModal from './components/ContractDetailsModal';
import ContractFormModal from './components/ContractFormModal';
import ContractCancelModal from './components/ContractCancelModal';
import ContractPickupPanel from './components/ContractPickupPanel.jsx';
import { generateContractReceiptHTML } from '../../utils/contractReceiptTemplate';
import { generateContractProductionHTML, generateContractTextOnlyHTML } from '../../utils/contractProductionTemplate';
import { withResolvedContractImages } from '../../features/contracts/infrastructure/contractImages';
import { getPaymentsByContract } from '../../features/payments/infrastructure/paymentRepository';
import { useSessionState, useSessionScroll } from '../../core/session/sessionResourceHooks.js';
import { usePrintJobs } from '../../shared/printing/usePrintJobs';
function ContractManager({
  user
}) {
  const runPrint = usePrintJobs();
  const {
    activeBranchId,
    businessBranches,
    settings
  } = useTenantData();
  const cash = useCashRegister(user, activeBranchId);
  const cashScope = JSON.stringify([user.uid, user.businessId, activeBranchId]);
  const [cashModal, setCashModal] = useState(null);
  const [previousCashScope, setPreviousCashScope] = useState(cashScope);
  if (previousCashScope !== cashScope) {
    setPreviousCashScope(cashScope);
    setCashModal(null);
  }
  const physicalCashBranch = activeBranchId && activeBranchId !== 'global' && businessBranches?.some(branch => branch.id === activeBranchId && isBranchOperational(branch));
  const canManageCash = physicalCashBranch && (user.role === 'dueño' || user.role === 'cajero' && user.branchId === activeBranchId);
  const canCollect = cash.currentSession?.serverConfirmed === true && !cash.currentSession.needsForceClose && !cash.isExpired && !cash.readError;
  const [viewFilter, setViewFilter] = useSessionState(`contracts:filter:${activeBranchId}`, 'activos');
  const {
    contracts,
    isLoading,
    isProcessing, isStale, updatedAt, historyUpdatedAt, error, retry,
    createContract,
    updateContract,
    cancelContract,
    addPayment,
    markDelivered,
    isHistoryLoading,
    historyStarted,
    hasMoreHistory,
    loadMoreHistory,
    activeLimitReached
  } = useContracts(user, {
    historyEnabled: viewFilter === 'historial'
  });
  const [searchTerm, setSearchTerm] = useSessionState(`contracts:search:${activeBranchId}`, '');
  const [sortBy, setSortBy] = useSessionState(`contracts:sort:${activeBranchId}`, 'urgencia'); // urgencia | recientes

  useSessionScroll(`contracts:${activeBranchId}`, !isLoading);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [contractToEdit, setContractToEdit] = useState(null);
  const [contractToView, setContractToView] = useState(null);
  const [contractToCancel, setContractToCancel] = useState(null);
  const activeLocations = useMemo(() => businessBranches?.filter(isBranchOperational) || [], [businessBranches]);
  const filteredContracts = useMemo(() => {
    let result = [...contracts];

    // 1. FILTRO VISUAL (El corazón de la memoria)
    if (viewFilter === 'activos') {
      // Si está entregado_con_deuda, se Queda en pantalla molestando a la cajera hasta que paguen.
      result = result.filter(c => c.status !== 'cancelado' && c.status !== 'entregado');
    } else if (viewFilter === 'deudas') {
      result = result.filter(c => c.balance > 0 && c.status !== 'cancelado');
    } else if (viewFilter === 'historial') {
      result = result.filter(c => c.status === 'cancelado' || c.status === 'entregado');
    }

    // 2. BÚSQUEDA TEXTUAL
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(c => c.contractId?.toLowerCase().includes(q) || c.clientName?.toLowerCase().includes(q) || c.clientPhone?.includes(q));
    }

    // 3. ORDENAMIENTO DE AGENDA
    if (sortBy === 'urgencia') {
      result.sort((a, b) => {
        if (!a.deliveryDate) return 1;
        if (!b.deliveryDate) return -1;
        const dateA = toMillisSafe(a.deliveryDate);
        const dateB = toMillisSafe(b.deliveryDate);
        return dateA - dateB; // Más próximo arriba
      });
    } else {
      result.sort((a, b) => {
        const dateA = toMillisSafe(a.createdAt);
        const dateB = toMillisSafe(b.createdAt);
        return dateB - dateA;
      });
    }
    return result;
  }, [contracts, searchTerm, viewFilter, sortBy]);
  const printContract = useCallback(async (contractData, template, compact = false) => {
    try {
      await runPrint(async job => {
        const ledger = await getPaymentsByContract(user.businessId, contractData.id, user.role === 'cajero' ? user.branchId : 'global');
        const payments = contractData.paymentsMigrated || ledger.length > 0 ? ledger : contractData.payments || [];
        await withResolvedContractImages({
          ...contractData,
          payments
        }, async resolved => {
          const html = template(resolved, settings || {}, businessBranches);
          await job.print(html);
        });
      }, {
        popup: true,
        compact
      });
    } catch (error) {
      if (error.name !== 'AbortError') toast.error(error.message || 'No se pudo preparar la impresión.');
    }
  }, [settings, businessBranches, user.businessId, user.role, user.branchId, runPrint]);
  const handlePrintTicket = useCallback(contract => printContract(contract, generateContractReceiptHTML, true), [printContract]);
  const handlePrintProduction = useCallback(contract => printContract(contract, generateContractProductionHTML), [printContract]);
  const handlePrintTextOnly = useCallback(contract => printContract(contract, generateContractTextOnlyHTML), [printContract]);
  const handleFormSubmit = useCallback(async (contractData, _unusedImageFile, editId) => {
    if (!editId && contractData.initialPayment?.amount > 0 && !canCollect) { toast.error('Abre una caja vigente en esta sede antes de registrar el anticipo. El formulario se conserva.'); return; }
    const success = editId ? await updateContract(editId, contractData) : await createContract(contractData);
    if (success) {
      setShowCreateModal(false);
      setContractToEdit(null);
    }
  }, [createContract, updateContract, canCollect]);
  const handleCancelSubmit = useCallback(async (docId, reason) => {
    const paid = contracts.find(contract => contract.id === docId)?.paidTotal ?? 0;
    if (paid > 0 && !canCollect) { toast.error('Abre una caja vigente antes de devolver dinero.'); return false; }
    const success = await cancelContract(docId, reason);
    if (success) setContractToCancel(null);
  }, [cancelContract, contracts, canCollect]);
  const handleAddPayment = useCallback(async (docId, amount, method) => {
    if (!canCollect) { toast.error('Abre una caja vigente en esta sede antes de cobrar.'); return false; }
    const success = await addPayment(docId, amount, method);
    if (success) setContractToView(null); // Refresca cerrando modal
    return success;
  }, [addPayment, canCollect]);
  const dismissCashModal = () => setCashModal(request => request === cashModal ? null : request);
  const showCashOpening = () => setCashModal({ mode: 'open' });
  const showCashClosing = () => setCashModal({ mode: 'close', sessionId: cash.currentSession.id });
  const cashModals = <CashRegisterModals {...cash}
    key={cashModal?.mode === 'open' ? `${cashScope}:open` : `${cashScope}:${cash.currentSession?.id ?? 'closed'}`}
    showOpenModal={cashModal?.mode === 'open'} setShowOpenModal={dismissCashModal}
    showCloseModal={cashModal?.mode === 'close' && !cash.isExpired && cashModal.sessionId === cash.currentSession?.id} setShowCloseModal={dismissCashModal}
  />;
  if (isLoading) {
    return <><div className="workspace-page max-w-7xl animate-enter motion-reduce:animate-none flex justify-center items-center min-h-64">
        <div className="text-center text-muted">
          <div className="size-8 animate-spin rounded-full border-3 border-line border-t-primary motion-reduce:animate-none m-[0_auto_15px]"></div>
          <p>Cargando agenda de pedidos...</p>
        </div>
      </div>{cashModals}</>;
  }
  return <><div className="workspace-page max-w-7xl animate-enter motion-reduce:animate-none">
      <PageHeader title="Gestión de pedidos" icon={CakeSlice} eyebrow="Agenda de producción" description="Cada pedido, desde el primer anticipo hasta la entrega." className="to-primary-soft/60" actions={<>
        {canManageCash && <CashStatus readOnly={false} session={cash.currentSession} isExpired={cash.isExpired} expiresAt={cash.expiresAt} remainingMinutes={cash.remainingMinutes} />}
        {canManageCash && !cash.currentSession && !cash.readError && <Button variant="secondary" disabled={cash.isLoadingSession} onClick={showCashOpening}>{cash.expiryState?.finalized ? 'Abrir caja nueva' : 'Abrir caja'}</Button>}
        {canManageCash && !cash.isExpired && cash.currentSession && (!cash.currentSession.needsForceClose || cash.currentSession.canForceClose) && <Button variant="secondary" onClick={showCashClosing}>Cerrar caja</Button>}
        <Button onClick={() => {
        if (!activeBranchId || activeBranchId === 'global') return toast.error('Selecciona una sede física.');
        setContractToEdit(null);
        setShowCreateModal(true);
      }} className="shrink-0 py-2.5 px-5 text-base" type="button" variant="primary">
          <Plus aria-hidden="true" />Nuevo Pedido
        </Button></>} />

      {canManageCash && <CashRecoveryStatus session={cash.currentSession} isExpired={cash.isExpired} expiresAt={cash.expiresAt}
        recoverySession={cash.recoverySession} expiryState={cash.expiryState} online={navigator.onLine} onFinalize={cash.finalizeTurn} onCheck={cash.checkSession} />}
      {cash.currentSession?.needsForceClose && !cash.isExpired && canManageCash && <Alert variant="warning" title="Turno anterior pendiente">{cash.currentSession.canForceClose ? 'Puedes revisar y cerrar el turno desde esta sede.' : 'Solicita al dueño el cierre del turno anterior antes de cobrar.'}</Alert>}
      <FirestoreQueryError error={cash.readError} area="cash-open" user={user} onRetry={cash.checkSession} />
      <p role="status" className="text-sm text-muted">{isStale ? 'Agenda en caché, pendiente de servidor.' : `Agenda recibida: ${new Date(updatedAt).toLocaleTimeString('es-PE')}.`}{historyUpdatedAt > 0 && ` Historial leído: ${new Date(historyUpdatedAt).toLocaleTimeString('es-PE')}.`}</p>
      <FirestoreQueryError error={error} area="contracts-active" user={user} onRetry={retry} />
      {canManageCash && user.role === 'cajero' && <ContractPickupPanel user={user} branchId={activeBranchId} branches={businessBranches} />}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/15 bg-linear-to-r from-panel to-primary-soft/45 p-3.5 shadow-card">
        <SearchField type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar por cliente, teléfono o ID..." />
        <label className="flex min-w-0 flex-1 basis-full items-center gap-2.5 sm:basis-64">
          <span className="text-sm font-semibold text-muted">Ordenar</span>
          <Select value={sortBy} onChange={e => setSortBy(e.target.value)} className="flex-1 cursor-pointer font-semibold">
            <option value="urgencia">Más próximos a entregar</option>
            <option value="recientes">Recién creados</option>
          </Select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="segmented-control w-full border-primary/15 bg-primary-soft/30 sm:w-auto" role="group" aria-label="Estado de los pedidos">
          <Button size="sm" className="flex-1 sm:flex-none" aria-pressed={viewFilter === 'activos'} onClick={() => setViewFilter('activos')} type="button" variant={viewFilter === 'activos' ? 'primary' : 'ghost'}><Package aria-hidden="true" />Pedidos en Curso</Button>
          <Button size="sm" className="flex-1 sm:flex-none" aria-pressed={viewFilter === 'deudas'} onClick={() => setViewFilter('deudas')} type="button" variant={viewFilter === 'deudas' ? 'primary' : 'ghost'}><WalletCards aria-hidden="true" />Cuentas por Cobrar</Button>
          <Button size="sm" className="flex-1 sm:flex-none" aria-pressed={viewFilter === 'historial'} onClick={() => setViewFilter('historial')} type="button" variant={viewFilter === 'historial' ? 'primary' : 'ghost'}><History aria-hidden="true" />Historial Cerrados</Button>
        </div>
        <span className="rounded-full border border-stellar/15 bg-stellar-soft/65 px-3 py-1.5 text-xs font-semibold text-stellar">
          Mostrando {filteredContracts.length} pedidos cargados
        </span>
      </div>

      <div className="grid gap-4">
        {filteredContracts.length === 0 && error ? null : filteredContracts.length === 0 ? <EmptyState title={<>No hay pedidos en esta vista</>} /> : filteredContracts.map(c => <ContractCard key={c.id} contract={c} onView={setContractToView} branches={businessBranches} onPrint={handlePrintTicket} onPrintProduction={handlePrintProduction} onPrintTextOnly={handlePrintTextOnly} />)}
      </div>

      {viewFilter === 'historial' && <div className="text-center mt-5">
          <p className="text-muted text-sm">La búsqueda incluye las páginas cargadas del historial.</p>
          {(hasMoreHistory || isHistoryLoading) && <Button type="button" disabled={isHistoryLoading} onClick={loadMoreHistory} variant="primary">
            {isHistoryLoading ? 'Cargando historial...' : historyStarted ? 'Cargar más' : 'Cargar historial'}
          </Button>}
        </div>}
      {viewFilter !== 'historial' && activeLimitReached && <p className="text-muted">
        La agenda muestra los 100 pedidos activos con entrega más próxima. La búsqueda se aplica a esos pedidos.
      </p>}

      {(showCreateModal || contractToEdit) && <ContractFormModal contractToEdit={contractToEdit} activeLocations={activeLocations} onClose={() => {
      setShowCreateModal(false);
      setContractToEdit(null);
    }} onSubmit={handleFormSubmit} isProcessing={isProcessing} cashAction={!canCollect && <Alert variant="warning" title="Los cobros requieren caja vigente">
        Puedes guardar el pedido sin anticipo.
        {canManageCash && !cash.isExpired && !cash.readError && (!cash.currentSession || !cash.currentSession.needsForceClose || cash.currentSession.canForceClose) && <Button type="button" size="sm" variant="secondary" className="mt-2" disabled={cash.isLoadingSession}
          onClick={cash.currentSession ? showCashClosing : showCashOpening}>{cash.currentSession ? 'Cerrar turno anterior' : 'Abrir caja'}</Button>}
      </Alert>} />}
      {contractToView && <ContractDetailsModal user={user} contract={contracts.find(c => c.id === contractToView.id) || contractToView} branches={businessBranches} settings={settings} onClose={() => setContractToView(null)} onAddPayment={handleAddPayment} onMarkDelivered={markDelivered} onEditRequest={contract => {
      setContractToView(null);
      setContractToEdit(contract);
    }} onCancelRequest={contract => {
      setContractToView(null);
      setContractToCancel(contract);
    }} isProcessing={isProcessing} />}
      {contractToCancel && <ContractCancelModal contract={contractToCancel} onClose={() => setContractToCancel(null)} onConfirm={handleCancelSubmit} isProcessing={isProcessing} />}
    </div>{cashModals}</>;
}
export default ContractManager;
