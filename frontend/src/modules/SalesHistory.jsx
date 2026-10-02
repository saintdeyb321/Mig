// src/modules/SalesHistory.jsx
import React, { useState } from 'react';
import { useSalesHistory } from '../features/sales/hooks/useSalesHistory';
import toast from 'react-hot-toast';

function SalesHistory({ user }) {
  const { sales, error, isLoading, formatDate, anularVentaConfirmada, isProcessing, businessBranches } = useSalesHistory(user);
  const [saleToCancel, setSaleToCancel] = useState(null);
  const [voidReason, setVoidReason] = useState('');

  if (isLoading) {
    return (
      <div className="module-loader fade-in">
        <div className="spinner"></div>
        <p className="loader-text">Cargando historial de ventas...</p>
      </div>
    );
  }

  return (
    <div className="fade-in max-container">

      <header className="module-header">
        <h2 className="module-title">
          <span className="module-title-icon">📜</span>
          <span className="module-title-text">Historial de Ventas</span>
        </h2>
        <span className="toggle-label" style={{ cursor: 'default', pointerEvents: 'none' }}>
          Últimos 50 tickets
        </span>
      </header>

      {error && <p role="alert">No se pudo cargar el historial. Revisa la conexión y los permisos.</p>}
      {sales.length === 0 ? (
        <div className="card fade-in empty-state">
          <span className="empty-icon-lg">🏷️</span>
          <p className="empty-text">Aún no hay ventas registradas.</p>
        </div>
      ) : (
        <div className="history-grid">
          {sales.map(s => {
            const isAnulada = s.voided === true;
            const branchName = businessBranches?.find(b => b.id === s.branchId)?.name || 'Sede Local';
            const tipoPago = String(s.payment || 'efectivo').toLowerCase();
            const isEfectivo = tipoPago === 'efectivo';
            const isYape = tipoPago === 'yape' || tipoPago === 'plin';
            const isMixto = tipoPago === 'mixto';

            // Definimos el color del borde de la cabecera
            let borderClass = '';
            if (isAnulada) borderClass = 'border-anulada';
            else if (isEfectivo) borderClass = 'border-efectivo';
            else if (isYape) borderClass = 'border-yape';
            else if (isMixto) borderClass = 'border-mixto';

            return (
              <div key={s.id} className={`card history-card fade-in ${isAnulada ? 'card-anulada' : ''}`}>

                {/* CABECERA DE LA TARJETA MEJORADA */}
                <div className={`ticket-header ${borderClass}`}>
                  <div className="ticket-info">
                    <div className="ticket-date-row">
                      <span className="ticket-date">{formatDate(s.createdAt || s.date)}</span>
                      {s.isOffline && !isAnulada && (
                        <span className="badge-offline">OFFLINE</span>
                      )}
                    </div>
                    <span className="ticket-id">ID: {s.id.substring(0, 8).toUpperCase()} • 🏢 {branchName}</span>
                  </div>

                  <div className="ticket-amount">
                    <span className="ticket-total">S/ {Number(s.total).toFixed(2)}</span>
                    {isAnulada ? (
                       <div className="badge-payment badge-anulada">❌ ANULADA</div>
                    ) : (
                      <div className={`badge-payment ${isEfectivo ? 'badge-efectivo' : isYape ? 'badge-yape' : isMixto ? 'badge-mixto' : ''}`}>
                        {isEfectivo ? '💵 EFECTIVO' : isYape ? '📲 YAPE' : isMixto ? '🔄 MIXTO' : s.payment}
                      </div>
                    )}
                  </div>
                </div>

                {/* DETALLE COMPRA */}
                <div className="ticket-body">
                  <p className="ticket-section-title">Detalle del Ticket</p>

                  <div className="ticket-items-list">
                    {s.items && s.items.map((i, index) => (
                      <div key={i.id || index} className="ticket-item-row">
                        <div className="ticket-item-left">
                          <div className="item-qty-box">{i.qty}x</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span className="item-name-text">{i.name}</span>
                            {i.category && (
                              <span className="history-item-category">
                                {i.category}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="item-subtotal">
                          S/ {(i.price * i.qty).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {!isAnulada && (
                    <>
                      {/* Resumen de Vuelto (Para Efectivo puro) */}
                      {isEfectivo && s.amountPaid && s.change > 0 && (
                        <div className="ticket-change-row">
                          <span>Recibido: <strong>S/ {Number(s.amountPaid).toFixed(2)}</strong></span>
                          <span>Vuelto: <span className="change-highlight">S/ {Number(s.change).toFixed(2)}</span></span>
                        </div>
                      )}


                      {isMixto && s.splitPayments && (
                        <div className="ticket-split-row fade-in">
                          <div className="split-efectivo-box">
                            <span>💵 Ef:</span>
                            <span>S/ {Number(s.splitPayments.efectivo).toFixed(2)}</span>
                          </div>
                          <div className="split-yape-box">
                            <span>📲 Yp:</span>
                            <span>S/ {Number(s.splitPayments.yape).toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* FOOTER */}
                <div className="ticket-footer">
                  <div className="ticket-cashier">
                    <span>👤</span>
                    <span className="cashier-name">
                      {s.cashierName?.includes('@') ? 'Cajero de Turno' : s.cashierName}
                    </span>
                  </div>


                  {!isAnulada && !s.isOffline && (user?.role === 'dueño' || user?.role === 'superadmin' || user?.role === 'cajero') && (
                    <button
                      className="btn-danger-solid"
                      onClick={() => setSaleToCancel(s)}
                      disabled={isProcessing}
                    >
                      {isProcessing ? '...' : 'Anular Ticket'}
                    </button>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}


      {saleToCancel && (
        <div className="modal-overlay fade-in" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="card modal-danger" style={{ maxWidth: '400px', width: '100%', textAlign: 'left', padding: '30px', borderTop: '8px solid #ef4444' }}>
            <h3 className="modal-title-danger" style={{ margin: '0 0 5px 0', fontSize: '1.4rem' }}><span>⚠️</span> ¿Anular esta venta?</h3>
            <p className="modal-desc" style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>
              Estás a punto de anular una venta de <strong>S/ {Number(saleToCancel.total).toFixed(2)}</strong>. El dinero se restará de la caja y se devolverá el stock.
            </p>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (voidReason.trim().length < 5) {
                toast.error("Por favor, explica detalladamente el motivo.");
                return;
              }
              anularVentaConfirmada(saleToCancel, voidReason);
              setSaleToCancel(null);
              setVoidReason('');
            }}>

              <div style={{ marginBottom: '25px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '0.85rem', color: '#b45309' }}>
                  MOTIVO DE LA ANULACIÓN (Obligatorio):
                </label>
                <textarea
                  required
                  minLength="5"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Ej: El cliente se arrepintió, error de cobro, etc."
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '2px solid #f59e0b', minHeight: '80px', resize: 'vertical', fontFamily: 'inherit' }}
                  autoFocus
                />
              </div>

              <div className="modal-actions" style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn-cancel" onClick={() => { setSaleToCancel(null); setVoidReason(''); }} disabled={isProcessing} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '2px solid var(--border)', background: 'transparent', color: 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" className="btn-danger" disabled={isProcessing} style={{ flex: 1, padding: '12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                  {isProcessing ? 'Anulando...' : 'Sí, anular venta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default SalesHistory;
