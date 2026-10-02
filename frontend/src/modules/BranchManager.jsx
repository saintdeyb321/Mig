// src/modules/BranchManager.jsx
import React, { memo, useState } from 'react';
import { useBranches } from '../features/branches/hooks/useBranches';
import QRPaymentCard from './QRPaymentCard';
const BranchCard = memo(({ b, openEditForm, isProcessing }) => {
  const isInactive = b.status?.toLowerCase() === 'inactivo';
  const hasQR = Boolean(b.yapeQrUrl);

  return (
    <div className={`user-card fade-in ${isInactive ? 'inactive' : ''}`}>
      <div className="user-card-content">
        <div className="user-avatar avatar-staff" style={{ position: 'relative' }}>
          <span style={{ opacity: isInactive ? 0.5 : 1 }}>🏢</span>
        </div>

        <div className="user-info">
          <div className="user-name-row">
            <span className={`user-name ${isInactive ? 'text-strikethrough text-muted' : 'text-main'}`}>
              {b.name}
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {hasQR && (
                <span className="user-badge" style={{ background: '#e0e7ff', color: '#3730a3' }}>
                  📱 QR Activo
                </span>
              )}
              <span className="user-badge" style={{ background: isInactive ? '#fee2e2' : '#dcfce7', color: isInactive ? 'var(--danger)' : '#166534' }}>
                {isInactive ? '🔴 INACTIVA' : '🟢 ACTIVA'}
              </span>
            </div>
          </div>

          <span className="employee-card-email" style={{ marginTop: '4px' }}>
            📍 {b.address || 'Sin dirección'}
          </span>

          <div className="user-shift" style={{ marginTop: '2px' }}>
            <span className="shift-icon">📞</span>
            <span className="shift-text" style={{ color: 'var(--text-muted)', fontWeight: '500' }}>
              {b.phone || 'Sin teléfono'}
            </span>
          </div>
        </div>
      </div>

      <div className="user-actions">
        <button
          onClick={() => openEditForm(b)}
          disabled={isProcessing}
          className="btn-user-action btn-edit-user"
        >
          <span>✏️</span> Editar
        </button>
      </div>
    </div>
  );
});
function BranchManager({ user, isEmbedded = false }) {
  const {
    branches, isLoading, isProcessing,
    showFormModal, setShowFormModal,
    name, setName, address, setAddress, phone, setPhone, status, setStatus,
    qrImageBase64, handleImageChange, removeQrImage,
    editingBranch, openAddForm, openEditForm, handleSave
  } = useBranches(user);

  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const filteredBranches = branches.filter(b => {
    const matchesSearch = b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (b.address && b.address.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = showInactive ? true : b.status !== 'inactivo';
    return matchesSearch && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className="loading-container fade-in" style={{ padding: '20px' }}>
        <span className="loading-icon">🏢</span>
        <p className="loading-text">Cargando sucursales...</p>
      </div>
    );
  }

  return (
    <div className={isEmbedded ? "fade-in" : "fade-in max-container padding-bottom-lg"} style={isEmbedded ? {} : { maxWidth: '900px', margin: '0 auto' }}>

      {!isEmbedded && (
        <header className="module-header">
          <h2 className="module-title">
            <span className="module-title-icon">🏢</span>
            <span className="module-title-text">Mis Sucursales</span>
          </h2>
          <button onClick={openAddForm} className="btn-primary btn-add-smart">
            ➕ Nueva Sede
          </button>
        </header>
      )}

      <div className="filter-bar-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '20px' }}>

        <div className="search-container" style={{ flex: '1 1 200px', margin: 0 }}>
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre..."
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="btn-clear-search">✖</button>
          )}
        </div>

        <label className="toggle-label" style={{ margin: 0 }}>
          <input
            type="checkbox"
            className="toggle-checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Ver inactivos
        </label>

        {isEmbedded && (
        <button onClick={openAddForm} className="btn-primary btn-add-smart">
            ➕ Nueva Sede
          </button>
        )}
      </div>

      <h3 className="inventory-title" style={{ marginTop: 0 }}>
        Lista de Sedes ({filteredBranches.length})
      </h3>

      <div className="user-list-container">
        {filteredBranches.length === 0 ? (
          <div className="card empty-state-dashed fade-in">
            <span className="empty-icon-lg">🏢</span>
            <p className="empty-text-muted">
              {searchTerm ? `No se encontraron resultados para "${searchTerm}"` : 'Aún no hay sucursales registradas.'}
            </p>
          </div>
        ) : (
          filteredBranches.map(b => (
            <BranchCard
              key={b.id}
              b={b}
              openEditForm={openEditForm}
              isProcessing={isProcessing}
            />
          ))
        )}
      </div>

      {/* MODAL FORMULARIO */}
      {showFormModal && (
        <div className="modal-overlay fade-in" style={{ zIndex: 9999 }}>
          <div className="card modal-content" style={{ maxWidth: '450px' }}>
            <h3 className="modal-header-title">
              {editingBranch ? '✏️ Editar Sede' : '➕ Nueva Sede'}
            </h3>

            <form onSubmit={handleSave} className="smart-form">
              <div className="form-group">
                <label className="form-label">NOMBRE DE LA SEDE</label>
                <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Sede Principal" required disabled={isProcessing} />
              </div>
              <div className="form-group">
                <label className="form-label">DIRECCIÓN FÍSICA</label>
                <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Ej: Av. Las Begonias 123" disabled={isProcessing} />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">TELÉFONO DE ATENCIÓN</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Opcional" disabled={isProcessing} />
                </div>
                <div className="form-group">
                  <label className="form-label">ESTADO</label>
                  <select value={status} onChange={e => setStatus(e.target.value)} disabled={isProcessing}>
                    <option value="activo">🟢 Activa</option>
                    <option value="inactivo">🔴 Inactiva</option>
                  </select>
                </div>
              </div>


              <QRPaymentCard
                qrImageBase64={qrImageBase64}
                isProcessing={isProcessing}
                handleImageChange={handleImageChange}
                onRemoveImage={removeQrImage}
              />

              <div className="modal-actions-footer" style={{ marginTop: '25px' }}>
                <button type="button" onClick={() => setShowFormModal(false)} disabled={isProcessing} className="btn-cancel">Cancelar</button>
                <button type="submit" className="btn-yape-solid flex-1" disabled={isProcessing}>
                  {isProcessing ? 'Guardando...' : 'Guardar Sede'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default BranchManager;
