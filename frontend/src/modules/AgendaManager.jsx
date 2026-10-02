// src/modules/agenda/AgendaManager.jsx
import React, { memo } from 'react';
import { useAgenda } from '../features/customers/hooks/useAgenda';

const ContactCard = memo(({ c, openEditForm, handleDelete, isLoading }) => {
  return (
    <div className="product-list-card fade-in" style={{ borderLeft: '5px solid #3b82f6' }}>

      {/* 1. ICONO (Usamos la inicial del nombre) */}
      <div className="product-image-box" style={{ background: '#eff6ff', color: '#3b82f6', fontWeight: 'bold' }}>
        <span style={{ fontSize: '1.6rem' }}>{c.name.charAt(0).toUpperCase()}</span>
      </div>

      {/* 2. INFO (Nombre y Teléfono) */}
      <div className="product-info-col">
        <h3 className="product-title-text">{c.name}</h3>
        <div className="product-badges-row">
          <span className="badge-stock" style={{ background: '#f1f5f9', color: '#475569' }}>
            📱 {c.phone || 'Sin número'}
          </span>
        </div>
      </div>

      {/* 3. ACCIÓN (Botón Editar y Eliminar) */}
      <div className="product-action-col" style={{ flexDirection: 'row', gap: '5px' }}>
        <button
          onClick={() => openEditForm(c)}
          disabled={isLoading}
          className="btn-icon"
          title="Editar"
          style={{ background: 'var(--bg-app)', minHeight: '34px', minWidth: '34px' }}
        >✏️</button>
        <button
          onClick={() => handleDelete(c.id)}
          disabled={isLoading}
          className="btn-icon"
          title="Eliminar"
          style={{ background: '#fee2e2', color: '#ef4444', minHeight: '34px', minWidth: '34px' }}
        >🗑️</button>
      </div>

    </div>
  );
});

function AgendaManager({ user }) {
  const {
    isLoading, searchTerm, setSearchTerm, showFormModal, setShowFormModal,
    name, setName, phone, setPhone, editing,
    filteredContacts, openAddForm, openEditForm, handleSave, handleDelete
  } = useAgenda(user);

  if (isLoading && filteredContacts.length === 0) {
    return (
      <div className="module-loader fade-in">
        <div className="spinner"></div>
        <p className="loader-text">Abriendo Agenda...</p>
      </div>
    );
  }

  return (
    <div className="fade-in max-container padding-bottom-lg" style={{ maxWidth: '900px' }}>

      <header className="module-header">
        <h2 className="module-title">
          <span className="module-title-icon">📖</span>
          <span className="module-title-text">Agenda VIP</span>
        </h2>
        <button onClick={openAddForm} className="btn-primary btn-add-smart" style={{ background: '#3b82f6' }}>
          ➕ Nuevo Contacto
        </button>
      </header>

      <div className="filter-bar-container">
        <div className="search-container">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar contacto por nombre o celular..."
            className="search-input"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="btn-clear-search">✖</button>
          )}
        </div>
      </div>

      <h3 className="inventory-title">
        Lista de Contactos Frecuentes ({filteredContacts.length})
      </h3>

      <div className="product-list-container">
        {filteredContacts.length === 0 ? (
          <div className="card fade-in empty-state">
            <span className="empty-icon-lg">👥</span>
            <p className="empty-text">
              {searchTerm ? `Nadie coincide con "${searchTerm}"` : 'Aún no has registrado clientes VIP.'}
            </p>
          </div>
        ) : (
          filteredContacts.map(c => (
            <ContactCard
              key={c.id}
              c={c}
              openEditForm={openEditForm}
              handleDelete={handleDelete}
              isLoading={isLoading}
            />
          ))
        )}
      </div>

      {showFormModal && (
        <div className="modal-overlay fade-in">
          <div className="card modal-content" style={{ maxWidth: '400px' }}>
            <h3 className="modal-header-title">
              {editing ? '✏️ Editar Contacto' : '➕ Nuevo Contacto'}
            </h3>

            <form onSubmit={handleSave} className="smart-form">
              <div className="form-group">
                <label className="form-label">NOMBRE DEL CLIENTE</label>
                <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Maria Lopez" required disabled={isLoading} />
              </div>

              <div className="form-group">
                <label className="form-label">TELÉFONO / WHATSAPP</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ej: 987 654 321" required disabled={isLoading} />
              </div>

              <div className="modal-actions-footer">
                <button type="button" onClick={() => setShowFormModal(false)} disabled={isLoading} className="btn-cancel">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={isLoading} style={{ background: '#3b82f6' }}>
                  {isLoading ? 'Guardando...' : 'Guardar Contacto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default AgendaManager;
