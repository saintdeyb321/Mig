// src/modules/CategoryManager.jsx
import React, { memo } from 'react';
import { useCategories } from '../features/catalog/hooks/useCategories';
// Esta tarjeta solo se redibujará si su nombre o estado cambian en Firebase.
// Escribir en la barra de búsqueda ya NO afectará a las categorías que no coincidan.
const CategoryCard = memo(({ c, openEditForm, isLoading }) => {
  const isInactive = c.status === 'inactivo';

  // Reutilizamos el estilo de las tarjetas de productos
  let cardClasses = `product-list-card fade-in ${isInactive ? 'inactive inactive-border' : ''}`;

  return (
    <div className={cardClasses} style={!isInactive ? { borderLeft: '5px solid var(--primary)' } : {}}>

      {/* 1. ICONO */}
      <div className="product-image-box" style={{ background: isInactive ? 'var(--bg-app)' : 'var(--primary-light)' }}>
        <span style={{ fontSize: '1.6rem', opacity: isInactive ? 0.4 : 1 }}>🏷️</span>
      </div>

      {/* 2. INFO (Nombre y Estado) */}
      <div className="product-info-col">
        <h3 className={`product-title-text ${isInactive ? 'out-of-stock' : ''}`}>
          {c.name}
        </h3>
        <div className="product-badges-row">
          <span className="badge-stock" style={{
            background: isInactive ? '#fee2e2' : '#d1fae5',
            color: isInactive ? 'var(--danger)' : 'var(--success)'
          }}>
            {isInactive ? '🔴 INACTIVA' : '🟢 ACTIVA'}
          </span>
        </div>
      </div>

      {/* 3. ACCIÓN (Botón Editar) */}
      <div className="product-action-col">
        <button
          onClick={() => openEditForm(c)}
          disabled={isLoading}
          className="btn-icon"
          title="Editar"
          style={{ background: 'var(--bg-app)', minHeight: '34px', minWidth: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          ✏️
        </button>
      </div>

    </div>
  );
});

// Componente Principal
function CategoryManager({ user }) {
  const {
    isLoading, searchTerm, setSearchTerm, showFormModal, setShowFormModal,
    name, setName, status, setStatus, editing, showInactive, setShowInactive,
    filteredCategories, openAddForm, openEditForm, handleSave
  } = useCategories(user);
  if (isLoading) {
    return (
      <div className="module-loader fade-in">
        <div className="spinner"></div>
        {/* Texto exclusivo para este módulo */}
        <p className="loader-text">Organizando categorías...</p>
      </div>
    );
  }

  return (
    <div className="fade-in max-container padding-bottom-lg" style={{ maxWidth: '900px' }}>

      {/* HEADER REFACTORIZADO */}
      <header className="module-header">
        <h2 className="module-title">
          <span className="module-title-icon">📂</span>
          <span className="module-title-text">Categorias</span>
        </h2>

        <button onClick={openAddForm} className="btn-primary btn-add-smart">
          ➕ Nueva Categoria
        </button>
      </header>

      {/* BARRA DE BÚSQUEDA Y TOGGLE */}
      <div className="filter-bar-container">
        <div className="search-container">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar categoría por nombre..."
            className="search-input"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="btn-clear-search">✖</button>
          )}
        </div>

        <label className="toggle-label">
          <input
            type="checkbox"
            className="toggle-checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Ver archivados
        </label>
      </div>

      <h3 className="inventory-title">
        Lista de Categorías ({filteredCategories.length})
      </h3>


      <div className="product-list-container">
        {filteredCategories.length === 0 ? (
          <div className="card fade-in empty-state">
            <span className="empty-icon-lg">📁</span>
            <p className="empty-text">
              {searchTerm ? `No se encontraron resultados para "${searchTerm}"` : 'Aún no has registrado ninguna categoría.'}
            </p>
          </div>
        ) : (
          filteredCategories.map(c => (
            /* 🚀 Invocamos la tarjeta blindada */
            <CategoryCard
              key={c.id}
              c={c}
              openEditForm={openEditForm}
              isLoading={isLoading}
            />
          ))
        )}
      </div>

      {/* MODAL FORMULARIO LIMPIO */}
      {showFormModal && (
        <div className="modal-overlay fade-in">
          <div className="card modal-content" style={{ maxWidth: '400px' }}>
            <h3 className="modal-header-title">
              {editing ? '✏️ Editar Categoría' : '➕ Nueva Categoría'}
            </h3>

            <form onSubmit={handleSave} className="smart-form">
              <div className="form-group">
                <label className="form-label">NOMBRE</label>
                <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Panes, Postres..." required disabled={isLoading} />
              </div>

              <div className="form-group">
                <label className="form-label">ESTADO</label>
                <select value={status} onChange={e => setStatus(e.target.value)} disabled={isLoading}>
                  <option value="activo">🟢 Activo</option>
                  <option value="inactivo">🔴 Inactivo</option>
                </select>
              </div>

              <div className="modal-actions-footer">
                <button type="button" onClick={() => setShowFormModal(false)} disabled={isLoading} className="btn-cancel">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={isLoading}>
                  {isLoading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default CategoryManager;
