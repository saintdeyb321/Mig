// src/components/POS.jsx
import React, { useState, useMemo, memo } from 'react';
import { usePOS, getSafeStock } from '../hooks/usePOS'; 
import { useGlobalData } from '../context/GlobalDataContext'; 
import { useCashRegister } from '../hooks/useCashRegister'; 
import { CashRegisterModals } from './CashRegisterModals';

const POSProductButton = memo(({ p, activeBranchId, globalDisabled, addToCart }) => {
  const currentStock = getSafeStock(p, activeBranchId);
  const isAgotado = currentStock <= 0;
  const isDisabled = isAgotado || globalDisabled;

  return (
    <button 
      onClick={() => addToCart(p)} 
      disabled={isDisabled} 
      className="product-btn" 
      title={p.name} 
      style={{ opacity: isDisabled ? 0.6 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer' }}
    >
      <div className="pos-product-img-wrapper">
        {p.imageUrl ? (
          <img src={p.imageUrl} alt={p.name} loading="lazy" />
        ) : (
          <span className="pos-product-placeholder">{p.name.charAt(0)}</span>
        )}
      </div>
      <div className="pos-product-details">
        <span className="pos-product-name">{p.name}</span>
        <span className="pos-product-price">S/ {Number(p.price).toFixed(2)}</span>
        <span className={`pos-product-stock-badge ${isAgotado ? 'stock-out' : 'stock-ok'}`}>
          {isAgotado ? 'AGOTADO' : `📦 ${currentStock} disp.`}
        </span>
      </div>
    </button>
  );
});

function POS({ user }) {
  const { businessBranches, activeBranchId } = useGlobalData();

  const { 
    currentSession, isLoadingSession, openRegister, calculateClose, confirmClose 
  } = useCashRegister(user, activeBranchId);

  const {
    filteredProducts, cart, payment, setPayment, amountPaid, setAmountPaid,
    splitEfectivo, setSplitEfectivo, splitYape, setSplitYape, // 🚀 Importados limpiamente
    search, setSearch, isProcessing, showQrModal, setShowQrModal, qrUrl,
    addToCart, updateQty, removeFromCart, total, isPaymentValid, handleCheckoutClick, processSale,
    lastSale, clearLastSale, printReceipt, activeCategories, isLoading 
  } = usePOS(user, currentSession); 

  const [selectedCategory, setSelectedCategory] = useState('todas');
  const [isCartOpen, setIsCartOpen] = useState(false);

  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);

  // Funciones exclusivas de interfaz para autocompletado
  const handleSplitEfectivoChange = (val) => {
    setSplitEfectivo(val);
    const num = Number(val);
    if (val === '') {
      setSplitYape('');
    } else if (num >= 0 && num <= total) {
      setSplitYape((total - num).toFixed(2));
    }
  };

  const handleSplitYapeChange = (val) => {
    setSplitYape(val);
    const num = Number(val);
    if (val === '') {
      setSplitEfectivo('');
    } else if (num >= 0 && num <= total) {
      setSplitEfectivo((total - num).toFixed(2));
    }
  };

  const branchStatus = useMemo(() => {
    if (activeBranchId === 'global') return { isReadOnly: true, reason: 'global' };
    if (businessBranches && activeBranchId) {
      const branch = businessBranches.find(b => b.id === activeBranchId);
      if (branch && branch.status?.toLowerCase() === 'inactivo') {
        return { isReadOnly: true, reason: 'inactive', name: branch.name };
      }
    }
    return { isReadOnly: false };
  }, [businessBranches, activeBranchId]);

  const displayedProducts = useMemo(() => {
    if (selectedCategory === 'todas') return filteredProducts;
    const selCat = (selectedCategory || '').trim().toLowerCase();
    return filteredProducts.filter(p => (p.category || '').trim().toLowerCase() === selCat);
  }, [filteredProducts, selectedCategory]);

  const handleNuevaVenta = () => {
    clearLastSale();
    setIsCartOpen(false);
  };

  const isGlobalDisabled = branchStatus.isReadOnly || (!currentSession && !branchStatus.isReadOnly) || currentSession?.needsForceClose;

  if (isLoading || isLoadingSession) {
    return (
      <div className="module-loader fade-in">
        <div className="spinner"></div>
        <p className="loader-text">Preparando caja registradora...</p>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ minHeight: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>      
      
      <header className="pos-header" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          🛒 Punto de Venta
        </h2>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {currentSession && !branchStatus.isReadOnly && (
            <button 
              onClick={() => setShowCloseModal(true)}
              title={currentSession.needsForceClose ? "Debes cerrar el turno del cajero anterior" : "Cerrar Turno"}
              className="btn-close-register"
              style={currentSession.needsForceClose ? { background: '#ef4444', color: 'white', border: 'none', fontWeight: 'bold' } : {}}
            >
              {currentSession.needsForceClose ? '⚠️ Forzar Cierre de caja' : '🔒 Cerrar caja'}
            </button>
          )}
          
          <div className="user-badge" style={{
            fontSize: '0.75rem', 
            background: branchStatus.isReadOnly || !currentSession ? '#ef4444' : (currentSession.needsForceClose ? '#f59e0b' : '#4ade80'), 
            color: 'white',
            padding: '5px 12px',
            whiteSpace: 'nowrap',
            fontWeight: 'bold',
            borderRadius: '20px'
          }}>
            {branchStatus.isReadOnly 
              ? 'Modo Lectura' 
              : !currentSession 
                ? 'Caja Cerrada' 
                : currentSession.needsForceClose 
                  ? 'Turno Pendiente' 
                  : 'Caja Abierta'}
          </div>
        </div>
      </header>
      
      {branchStatus.isReadOnly && (
        <div className="fade-in" style={{ background: '#fee2e2', border: '1px solid #ef4444', color: '#b91c1c', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '500' }}>
          <span style={{ fontSize: '1.5rem' }}>⚠️</span>
          <span>
            <strong>Modo Lectura:</strong> {branchStatus.reason === 'global' ? 'Estás en la Vista Global. Selecciona una sucursal específica en el menú.' : `La sucursal ${branchStatus.name} está inactiva.`}
          </span>
        </div>
      )}

      {currentSession?.needsForceClose && !branchStatus.isReadOnly && (
        <div className="fade-in" style={{ background: '#fef2f2', border: '1px solid #ef4444', color: '#b91c1c', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '500' }}>
          <span style={{ fontSize: '1.5rem' }}>🚨</span>
          <span>
            <strong>Acción Requerida:</strong> El turno anterior no fue cerrado. Por seguridad, haz el conteo y cierra la caja de tu compañero antes de iniciar tus ventas.
          </span>
        </div>
      )}

      <div className="pos-grid">
          <section className="products-section">      
          <div className="filter-bar-container">
            <div className="search-container">
              <span style={{ fontSize: '1.2rem', opacity: 0.5 }}>🔍</span>
              <input 
                type="text" 
                value={search} 
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar pan, dulce o bebida..."
                className="search-input"
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', minHeight: 'auto', padding: 0 }}>✖</button>
              )}
            </div>
          </div>

          {activeCategories && activeCategories.length > 0 && (
            <div className="category-scroll-wrapper fade-in">
              <div className="category-scroll-container">
                <button className={`cat-pill ${selectedCategory === 'todas' ? 'active' : ''}`} onClick={() => setSelectedCategory('todas')}>Todos</button>
                {activeCategories.map(cat => (
                  <button key={cat.id} className={`cat-pill ${selectedCategory === cat.name ? 'active' : ''}`} onClick={() => setSelectedCategory(cat.name)}>{cat.name}</button>
                ))}
              </div>
            </div>
          )}

          <div className="product-list">
            {displayedProducts.length === 0 ? (
              <div className="card fade-in empty-state" style={{ gridColumn: '1 / -1', margin: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span className="empty-icon-lg">🔍</span>
                <p className="empty-text">{search ? `No se encontraron productos para "${search}"` : 'No hay productos registrados.'}</p>
              </div>
            ) : (
              displayedProducts.map(p => (
                <POSProductButton 
                  key={p.id} 
                  p={p} 
                  activeBranchId={activeBranchId} 
                  globalDisabled={isGlobalDisabled} 
                  addToCart={addToCart} 
                />
              ))
            )}
          </div>
        </section>

        <div className={`cart-mobile-overlay ${isCartOpen ? 'open' : ''}`} onClick={() => setIsCartOpen(false)}></div>

        <div id="cart-section" className={`cart-section ${isCartOpen ? 'open' : ''}`}>
          {lastSale ? (
            <div className="card fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ecfdf5', border: '2px solid var(--success)', textAlign: 'center', padding: '2rem', position: 'relative' }}>
              <div style={{ background: 'white', width: '70px', height: '70px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', marginBottom: '1rem', boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)' }}>✅</div>
              <h2 style={{ color: 'var(--success)', marginBottom: '0.5rem', fontSize: '1.5rem' }}>¡Cobro Exitoso!</h2>
              <p style={{ color: 'var(--text-main)', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
                Total cobrado: <strong style={{ fontSize: '1.3rem' }}>S/ {lastSale.total.toFixed(2)}</strong>
              </p>
              {lastSale.payment === 'efectivo' && lastSale.change > 0 && (
                <div style={{ background: 'var(--success)', color: 'white', padding: '10px', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1.5rem', width: '100%' }}>
                  Vuelto a entregar: S/ {lastSale.change.toFixed(2)}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                <button onClick={() => printReceipt(lastSale)} style={{ padding: '12px', fontSize: '1rem', background: 'var(--text-main)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold' }}>
                  <span style={{ fontSize: '1.2rem' }}>🖨️</span> Imprimir Ticket
                </button>
                <button onClick={handleNuevaVenta} style={{ padding: '12px', fontSize: '1rem', background: 'var(--success)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold' }}>
                  <span style={{ fontSize: '1.2rem' }}>➕</span> Nueva Venta
                </button>
              </div>
            </div>
          ) : (
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', borderTop: '5px solid var(--primary)', padding: '0', overflow: 'hidden' }}>
              <div style={{ padding: '15px', borderBottom: '1px solid var(--border)', background: 'var(--bg-app)' }}>
                <h3 style={{ fontSize: '1.1rem', margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    Ticket de Venta <span style={{ fontSize: '0.8rem', background: 'white', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>{cart.length} ítems</span>
                  </span>
                  <button className="close-cart-btn" onClick={() => setIsCartOpen(false)}>✕</button>
                </h3>
              </div>
              
              <div className="cart-items" style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
                {cart.length === 0 ? (
                  <div style={{ height: '100%', minHeight: '150px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }}>
                    <span style={{ fontSize: '2.5rem', marginBottom: '5px', opacity: 0.5 }}>🛒</span><p style={{ fontSize: '0.9rem' }}>El carrito está vacío</p>
                  </div>
                ) : (
                  cart.map(p => (
                    <div key={p.id} className="cart-item-row fade-in">
                      <div className="cart-row-top">
                        <span className="cart-item-name" title={p.name}>{p.name}</span>
                        <div className="cart-row-top-right">
                          <div className="cart-stepper">
                            <button className="cart-stepper-btn" onClick={() => updateQty(p.id, p.qty - 1)} disabled={p.qty <= 1}>-</button>
                            <span className="cart-stepper-value">{p.qty}</span>
                            <button className="cart-stepper-btn" onClick={() => updateQty(p.id, p.qty + 1)}>+</button>
                          </div>
                          <span className="cart-item-subtotal">S/ {(p.price * p.qty).toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="cart-row-bottom">
                        <span className="cart-item-unit-price">S/ {Number(p.price).toFixed(2)} c/u</span>
                        <button className="btn-remove-text" onClick={() => removeFromCart(p.id)}>🗑️ Quitar</button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="cart-footer" style={{ padding: '15px', background: 'var(--card-bg)', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '15px' }}>
                  <span style={{ fontWeight: '800', color: 'var(--text-muted)', fontSize: '0.9rem' }}>TOTAL A COBRAR</span>
                  <span style={{ fontSize: '1.8rem', fontWeight: '900', color: 'var(--primary)', lineHeight: '1' }}>S/ {total.toFixed(2)}</span>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                  <button 
                    onClick={() => { setPayment('efectivo'); setAmountPaid(''); }} 
                    disabled={branchStatus.isReadOnly} 
                    className={`payment-method-btn ${payment === 'efectivo' ? 'active-efectivo' : ''}`}
                  >
                    💵 Efectivo
                  </button>
                  <button 
                    onClick={() => { setPayment('yape'); setAmountPaid(''); }} 
                    disabled={branchStatus.isReadOnly} 
                    className={`payment-method-btn ${payment === 'yape' ? 'active-yape' : ''}`}
                  >
                    📲 Yape/Plin
                  </button>
                  <button 
                    onClick={() => { setPayment('mixto'); setSplitEfectivo(''); setSplitYape(''); }} 
                    disabled={branchStatus.isReadOnly} 
                    className={`payment-method-btn ${payment === 'mixto' ? 'active-mixto' : ''}`}
                  >
                    🔄 Mixto
                  </button>
                </div>

                {payment === 'efectivo' && (
                  <div className="payment-row fade-in">
                    <div className="payment-input-group">
                      <label className="payment-label">MONTO RECIBIDO (S/)</label>
                      <input 
                        type="number" 
                        value={amountPaid} 
                        onChange={e => setAmountPaid(e.target.value)} 
                        placeholder="0.00" 
                        disabled={branchStatus.isReadOnly} 
                        style={{ fontWeight: 'bold', fontSize: '1.1rem', textAlign: 'left' }} 
                      />
                    </div>
                    {Number(amountPaid) >= total && total > 0 && (
                      <div className="vuelto-box fade-in">
                        <span className="vuelto-label">Vuelto</span>
                        <span className="vuelto-amount">S/ {(Number(amountPaid) - total).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}

                {payment === 'mixto' && (
                  <div className="payment-row fade-in">
                    <div className="payment-split-container">
                      <div className="payment-input-group efectivo-group" style={{ flex: 1 }}>
                        <label className="payment-label">EFECTIVO (S/)</label>
                        <input 
                          type="number" 
                          value={splitEfectivo} 
                          onChange={e => handleSplitEfectivoChange(e.target.value)} 
                          placeholder="0.00" 
                          disabled={branchStatus.isReadOnly} 
                        />
                      </div>
                      <div className="payment-input-group yape-group" style={{ flex: 1 }}>
                        <label className="payment-label">YAPE/PLIN (S/)</label>
                        <input 
                          type="number" 
                          value={splitYape} 
                          onChange={e => handleSplitYapeChange(e.target.value)} 
                          placeholder="0.00" 
                          disabled={branchStatus.isReadOnly} 
                        />
                      </div>
                    </div>
                    {(Number(splitEfectivo) + Number(splitYape)).toFixed(2) !== total.toFixed(2) && (splitEfectivo !== '' || splitYape !== '') && (
                      <div className="split-validation-error">
                        La suma debe ser exactamente S/ {total.toFixed(2)}
                      </div>
                    )}
                  </div>
                )}

                {!currentSession && !branchStatus.isReadOnly ? (
                  <button 
                    onClick={() => setShowOpenModal(true)} 
                    className="btn-open-register-large"
                  >
                    🔓 ABRIR CAJA PARA VENDER
                  </button>
                ) : currentSession?.needsForceClose ? (
                  <button 
                    className="btn-primary" 
                    onClick={() => setShowCloseModal(true)} 
                    style={{ width: '100%', padding: '15px', background: '#ef4444', color: 'white', borderRadius: '8px', fontWeight: '900', textTransform: 'uppercase', cursor: 'pointer', border: 'none' }}
                  >
                    🔒 CIERRA EL TURNO ANTERIOR
                  </button>
                ) : (
                  <button 
                    className="btn-primary" 
                    onClick={handleCheckoutClick} 
                    disabled={cart.length === 0 || !isPaymentValid || isProcessing || branchStatus.isReadOnly} 
                    style={{ width: '100%', padding: '15px', fontSize: '1.1rem', fontWeight: '900', textTransform: 'uppercase', borderRadius: '8px', cursor: (cart.length === 0 || !isPaymentValid || branchStatus.isReadOnly) ? 'not-allowed' : 'pointer', opacity: branchStatus.isReadOnly ? 0.5 : 1, border: 'none' }}
                  >
                    {branchStatus.isReadOnly ? '🔒 MODO LECTURA' : isProcessing ? 'Procesando...' : `COBRAR`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showQrModal && (
        <div className="fade-in" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10001, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '30px', borderTop: '8px solid #9333ea' }}>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '1.2rem', color: 'var(--text-main)' }}>Escanea para pagar</h3>
            
            <h1 style={{ color: '#9333ea', margin: '0 0 15px 0', fontSize: '2.5rem', fontWeight: '900' }}>
              S/ {payment === 'mixto' ? Number(splitYape).toFixed(2) : total.toFixed(2)}
            </h1>
            
            <div style={{ width: '220px', height: '220px', margin: '0 auto 20px auto', background: 'white', borderRadius: '15px', padding: '10px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {qrUrl ? <img src={qrUrl} alt="QR Yape" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '8px' }} /> : <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '10px' }}>⚠️ QR no configurado en Ajustes.</div>}
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>Verifica en tu celular que el abono se haya realizado.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowQrModal(false)} disabled={isProcessing} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '2px solid var(--border)', background: 'transparent', color: 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={processSale} disabled={isProcessing} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: 'var(--success)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>{isProcessing ? 'Procesando...' : '✅ Validar Pago'}</button>
            </div>
          </div>
        </div>
      )}

      <CashRegisterModals
        showOpenModal={showOpenModal}
        setShowOpenModal={setShowOpenModal}
        showCloseModal={showCloseModal}
        setShowCloseModal={setShowCloseModal}
        isLoadingSession={isLoadingSession}
        openRegister={openRegister}
        calculateClose={calculateClose}
        confirmClose={confirmClose}
      />

      {currentSession?.needsForceClose && !branchStatus.isReadOnly ? (
        <button 
          className="mobile-cart-float-btn warning" 
          onClick={() => setShowCloseModal(true)}
          style={{ background: '#ef4444' }}
        >
          <span>⚠️ Atención</span>
          <span>CERRAR TURNO ANTERIOR</span>
        </button>
      ) : !currentSession && !branchStatus.isReadOnly ? (
        <button 
          className="mobile-cart-float-btn warning" 
          onClick={() => setShowOpenModal(true)}
        >
          <span>💰 Caja Cerrada</span>
          <span>ABRIR TURNO</span>
        </button>
      ) : (
        cart.length > 0 && !branchStatus.isReadOnly && (
          <button className={`mobile-cart-float-btn ${isCartOpen ? 'hidden' : ''}`} onClick={() => setIsCartOpen(true)}>
            <span>🛒 Ver Carrito ({cart.length})</span>
            <span>S/ {total.toFixed(2)}</span>
          </button>
        )
      )}

    </div>
  );
}

export default POS;