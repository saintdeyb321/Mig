import React, { useState } from 'react';
import toast from 'react-hot-toast';

export const CashRegisterModals = ({
  showOpenModal, setShowOpenModal,
  showCloseModal, setShowCloseModal,
  isLoadingSession, openRegister, calculateClose, confirmClose
}) => {
  const [openingAmount, setOpeningAmount] = useState('');
  const [declaredAmount, setDeclaredAmount] = useState('');
  const [tempSummary, setTempSummary] = useState(null);
  const [closeNotes, setCloseNotes] = useState('');

  const MODAL_TOAST_ID = 'cash-modal-error'; // 🚀 Candado Anti-spam

  const handleOpen = async (e) => {
    e.preventDefault();
    const amount = Number(openingAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error("Ingresa un monto válido", { id: MODAL_TOAST_ID });
      return;
    }
    const success = await openRegister(amount);
    if (success) {
      setShowOpenModal(false);
      setOpeningAmount('');
    }
  };

  const handleCalculate = async (e) => {
    e.preventDefault();
    const amount = Number(declaredAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error("Ingresa un monto válido", { id: MODAL_TOAST_ID });
      return;
    }
    const result = await calculateClose(amount);
    if (result && typeof result === 'object') {
      setTempSummary(result);
      setShowCloseModal(false); 
    }
  };

  const handleFinalSave = async (e) => {
    e.preventDefault(); // 🚀 FIX: Prevenimos recarga de página al ser un formulario
    if (!tempSummary) return;
    
    if (tempSummary.difference !== 0 && closeNotes.trim().length < 5) {
      toast.error("Por favor, explica brevemente qué pasó con el dinero.", { id: MODAL_TOAST_ID });
      return;
    }
    
    const success = await confirmClose(tempSummary, closeNotes);
    
    if (success) {
      setTempSummary(null);
      setDeclaredAmount('');
      setCloseNotes('');
      setShowCloseModal(false); 
    }
  };

  return (
    <>
      {/* MODAL 1: APERTURA DE CAJA */}
      {showOpenModal && !tempSummary && (
        // 🚀 FIX: Bajamos el zIndex de 10001 a 999 para que los Toasts (9999) queden por encima
        <div className="fade-in" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '30px', borderTop: '8px solid var(--primary)' }}>
            <span style={{ fontSize: '3rem', display: 'block', marginBottom: '10px' }}>🔐</span>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '1.4rem', color: 'var(--text-main)' }}>Apertura de Caja</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>
              Ingresa el efectivo inicial (sencillo) para activar el punto de venta.
            </p>
            <form onSubmit={handleOpen}>
              <div style={{ marginBottom: '20px', textAlign: 'left' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--text-main)' }}>MONTO INICIAL (S/)</label>
                <input 
                  type="number" 
                  step="0.10"
                  required
                  value={openingAmount}
                  onChange={(e) => setOpeningAmount(e.target.value)}
                  style={{ width: '100%', padding: '12px', fontSize: '1.5rem', textAlign: 'center', borderRadius: '8px', border: '2px solid var(--border)', fontWeight: 'bold' }}
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setShowOpenModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '2px solid var(--border)', background: 'transparent', color: 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={isLoadingSession} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer' }}>
                  {isLoadingSession ? '...' : 'Abrir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CIERRE DE CAJA */}
      {showCloseModal && !tempSummary && (
        <div className="fade-in" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'left', padding: '30px', borderTop: '8px solid #ef4444' }}>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '1.4rem', color: 'var(--text-main)' }}>🔒 ¿Cuánto dinero tienes en la caja?</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>
              Para cerrar tu turno, cuenta toda la plata que tienes físicamente (billetes y monedas) y escribe el total abajo.
            </p>
            <form onSubmit={handleCalculate}>
              <div style={{ marginBottom: '25px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--text-main)' }}>TODA LA PLATA QUE CONTASTE (S/)</label>
                <input 
                  type="number" 
                  step="0.10"
                  required
                  value={declaredAmount}
                  onChange={(e) => setDeclaredAmount(e.target.value)}
                  style={{ width: '100%', padding: '15px', fontSize: '2rem', textAlign: 'center', borderRadius: '8px', border: '2px solid var(--border)', fontWeight: 'bold', color: 'var(--primary)' }}
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setShowCloseModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '2px solid var(--border)', background: 'transparent', color: 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer' }}>
                  Aún no cerrar
                </button>
                <button type="submit" style={{ flex: 1, padding: '12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' }}>
                  Siguiente ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RESUMEN FINAL Y JUSTIFICACIÓN */}
      {tempSummary && (
        <div className="fade-in" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', overflowY: 'auto' }}>
          <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '30px', borderTop: '8px solid var(--text-main)', margin: 'auto' }}>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '1.4rem', color: 'var(--text-main)' }}>Confirmar Cierre</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>Revisa el estado de tu caja antes de guardar.</p>
            
            <div style={{ background: 'var(--bg-app)', padding: '20px', borderRadius: '12px', textAlign: 'left', marginBottom: '20px', border: '1px solid var(--border)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.95rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Ventas + Fondo Inicial:</span> 
                <strong>S/ {tempSummary.expectedAmount.toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', fontSize: '1.1rem' }}>
                <span style={{ color: 'var(--text-main)', fontWeight: '800' }}>Dinero que dejaste:</span> 
                <strong style={{ color: 'var(--primary)' }}>S/ {tempSummary.declaredAmount.toFixed(2)}</strong>
              </div>
              <hr style={{ border: 'none', borderTop: '2px dashed var(--border)', margin: '15px 0' }}/>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '800', letterSpacing: '0.5px' }}>RESULTADO DEL CUADRE:</span>
                <div style={{ fontSize: '1.2rem', fontWeight: '900', color: tempSummary.difference < 0 ? '#dc2626' : (tempSummary.difference > 0 ? '#d97706' : '#16a34a'), display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {tempSummary.difference === 0 && <><span style={{fontSize:'1.4rem'}}>✅</span> ¡Cuadre Perfecto!</>}
                  {tempSummary.difference > 0 && <><span style={{fontSize:'1.4rem'}}>⚠️</span> Sobran S/ {tempSummary.difference.toFixed(2)}</>}
                  {tempSummary.difference < 0 && <><span style={{fontSize:'1.4rem'}}>❌</span> Faltan S/ {Math.abs(tempSummary.difference).toFixed(2)}</>}
                </div>
              </div>
            </div>

            {/* 🚀 FIX: Todo el bloque de botones y notas ahora es un Formulario nativo */}
            <form onSubmit={handleFinalSave}>
              {tempSummary.difference !== 0 && (
                <div className="fade-in" style={{ marginBottom: '20px', textAlign: 'left', background: '#fffbeb', border: '1px solid #fcd34d', padding: '15px', borderRadius: '8px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', color: '#b45309', marginBottom: '8px' }}>
                    ⚠️ ¿QUÉ PASÓ? JUSTIFICA EL ERROR:
                  </label>
                  <textarea 
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    placeholder="Explica por qué faltó o sobró dinero..."
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #f59e0b', resize: 'vertical', minHeight: '65px' }}
                    required // 👈 ¡Ahora sí funcionará el tooltip del navegador!
                  />
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  type="button" // Evita que este botón envíe el formulario
                  onClick={() => setTempSummary(null)} 
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '2px solid var(--border)', background: 'transparent', color: 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Volver a contar
                </button>
                <button 
                  type="submit" // 🚀 FIX: Este botón activa la validación nativa HTML5
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}
                >
                  Cerrar Turno
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
    </>
  );
};