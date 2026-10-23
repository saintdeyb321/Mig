// src/modules/SuperAdmin.jsx
import React, { useState, memo } from 'react';
import { useSuperAdmin } from '../hooks/useSuperAdmin'; 
// 🚀 NUEVO: Importamos el hook para exportar la BD de los clientes
import { useAdminBackup } from '../hooks/useAdminBackup';

const formatDate = (timestamp) => {
  if (!timestamp) return 'Sin fecha';
  const d = timestamp.toDate();
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
};

const ClientCard = memo(({ 
  license, 
  isProcessing, 
  setDeleteModalInfo, 
  setExtendModalInfo, 
  handleToggleStatus,
  handleCancelDeletion, handlePurgeClient,
  handleExport,     // 🚀 Nueva prop
  isBackingUp       // 🚀 Nueva prop para deshabilitar mientras carga
}) => {
  const isExpired = !license.expiry || license.expiry.toDate() < new Date();
  const isInactive = license.status !== 'activa';
  const hasProblem = isExpired || isInactive;
  
  const fullName = `${license.ownerFirstName || ''} ${license.ownerLastName || ''}`.trim() || 'Dueño';

  return (
    <div className="card fade-in" style={{ 
      padding: '0', overflow: 'hidden',
      borderTop: `4px solid ${hasProblem ? 'var(--danger)' : 'var(--success)'}`
    }}>
      
      {/* Cabecera de Tarjeta */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.1rem', wordBreak: 'break-all' }}>
            {license.businessName}
          </h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ 
              fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase', padding: '4px 8px', borderRadius: '4px',
              background: hasProblem ? '#fef2f2' : '#d1fae5', color: hasProblem ? 'var(--danger)' : 'var(--success)' 
            }}>
              {isExpired ? 'VENCIDA' : (isInactive ? 'SUSPENDIDA' : 'ACTIVA')}
            </span>
            
            {/* 🚀 BOTÓN DE EXPORTAR BD */}
            <button 
              onClick={() => handleExport(license.id, license.purgeJobId || license.maintenanceJobId || license.backupId)}
              disabled={isBackingUp}
              title="Crear o consultar backup verificado"
              style={{ 
                background: 'transparent', border: 'none', 
                cursor: isBackingUp ? 'wait' : 'pointer', 
                fontSize: '1.2rem', padding: 0,
                opacity: isBackingUp ? 0.3 : 0.8,
                transition: 'opacity 0.2s'
              }}
            >
              📥
            </button>

            {/* BOTÓN DE ELIMINAR */}
            <button 
              onClick={() => setDeleteModalInfo(license)}
              disabled={isProcessing || license.tenantStatus !== 'active'}
              title="Solicitar eliminación recuperable"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem', opacity: 0.8, padding: 0 }}
            >
              🗑️
            </button>
          </div>
        </div>
        
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          ID: {license.id}
        </span>
      </div>

      {/* Detalles de Tarjeta */}
      <div style={{ background: 'var(--bg-app)', padding: '15px 20px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', display: 'grid', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem' }}>
          <span style={{ fontSize: '1.2rem' }}>👤</span>
          <div>
            <strong style={{ display: 'block', color: 'var(--text-main)' }}>{fullName}</strong>
            <span style={{ color: 'var(--text-muted)' }}>{license.ownerEmail}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem' }}>
          <span style={{ fontSize: '1.2rem' }}>📅</span>
          <div>
            <strong style={{ display: 'block', color: 'var(--text-main)' }}>Vencimiento</strong>
            <span style={{ color: hasProblem ? 'var(--danger)' : 'var(--text-muted)', fontWeight: hasProblem ? 'bold' : 'normal' }}>
              {formatDate(license.expiry)}
            </span>
          </div>
        </div>
      </div>

      {/* Botonera de Tarjeta */}
      {license.tenantStatus !== 'active' && <div style={{ padding: '15px 20px' }}>
        <strong>{license.tenantStatus === 'deletion_requested' ? 'Eliminación solicitada' : 'Purga en curso'}</strong>
        {license.purgeAfter && <p>Recuperable hasta {new Date(license.purgeAfter).toLocaleString('es-PE')}</p>}
        {license.tenantStatus === 'deletion_requested' && <>
          <button disabled={isProcessing} onClick={() => handleCancelDeletion(license.id)}>Cancelar solicitud</button>
          <button disabled={isProcessing || !!license.maintenanceJobId || new Date(license.purgeAfter) > new Date()} onClick={() => handlePurgeClient(license.id)}>Purgar con backup verificado</button>
        </>}
      </div>}
      <div style={{ padding: '15px 20px', display: 'flex', gap: '10px' }}>
        <button disabled={isProcessing || license.tenantStatus !== 'active' || !!license.maintenanceJobId} onClick={() => setExtendModalInfo(license.id)} className="btn-primary" style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}>
          🚀 Renovar
        </button>
        <button 
          onClick={() => handleToggleStatus(license.id, license.status)} 
          disabled={isProcessing || license.tenantStatus !== 'active' || !!license.maintenanceJobId}
          className="btn-icon" 
          style={{ border: '1px solid var(--border)', opacity: isProcessing ? 0.5 : 1, borderRadius: '8px' }} 
          title={isInactive ? 'Activar Servicio' : 'Suspender Servicio'}
        >
          {isInactive ? '▶️' : '⏸️'}
        </button>
      </div>
    </div>
  );
});

// Componente Principal
function SuperAdmin({ user }) {
  const { 
    isLoading, isProcessing, handleCreateClient, handleExtendLicense, 
    handleToggleStatus, handleDeleteClient, handleCancelDeletion, handlePurgeClient,
    searchTerm, setSearchTerm, filteredLicenses,
    licenses, error, hasMore, loadMore, refresh
  } = useSuperAdmin(user);

  // 🚀 Instanciamos el hook de Backup Exclusivo
  const { isBackingUp, downloadTenantBackup, job, error: jobError, retryJob, cancelBackup, restoreDryRun, downloadPart } = useAdminBackup(user);
  const [partIndex, setPartIndex] = useState(0);

  const [showAddModal, setShowAddModal] = useState(false);
  const [extendModalInfo, setExtendModalInfo] = useState(null); 
  const [deleteModalInfo, setDeleteModalInfo] = useState(null); 

  const [businessName, setBusinessName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [months, setMonths] = useState(1);
  const [extendMonths, setExtendMonths] = useState(1);

  if (user?.role !== 'superadmin') {
    return (
      <div className="fade-in max-container padding-bottom-lg" style={{ textAlign: 'center', paddingTop: '50px' }}>
        <h2 style={{ color: 'var(--text-main)', fontSize: '1.5rem', marginBottom: '10px' }}>⛔ Acceso Denegado</h2>
        <p style={{ color: 'var(--text-muted)' }}>Esta área es exclusiva para el CEO de MigaPOS.</p>
      </div>
    );
  }

  const submitCreate = async (e) => {
    e.preventDefault();
    const success = await handleCreateClient(businessName, ownerEmail, firstName, lastName, months);
    if (success) {
      setBusinessName(''); setOwnerEmail(''); setFirstName(''); setLastName(''); setMonths(1);
      setShowAddModal(false);
    }
  };

  const submitExtend = async (e) => {
    e.preventDefault();
    const success = await handleExtendLicense(extendModalInfo, extendMonths);
    if (success) {
      setExtendMonths(1);
      setExtendModalInfo(null);
    }
  };

  const submitDelete = async () => {
    const success = await handleDeleteClient(deleteModalInfo.id);
    if(success) setDeleteModalInfo(null);
  };

  const isActuallyLoading = isLoading || (licenses && licenses.length === 0 && isLoading !== false);

  if (isActuallyLoading) {
    return (
      <div className="module-loader fade-in">
        <div className="spinner"></div>
        <p className="loader-text">Cargando Clientes de MigaPOS...</p>
      </div>
    );
  }

  return (
    <div className="fade-in max-container padding-bottom-lg" style={{ maxWidth: '1000px' }}>
      
      <header className="module-header">
        <h2 className="module-title">
          <span className="module-title-icon">👑</span>
          <span className="module-title-text">Clientes SaaS</span>
        </h2>
        
        <button className="btn-primary btn-add-smart" onClick={() => setShowAddModal(true)}>
          ➕ Nuevo Cliente
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      <button disabled={isLoading} onClick={refresh}>Actualizar clientes</button>
      {jobError && <p role="alert">{jobError}</p>}
      {job && <section className="card" aria-label="Job administrativo">
        <p>{job.kind} · {job.businessId} · {job.status} · etapa {job.phase}</p>
        <p>ID: {job.id} · unidades procesadas: {job.unit}</p>
        {job.lastError && <p role="alert">{job.lastError}</p>}
        {job.status === 'failed' && <button disabled={isBackingUp} onClick={retryJob}>Reintentar job</button>}
        {job.kind === 'backup' && !['completed', 'cancelled'].includes(job.status) && <button disabled={isBackingUp} onClick={cancelBackup}>Cancelar backup y liberar pausa</button>}
        {job.kind === 'backup' && job.verified && <>
          <p>Copia verificada: {job.partCount} partes privadas, con manifiesto y checksums.</p>
          <button disabled={isBackingUp} onClick={() => downloadPart()}>Descargar manifiesto</button>
          {job.partCount > 0 && <label>Parte (0–{job.partCount - 1})
            <input type="number" min="0" max={job.partCount - 1} value={partIndex} onChange={event => setPartIndex(Number(event.target.value))} />
            <button disabled={isBackingUp} onClick={() => downloadPart(partIndex)}>Descargar parte</button>
          </label>}
          <button disabled={isBackingUp} onClick={restoreDryRun}>Verificar restore dry-run</button>
          <button disabled={isBackingUp} onClick={() => downloadTenantBackup(job.businessId)}>Crear nueva copia</button>
        </>}
        {job.kind === 'restore-dry-run' && job.verified && <p>Restauración validada en dry-run. Escrituras de restauración: 0.</p>}
      </section>}

      <div className="filter-bar-container" style={{ marginBottom: '20px' }}>
        <div className="search-container">
          <span className="search-icon">🔍</span>
          <input 
            type="text" 
            className="search-input"
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar entre clientes cargados por negocio, dueño, correo o ID..."
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="btn-clear-search">✖</button>
          )}
        </div>
      </div>

      {filteredLicenses.length === 0 ? (
        <div className="card fade-in empty-state-dashed">
          <span className="empty-icon-lg">🏢</span>
          <p className="empty-text-muted">
            {searchTerm ? `No se encontraron clientes para "${searchTerm}"` : 'Aún no tienes clientes registrados.'}
          </p>
        </div>
      ) : (
        <div className="history-grid">
          {filteredLicenses.map(license => (
            <ClientCard 
              key={license.id} 
              license={license} 
              isProcessing={isProcessing} 
              setDeleteModalInfo={setDeleteModalInfo} 
              setExtendModalInfo={setExtendModalInfo} 
              handleToggleStatus={handleToggleStatus}
              handleCancelDeletion={handleCancelDeletion}
              handlePurgeClient={handlePurgeClient}
              handleExport={downloadTenantBackup} // 🚀 Pasamos la función
              isBackingUp={isBackingUp}           // 🚀 Pasamos el estado de carga
            />
          ))}
        </div>
      )}
      {hasMore && <button disabled={isLoading} onClick={loadMore}>Cargar más clientes</button>}

      {/* MODAL: NUEVO CLIENTE */}
      {showAddModal && (
        <div className="modal-overlay fade-in">
          <div className="modal-content card" style={{ maxWidth: '450px' }}>
            <h3 className="modal-header-title">🏢 Alta de Nuevo Cliente</h3>
            
            <div style={{ background: '#e0f2fe', color: '#0369a1', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '15px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span>💡</span>
              <p style={{ margin: 0 }}>El sistema creará automáticamente la <strong>Sede Principal</strong> y los Ajustes base para este cliente.</p>
            </div>

            <form onSubmit={submitCreate} className="smart-form">
              <div className="form-group">
                <label className="form-label">NOMBRE DEL NEGOCIO</label>
                <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Ej: Panadería San José" required disabled={isProcessing} />
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">NOMBRE DUEÑO</label>
                  <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Ej: Juan" required disabled={isProcessing} />
                </div>
                <div className="form-group">
                  <label className="form-label">APELLIDO</label>
                  <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Ej: Pérez" required disabled={isProcessing} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">CORREO GMAIL</label>
                <input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} placeholder="juanperez@gmail.com" required disabled={isProcessing} />
              </div>

              <div className="form-group">
                <label className="form-label">MESES PAGADOS</label>
                <select value={months || 1} onChange={e => setMonths(e.target.value)} disabled={isProcessing}>
                  <option value={1}>1 Mes</option>
                  <option value={3}>3 Meses</option> 
                  <option value={6}>6 Meses</option>
                  <option value={12}>1 Año</option>
                </select>
              </div>

              <div className="modal-actions-footer">
                <button type="button" onClick={() => setShowAddModal(false)} disabled={isProcessing} className="btn-cancel">Cancelar</button>
                <button type="submit" disabled={isProcessing} className="btn-primary flex-1">{isProcessing ? 'Creando...' : 'Crear Inquilino'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RENOVAR LICENCIA */}
      {extendModalInfo && (
        <div className="modal-overlay fade-in">
          <div className="modal-content card" style={{ maxWidth: '350px' }}>
            <h3 className="modal-header-title">🚀 Renovar Licencia</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px', lineHeight: 1.4 }}>
              Agrega meses de servicio a este cliente. Si estaba suspendido, se reactivará automáticamente.
            </p>
            
            <form onSubmit={submitExtend} className="smart-form">
              <div className="form-group">
                <label className="form-label">TIEMPO A EXTENDER</label>
                <select value={extendMonths || 1} onChange={e => setExtendMonths(e.target.value)} disabled={isProcessing}>
                  <option value={1}>+ 1 Mes de servicio</option>
                  <option value={3}>+ 3 Meses de servicio</option> 
                  <option value={6}>+ 6 Meses de servicio</option>
                  <option value={12}>+ 1 Año de servicio</option>
                </select>
              </div>

              <div className="modal-actions-footer">
                <button type="button" onClick={() => setExtendModalInfo(null)} disabled={isProcessing} className="btn-cancel">Cancelar</button>
                <button type="submit" disabled={isProcessing} className="btn-primary flex-1" style={{ background: 'var(--success)' }}>Confirmar Pago</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CRÍTICO: ELIMINAR CLIENTE DEFINITIVAMENTE */}
      {deleteModalInfo && (
        <div className="modal-overlay fade-in">
          <div className="modal-content card" style={{ maxWidth: '400px', borderTop: '5px solid var(--danger)' }}>
            <h3 className="modal-header-title">Solicitar eliminación</h3>
            
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px', lineHeight: 1.5 }}>
              ¿Estás seguro de eliminar a <strong>{deleteModalInfo.businessName}</strong>? <br/><br/>
              Se bloquearán operaciones nuevas y se preparará un backup privado verificable. La solicitud puede cancelarse durante el período recuperable. <br/><br/>
              La purga definitiva requiere otra confirmación y un backup verificado.
            </p>
            
            <div className="modal-actions-footer">
              <button type="button" onClick={() => setDeleteModalInfo(null)} disabled={isProcessing} className="btn-cancel">Cancelar</button>
              <button type="button" onClick={submitDelete} disabled={isProcessing} className="btn-primary flex-1" style={{ background: 'var(--danger)' }}>
                {isProcessing ? 'Solicitando...' : 'Solicitar y preparar backup'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default SuperAdmin;
