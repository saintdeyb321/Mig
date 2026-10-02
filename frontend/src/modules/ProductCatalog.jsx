// src/modules/ProductCatalog.jsx
import React, { useCallback, memo } from 'react';
import { useProducts } from '../hooks/useProducts'; 
import { useGlobalData } from '../context/GlobalDataContext'; 
import toast from 'react-hot-toast';

const getSafeStock = (product, branchId) => {
  if (!product) return 0;
  
  const stockObj = (typeof product.stock === 'object' && product.stock !== null) ? product.stock : 
                   (typeof product.rawStock === 'object' && product.rawStock !== null) ? product.rawStock : null;
                   
  if (stockObj) {
    if (branchId === 'global') {
       return Object.values(stockObj).reduce((sum, val) => sum + (Number(val) || 0), 0);
    }
    return Number(stockObj[branchId] || 0);
  }
  
  return branchId === 'global' ? Number(product.stock || 0) : 0; 
};

const ProductCard = memo(({ p, activeBranchId, openEditForm, isLoading }) => {
  const currentStock = getSafeStock(p, activeBranchId); 

  const isAgotado = currentStock <= 0;
  const isPoco = currentStock > 0 && currentStock <= 10;
  const isActivo = p.status === 'activo';

  let cardClasses = `product-list-card fade-in ${isActivo ? '' : 'inactive'}`;
  if (isActivo) {
    cardClasses += isAgotado ? ' active-out-of-stock' : ' active-stock';
  } else {
    cardClasses += ' inactive-border';
  }

  const stockClass = 'badge-stock ' + (isAgotado ? 'agotado' : isPoco ? 'poco' : 'ok');
  const stockText = isAgotado ? 'AGOTADO' : isPoco ? `¡Solo ${currentStock}!` : `${currentStock} disp.`;

  return (
    <div className={cardClasses}>
      <div className="product-image-box">
        {p.imageUrl ? (
          <img src={p.imageUrl} alt={p.name} loading="lazy" />
        ) : (
          <span className="product-image-placeholder">{p.name.charAt(0)}</span>
        )}
      </div>

      <div className="product-info-col">
        <h3 className={`product-title-text ${isAgotado ? 'out-of-stock' : ''}`}>{p.name}</h3>
        <div className="product-badges-row">
          <span className="badge-category">{p.category}</span>
          <span className={stockClass}>📦 {stockText}</span>
          {!isActivo && <span className="badge-inactive">INACTIVO</span>}
        </div>
      </div>

      <div className="product-action-col">
        <span className="product-price-text">S/ {Number(p.price).toFixed(2)}</span>
        <button onClick={() => openEditForm(p)} disabled={isLoading} className="btn-icon" title="Editar">✏️</button>
      </div>
    </div>
  );
});

function ProductCatalog({ user }) {
  const { activeBranchId, globalProducts } = useGlobalData(); 

  const {
    categories, businessBranches, isLoading, searchTerm, setSearchTerm,
    showFormModal, setShowFormModal, showInactive, setShowInactive,
    name, setName, price, setPrice, category, setCategory, status, setStatus, editing,
    branchStocks, setBranchStocks, 
    imageUrl, setImageUrl, 
    filteredProducts, openAddForm, openEditForm, handleSave
  } = useProducts(user);

  const handleImageUpload = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecciona una imagen válida.');
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 200; 
        const MAX_HEIGHT = 200; 
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
        } else {
          if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        setImageUrl(compressedBase64); 
      };
    };
  }, [setImageUrl]); 

  const currentEditingProduct = editing ? globalProducts.find(p => p.id === editing) : null;

  if (isLoading) {
    return (
      <div className="module-loader fade-in">
        <div className="spinner"></div>
        <p className="loader-text">Cargando inventario...</p>
      </div>
    );
  }

  return (
    <div className="fade-in max-container padding-bottom-lg" style={{ maxWidth: '900px' }}>
      
      <header className="module-header">
        <h2 className="module-title">
          <span className="module-title-icon">☕</span> 
          <span className="module-title-text">Productos</span>
        </h2>
        
        <button onClick={openAddForm} className="btn-primary btn-add-smart">
          ➕ Nuevo Producto
        </button>
      </header>

      <div className="filter-bar-container">
        <div className="search-container">
          <span className="search-icon">🔍</span>
          <input 
            type="text" 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar producto..."
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
        Inventario {activeBranchId === 'global' ? 'Global' : 'de la Sede'} ({filteredProducts.length})
      </h3>

      <div className="product-list-container">
        {filteredProducts.length === 0 ? (
          <div className="card fade-in empty-state">
            <span className="empty-icon-lg">📋</span>
            <p className="empty-text">
              {searchTerm ? `No se encontraron productos para "${searchTerm}"` : 'Aún no tienes productos.'}
            </p>
          </div>
        ) : (
          filteredProducts.map(p => (
            <ProductCard 
              key={p.id} 
              p={p} 
              activeBranchId={activeBranchId} 
              openEditForm={openEditForm} 
              isLoading={isLoading} 
            />
          ))
        )}
      </div>

      {showFormModal && (
        <div className="modal-overlay fade-in" style={{ zIndex: 9999 }}>
          <div className="card modal-content">
            
            <h3 className="modal-header-title">
              {editing ? '✏️ Editar Producto' : '📦 Nuevo Producto'}
            </h3>
            
            <form onSubmit={handleSave} className="smart-form">
              
              <div className="upload-zone">
                <div className="upload-preview-box">
                  {imageUrl ? (
                    <img src={imageUrl} alt="Preview" className="preview-img" />
                  ) : (
                    <span className="preview-placeholder">📷</span>
                  )}
                </div>
                
                <div className="upload-actions-col">
                  <label className="form-label">FOTO DEL PRODUCTO (Opcional)</label>
                  
                  <input 
                    type="file" id="product-img" accept="image/*" 
                    onChange={handleImageUpload} disabled={isLoading} 
                    className="hidden-input" 
                  />
                  
                  <div className="upload-buttons-row">
                    <label htmlFor="product-img" className="btn-upload-file">
                       {imageUrl ? '🔄 Cambiar' : '📁 Seleccionar archivo'}
                    </label>

                    {imageUrl && (
                      <button type="button" onClick={() => setImageUrl('')} className="btn-remove-img" title="Eliminar foto">
                        🗑️ Quitar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">NOMBRE</label>
                <input autoFocus value={name} onChange={e => setName(e.target.value)} required disabled={isLoading} maxLength="100" pattern=".*\S+.*"/>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">PRECIO (S/)</label>
                  <input value={price} onChange={e => setPrice(e.target.value)} type="number" step="0.01" min="0" required disabled={isLoading} className="input-highlight" />
                </div>
                <div className="form-group">
                  <label className="form-label">CATEGORÍA</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} required disabled={isLoading}>
                    <option value="" disabled>Selecciona...</option>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="stock-panel">
                <label className="stock-panel-title">
                  <span>📦</span> DISTRIBUCIÓN DE INVENTARIO
                </label>
                
                {businessBranches.length === 0 ? (
                  <p className="stock-panel-empty">
                    ⚠️ No tienes sucursales creadas. Ve a Configuración para crearlas.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    
                    <div className="stock-table-header">
                      <span className="stock-col-title">SUCURSAL</span>
                      <span className="stock-col-title stock-col-right">
                        {editing ? 'AJUSTAR STOCK' : 'STOCK INICIAL'}
                      </span>
                    </div>

                    {businessBranches.map((branch) => {
                      const stockActual = getSafeStock(currentEditingProduct, branch.id);
                      
                      const ajusteInput = branchStocks[branch.id];
                      const ajusteNumerico = Number(ajusteInput);
                      const delta = isNaN(ajusteNumerico) ? 0 : Math.floor(ajusteNumerico);
                      
                      const stockFinal = Math.max(0, stockActual + delta);
                      const historyText = currentEditingProduct?.lastStockHistory?.[branch.id];

                      return (
                        <div key={branch.id} className="stock-table-row">
                          
                          <div className="stock-branch-info">
                            <span className="stock-branch-name">
                              {branch.name.toUpperCase()}
                            </span>
                            {editing && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span className="stock-current-info" style={{ display: 'block' }}>
                                  En almacén: <span className="stock-current-number">{stockActual}</span> uds.
                                </span>
                                
                                {historyText && (
                                  <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: '800' }}>
                                    Último mov: {historyText}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="stock-input-wrapper">
                            {/* 🚀 FIX: TYPE="NUMBER" NATIVO EVITA CUALQUIER BUG DE EXPRESIÓN REGULAR */}
                            <input 
                              type="number" 
                              value={ajusteInput !== undefined ? ajusteInput : ''} 
                              onChange={(e) => {
                                setBranchStocks(prev => ({ ...prev, [branch.id]: e.target.value }));
                              }}
                              placeholder={editing ? "Ej: 10, -5" : "0"}
                              disabled={isLoading} 
                              className={`stock-adjust-input ${delta > 0 ? 'is-addition' : delta < 0 ? 'is-deduction' : ''}`}
                            />
                            
                            {editing && (ajusteInput !== undefined && ajusteInput !== '') && !isNaN(ajusteNumerico) && delta !== 0 && (
                              <span className={`stock-preview-text ${delta > 0 ? 'text-addition' : 'text-deduction'}`}>
                                ➔ {stockFinal} uds.
                              </span>
                            )}
                          </div>

                        </div>
                      )
                    })}

                  </div>
                )}
                {editing && (
                  <div className="stock-tip-box">
                    <p className="stock-tip-text">
                      <strong>Tip:</strong> Usa números positivos (ej: <b>10</b>) para agregar stock, o negativos (ej: <b>-5</b>) para retirarlo.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="form-group">
                <label className="form-label">ESTADO DEL PRODUCTO</label>
                <select value={status} onChange={e => setStatus(e.target.value)} disabled={isLoading}>
                  <option value="activo">🟢 Activo y Visible</option>
                  <option value="inactivo">🔴 Inactivo (Oculto)</option>
                </select>
              </div>
              
              <div className="modal-actions-footer">
                <button type="button" onClick={() => setShowFormModal(false)} disabled={isLoading} className="btn-cancel">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={isLoading || businessBranches.length === 0}>
                  {isLoading ? 'Guardando...' : 'Guardar Producto'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
    </div>
  );
}

export default ProductCatalog;