import FirestoreQueryError from '../../components/FirestoreQueryError';
import { isBranchOperational } from '../../features/branches/domain/branchPolicy';
import { CakeSlice } from 'lucide-react';
import { Button, PageHeader, Select, cn, SearchField, EmptyState } from "../../shared/ui";
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
    const success = editId ? await updateContract(editId, contractData) : await createContract(contractData);
    if (success) {
      setShowCreateModal(false);
      setContractToEdit(null);
    }
  }, [createContract, updateContract]);
  const handleCancelSubmit = useCallback(async (docId, reason) => {
    const success = await cancelContract(docId, reason);
    if (success) setContractToCancel(null);
  }, [cancelContract]);
  const handleAddPayment = useCallback(async (docId, amount, method) => {
    const success = await addPayment(docId, amount, method);
    if (success) setContractToView(null); // Refresca cerrando modal
    return success;
  }, [addPayment]);
  if (isLoading) {
    return <div className="animate-enter motion-reduce:animate-none mx-auto w-full min-w-0 max-w-7xl space-y-5 pb-6 flex justify-center items-center min-h-64">
        <div className="text-center text-muted">
          <div className="size-8 animate-spin rounded-full border-3 border-line border-t-primary motion-reduce:animate-none m-[0_auto_15px]"></div>
          <p>Cargando agenda de pedidos...</p>
        </div>
      </div>;
  }
  return <div className="animate-enter motion-reduce:animate-none mx-auto w-full min-w-0 max-w-7xl space-y-5 pb-6">
      <PageHeader title="Gestión de pedidos" icon={CakeSlice} eyebrow="Agenda de producción" description="Cada pedido, desde el primer anticipo hasta la entrega." actions={<><Button onClick={() => {
        if (!activeBranchId || activeBranchId === 'global') return toast.error('Selecciona una sede física.');
        setContractToEdit(null);
        setShowCreateModal(true);
      }} className="shrink-0 py-2.5 px-5 text-base" type="button" variant="primary">
          ➕ Nuevo Pedido
        </Button></>} />

      <p role="status" className="text-sm text-muted">{isStale ? 'Agenda en caché, pendiente de servidor.' : `Agenda recibida: ${new Date(updatedAt).toLocaleTimeString('es-PE')}.`}{historyUpdatedAt > 0 && ` Historial leído: ${new Date(historyUpdatedAt).toLocaleTimeString('es-PE')}.`}</p>
      <FirestoreQueryError error={error} area="contracts-active" user={user} onRetry={retry} />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel p-4 shadow-card">
        <SearchField type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar por cliente, teléfono o ID..." />
        <div className="flex min-w-0 flex-1 basis-full items-center gap-2.5 sm:basis-64">
          <span className="font-bold text-muted text-sm">ORDENAR:</span>
          <Select value={sortBy} onChange={e => setSortBy(e.target.value)} className="py-2.5 px-4 rounded-xl border border-line bg-panel font-bold min-w-0 flex-1 cursor-pointer">
            <option value="urgencia">🚨 Más Próximos a Entregar</option>
            <option value="recientes">🆕 Recién Creados</option>
          </Select>
        </div>
      </div>

      <div className="flex justify-between items-center mb-5 flex-wrap gap-2.5">
        <div className="flex w-full flex-wrap gap-1 rounded-xl p-1 sm:w-auto bg-subtle border border-line">
          <Button className={cn(`flex-1 text-xs sm:flex-none sm:text-sm ${viewFilter === 'activos' ? "bg-primary-soft text-primary" : ''} `, viewFilter === 'activos' ? "bg-primary text-panel" : "")} onClick={() => setViewFilter('activos')} type="button" variant="secondary">📦 Pedidos en Curso</Button>
          <Button className={cn(`flex-1 text-xs sm:flex-none sm:text-sm ${viewFilter === 'deudas' ? "bg-primary-soft text-primary" : ''} `, viewFilter === 'deudas' ? "bg-danger text-panel" : "")} onClick={() => setViewFilter('deudas')} type="button" variant="secondary">⚠️ Cuentas por Cobrar</Button>
          <Button className={cn(`flex-1 text-xs sm:flex-none sm:text-sm ${viewFilter === 'historial' ? "bg-primary-soft text-primary" : ''} `, viewFilter === 'historial' ? "bg-muted text-panel" : "")} onClick={() => setViewFilter('historial')} type="button" variant="secondary">📜 Historial Cerrados</Button>
        </div>
        <span className="text-sm text-muted font-semibold bg-panel py-1.5 px-3 rounded-2xl border border-line">
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
    }} onSubmit={handleFormSubmit} isProcessing={isProcessing} />}
      {contractToView && <ContractDetailsModal user={user} contract={contracts.find(c => c.id === contractToView.id) || contractToView} branches={businessBranches} settings={settings} onClose={() => setContractToView(null)} onAddPayment={handleAddPayment} onMarkDelivered={markDelivered} onEditRequest={contract => {
      setContractToView(null);
      setContractToEdit(contract);
    }} onCancelRequest={contract => {
      setContractToView(null);
      setContractToCancel(contract);
    }} isProcessing={isProcessing} />}
      {contractToCancel && <ContractCancelModal contract={contractToCancel} onClose={() => setContractToCancel(null)} onConfirm={handleCancelSubmit} isProcessing={isProcessing} />}
    </div>;
}
export default ContractManager;
