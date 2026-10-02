// src/modules/QRPaymentCard.jsx
import React, { memo } from 'react';

const QRPaymentCard = memo(({ 
  qrImageBase64, 
  isProcessing, 
  handleImageChange, 
  onRemoveImage // 🚀 Nueva prop para limpiar la imagen desde el formulario
}) => {
  return (
    // Le quitamos la clase "card" para que encaje perfecto dentro del modal de la sucursal, pero mantenemos tu diseño.
    <div className="settings-card-yape" style={{ padding: '15px 0', marginTop: '15px' }}>
      <h3 className="settings-section-title">Pagos Digitales (Opcional)</h3>
      <p className="settings-section-desc">
        Sube la imagen del código QR de Yape/Plin para esta sede. El sistema la optimizará automáticamente.
      </p>

      <div className="qr-upload-zone">
        
        <div className="qr-preview-box">
          {qrImageBase64 ? (
            <img src={qrImageBase64} alt="Vista previa QR" className="qr-image fade-in" />
          ) : (
            <span className="qr-placeholder">📲</span>
          )}
        </div>

        <div className="qr-actions">
          <input 
            type="file" 
            id="qr-upload" 
            accept="image/*" 
            onChange={handleImageChange} 
            className="hidden-input" 
            disabled={isProcessing}
          />
          
          <div style={{ display: 'flex', gap: '10px', width: '100%', flexWrap: 'wrap' }}>
            <label 
              htmlFor="qr-upload" 
              className="qr-label-btn" 
              style={{ 
                flex: '1 1 200px', 
                textAlign: 'center', 
                margin: 0, 
                minHeight: '48px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                padding: '0 15px'
              }}
            >
              {qrImageBase64 ? '🔄 Cambiar imagen' : '📁 Seleccionar QR'}
            </label>

            {/* 🚀 Botón Eliminar: type="button" es vital para no enviar el formulario por accidente */}
            {qrImageBase64 && (
              <button 
                type="button" 
                onClick={onRemoveImage} 
                disabled={isProcessing}
                title="Eliminar QR permanentemente"
                style={{ 
                  flex: '1 1 200px', 
                  background: 'var(--danger)', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '8px', 
                  minHeight: '48px', 
                  cursor: isProcessing ? 'not-allowed' : 'pointer', 
                  fontSize: '1rem',
                  fontWeight: '600',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                🗑️ Eliminar Imagen
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default QRPaymentCard;