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

function ContractManager({ user }) {
  const { activeBranchId, businessBranches, settings } = useTenantData();

  const {
    contracts, isLoading, isProcessing,
    createContract, updateContract, cancelContract, addPayment, markDelivered
  } = useContracts(user);

  const [searchTerm, setSearchTerm] = useState('');
  const [viewFilter, setViewFilter] = useState('activos'); // activos | deudas | historial
  const [sortBy, setSortBy] = useState('urgencia'); // urgencia | recientes

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [contractToEdit, setContractToEdit] = useState(null);
  const [contractToView, setContractToView] = useState(null);
  const [contractToCancel, setContractToCancel] = useState(null);

  const activeLocations = useMemo(() => businessBranches?.filter(b => b.status === 'activo') || [], [businessBranches]);
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
      result = result.filter(c =>
        c.contractId?.toLowerCase().includes(q) ||
        c.clientName?.toLowerCase().includes(q) ||
        c.clientPhone?.includes(q)
      );
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

  const handlePrintTicket = useCallback((contractData) => {
    const htmlContent = generateContractReceiptHTML(contractData, settings || {}, businessBranches);
    const printWindow = window.open('', '', 'width=350,height=600');
    if (printWindow) {
      printWindow.document.open(); printWindow.document.write(htmlContent); printWindow.document.close();
      printWindow.setTimeout(() => { printWindow.focus(); printWindow.print(); printWindow.setTimeout(() => printWindow.close(), 500); }, 250);
    } else toast.error("Permite las ventanas emergentes.");
  }, [settings, businessBranches]);

  const handlePrintProduction = useCallback((contractData) => {
    const htmlContent = generateContractProductionHTML(contractData, settings || {}, businessBranches);
    const printWindow = window.open('', '', 'width=800,height=900');
    if (printWindow) {
      printWindow.document.open(); printWindow.document.write(htmlContent); printWindow.document.close();
      printWindow.setTimeout(() => { printWindow.focus(); printWindow.print(); printWindow.setTimeout(() => printWindow.close(), 500); }, 350);
    } else toast.error("Permite las ventanas emergentes.");
  }, [settings, businessBranches]);

  const handlePrintTextOnly = useCallback((contractData) => {
    const htmlContent = generateContractTextOnlyHTML(contractData, settings || {}, businessBranches);
    const printWindow = window.open('', '', 'width=800,height=900');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.setTimeout(() => printWindow.close(), 500);
      }, 350);
    } else {
      toast.error("Permite las ventanas emergentes.");
    }
  }, [settings, businessBranches]);

  const handleFormSubmit = useCallback(async (contractData, _unusedImageFile, editId) => {
    const success = editId ? await updateContract(editId, contractData) : await createContract(contractData);
    if (success) { setShowCreateModal(false); setContractToEdit(null); }
  }, [createContract, updateContract]);

  const handleCancelSubmit = useCallback(async (docId, reason) => {
    const success = await cancelContract(docId, reason);
    if (success) setContractToCancel(null);
  }, [cancelContract]);

  const handleAddPayment = useCallback(async (docId, amount, method) => {
    const success = await addPayment(docId, amount, method);
    if (success) setContractToView(null); // Refresca cerrando modal
  }, [addPayment]);

  if (isLoading) {
    return (
      <div className="fade-in max-container padding-bottom-lg" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ margin: '0 auto 15px' }}></div>
          <p>Cargando agenda de pedidos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in max-container padding-bottom-lg">
      <header className="module-header">
        <h2 className="module-title">
          <span className="module-title-icon">🎂</span>
          <span className="module-title-text">Gestión de Pedidos</span>
        </h2>
        <button onClick={() => {
            if (activeBranchId === 'global' && user.role !== 'dueño') return toast.error('Selecciona una sede.');
            setContractToEdit(null); setShowCreateModal(true);
          }}
          className="btn-primary btn-add-smart"
          style={{ padding: '10px 20px', fontSize: '0.95rem' }}
        >
          ➕ Nuevo Pedido
        </button>
      </header>

      <div className="filter-bar-container" style={{ marginBottom: '20px', background: 'var(--bg-card)', padding: '15px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-container" style={{ margin: 0, flex: 2, minWidth: '250px' }}>
          <span className="search-icon">🔍</span>
          <input type="text" className="search-input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar por cliente, teléfono o ID..." style={{ fontSize: '0.95rem' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '200px' }}>
          <span style={{ fontWeight: 'bold', color: 'var(--text-muted)', fontSize: '0.85rem' }}>ORDENAR:</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border)', background: 'white', fontWeight: 'bold', flex: 1, cursor: 'pointer' }}>
            <option value="urgencia">🚨 Más Próximos a Entregar</option>
            <option value="recientes">🆕 Recién Creados</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div className="delivery-tabs" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <button className={`d-tab ${viewFilter === 'activos' ? 'active' : ''}`} onClick={() => setViewFilter('activos')} style={viewFilter === 'activos' ? {background: '#3b82f6', color: 'white'} : {}}>📦 Pedidos en Curso</button>
          <button className={`d-tab ${viewFilter === 'deudas' ? 'active' : ''}`} onClick={() => setViewFilter('deudas')} style={viewFilter === 'deudas' ? {background: '#ef4444', color: 'white'} : {}}>⚠️ Cuentas por Cobrar</button>
          <button className={`d-tab ${viewFilter === 'historial' ? 'active' : ''}`} onClick={() => setViewFilter('historial')} style={viewFilter === 'historial' ? {background: '#64748b', color: 'white'} : {}}>📜 Historial Cerrados</button>
        </div>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, background: 'var(--bg-card)', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--border)' }}>
          Mostrando {Math.min(filteredContracts.length, 100)} de {filteredContracts.length}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {filteredContracts.length === 0 ? (
          <div className="card empty-state-dashed fade-in" style={{ padding: '40px', textAlign: 'center' }}>
            <span style={{ fontSize: '3rem', opacity: 0.5, display: 'block', marginBottom: '10px' }}>📂</span>
            <h4 style={{ margin: '0 0 5px 0', color: 'var(--text-main)' }}>No hay pedidos en esta vista</h4>
          </div>
        ) : (
          filteredContracts.slice(0, 100).map(c => (
            <ContractCard key={c.id} contract={c} onView={setContractToView} branches={businessBranches} onPrint={handlePrintTicket} onPrintProduction={handlePrintProduction} onPrintTextOnly={handlePrintTextOnly} />
          ))
        )}
      </div>

      {(showCreateModal || contractToEdit) && <ContractFormModal contractToEdit={contractToEdit} activeLocations={activeLocations} onClose={() => { setShowCreateModal(false); setContractToEdit(null); }} onSubmit={handleFormSubmit} isProcessing={isProcessing} />}
      {contractToView && <ContractDetailsModal contract={contractToView} branches={businessBranches} settings={settings} onClose={() => setContractToView(null)} onAddPayment={handleAddPayment} onMarkDelivered={markDelivered} onEditRequest={(contract) => { setContractToView(null); setContractToEdit(contract); }} onCancelRequest={(contract) => { setContractToView(null); setContractToCancel(contract); }} isProcessing={isProcessing} />}
      {contractToCancel && <ContractCancelModal contract={contractToCancel} onClose={() => setContractToCancel(null)} onConfirm={handleCancelSubmit} isProcessing={isProcessing} />}
    </div>
  );
}

export default ContractManager;
