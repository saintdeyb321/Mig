import { brand } from '../config/brand';
// src/modules/SuperAdmin.jsx
import React, { useState, memo } from 'react';
import { useSuperAdmin } from '../hooks/useSuperAdmin'; 
import BackupPanel from '../features/backups/components/BackupPanel.jsx';
import { runtimeCapabilities } from '../config/runtimeCapabilities.js';
import { toDateSafe } from '../core/dates/dateValues.js';

const formatDate = (timestamp) => {
  if (!timestamp) return 'Sin fecha';
  const d = toDateSafe(timestamp);
  if (!d) return 'Fecha inválida';
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
};

const ClientCard = memo(({ 
  license, 
  isProcessing, 
  setExtendModalInfo, 
  handleToggleStatus,
  handleExport
}) => {
  const expiryDate = toDateSafe(license.expiry);
  const isExpired = !expiryDate || expiryDate < new Date();
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
              onClick={() => handleExport(license.id)}
              disabled={isProcessing}
              title="Exportar datos autorizados a un archivo local" aria-label="Exportar datos autorizados"
              style={{ 
                background: 'transparent', border: 'none', 
                cursor: 'pointer',
                fontSize: '1.2rem', padding: 0,
                opacity: 0.8,
                transition: 'opacity 0.2s'
              }}
            >
              📥
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
      {license.tenantStatus !== 'active' && <p role="status">Estado histórico: {license.tenantStatus}. Mantenimiento privilegiado no disponible en Spark.</p>}
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
    handleToggleStatus,
    searchTerm, setSearchTerm, filteredLicenses,
    licenses, error, hasMore, loadMore, refresh
  } = useSuperAdmin(user);

  const [backupBusinessId, setBackupBusinessId] = useState(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [extendModalInfo, setExtendModalInfo] = useState(null); 

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
        <p style={{ color: 'var(--text-muted)' }}>Esta área es exclusiva para el CEO de {brand.name}.</p>
      </div>
    );
  }

  if (!runtimeCapabilities.tenantAdministration) return (
    <section className="fade-in max-container padding-bottom-lg" aria-label="Administración de plataforma">
      <h2>Clientes SaaS · Firebase Spark</h2>
      <p>Contexto de plataforma: SuperAdmin.</p>
      <div className="card" role="status">
        <p>Authentication, Firestore, Hosting y persistencia local disponibles.</p>
        <p>Consulta y creación de negocios no disponibles en SPARK-0. Se habilitarán en SPARK-1.</p>
        <p>Backups cloud, purgas y automatizaciones aún no disponibles. Cloud Functions y Firebase Storage deshabilitados.</p>
      </div>
      <button className="btn-primary" disabled title="Pendiente de SPARK-1">Nuevo negocio · pendiente de SPARK-1</button>
    </section>
  );

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

  const isActuallyLoading = isLoading || (licenses && licenses.length === 0 && isLoading !== false);

  if (isActuallyLoading) {
    return (
      <div className="module-loader fade-in">
        <div className="spinner"></div>
        <p className="loader-text">Cargando Clientes de {brand.name}...</p>
      </div>
    );
  }

  return (
    <div className="fade-in max-container padding-bottom-lg" style={{ maxWidth: '1000px' }} aria-label="Administración de plataforma">
      
      <header className="module-header">
        <h2 className="module-title">
          <span className="module-title-icon">👑</span>
          <span className="module-title-text">Clientes SaaS · Firebase Spark</span>
        </h2>
        
        <button className="btn-primary btn-add-smart" onClick={() => setShowAddModal(true)}>
          ➕ Nuevo Cliente
        </button>
      </header>
      <p role="status">Administración Spark mediante Firestore. Usa un Gmail distinto del SuperAdmin para el propietario. Exportación local bajo demanda; el dueño puede exportar sus datos operativos desde Ajustes. Purga, eliminación masiva, restauración privilegiada, scheduler y jobs backend deshabilitados.</p>
      {error && <p role="alert">{error}</p>}
      <button disabled={isLoading} onClick={refresh}>Actualizar clientes</button>
      {backupBusinessId && <BackupPanel key={`${user.uid}:${backupBusinessId}`} user={user} businessId={backupBusinessId} onClose={() => setBackupBusinessId(null)} />}

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
            {error ? 'No se pudo consultar la lista. Revisa el error y vuelve a intentarlo.' : searchTerm ? `No se encontraron clientes para "${searchTerm}"` : 'Aún no tienes clientes registrados.'}
          </p>
        </div>
      ) : (
        <div className="history-grid">
          {filteredLicenses.map(license => (
            <ClientCard 
              key={license.id} 
              license={license} 
              isProcessing={isProcessing} 
              setExtendModalInfo={setExtendModalInfo} 
              handleToggleStatus={handleToggleStatus}
              handleExport={setBackupBusinessId}
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
                <input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} placeholder="Correo del titular" required disabled={isProcessing} />
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


    </div>
  );
}

export default SuperAdmin;
