// src/components/NotificationBell.jsx
import React, { useState } from 'react';
import { useTenantData } from '../features/branches/context/TenantContext';
import { toDateSafe } from '../core/dates/dateValues';

export const NotificationBell = ({ alerts, isAdmin, markAsRead, isDesktop = false }) => {
  const { businessBranches } = useTenantData();
  const [isOpen, setIsOpen] = useState(false);

  if (!isAdmin) return null;

  return (
    <div className="bell-wrapper">
      {/* Botón de la Campana */}
      <button
        className="bell-button"
        onClick={() => setIsOpen(!isOpen)}
        title="Notificaciones de Sistema"
      >
        🔔
        {alerts.length > 0 && (
          <span className="bell-badge fade-in">
            {alerts.length}
          </span>
        )}
      </button>

      {/* Menú Desplegable */}
      {isOpen && (
        <>
          {/* Fondo oscuro para cerrar al hacer clic afuera en móvil */}
          {!isDesktop && (
             <div className="bell-overlay" onClick={() => setIsOpen(false)} />
          )}

          <div className={`bell-dropdown fade-in ${isDesktop ? 'desktop' : 'mobile'}`}>
            <div className="bell-header">
              <h4>Alertas de Seguridad</h4>
            </div>

            <div className="bell-list-container">
              {alerts.length === 0 ? (
                <p className="bell-empty">✅ Todo en orden.</p>
              ) : (
                alerts.map(alert => {
                  const branchName = businessBranches?.find(b => b.id === alert.branchId)?.name || 'Sucursal';
                  const isAnulacion = alert.type === 'VOIDED_SALE' || alert.type === 'VOIDED_CONTRACT';
                  const isFaltante = alert.difference < 0;
                  const isDanger = isFaltante || isAnulacion;
                  const severityClass = isDanger ? 'danger' : 'warning';

                  let displayName = alert.cashierName || alert.currentCashier || alert.cashier || "Cajero";
                  if (displayName.includes('@')) displayName = displayName.split('@')[0];

                  return (
                    <div key={alert.id} className={`alert-item ${severityClass}`}>

                      <div className="alert-item-header">
                        <span className={`alert-title ${severityClass}`}>
                          {alert.type === 'VOIDED_CONTRACT' ? '⚠️ CONTRATO ANULADO' : alert.title}
                        </span>
                        <span className="alert-time">
                          {toDateSafe(alert.createdAt)?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <p className="alert-text"><strong>Sede:</strong> {branchName}</p>
                      <p className="alert-text"><strong>Usuario:</strong> <span>{displayName}</span></p>

                      {/* RENDERIZADO CONDICIONAL SEGÚN TIPO DE ALERTA */}
                      {alert.type === 'SHIFT_CHANGE_MISMATCH' ? (
                        <p className="alert-text">Dejó: S/ {alert.expectedFromPrevious?.toFixed(2)} | Abrió: S/ {alert.actualOpened?.toFixed(2)}</p>
                      ) : (alert.type === 'VOIDED_SALE' || alert.type === 'VOIDED_CONTRACT') ? (
                        <p className="alert-note">"{alert.notes}"</p>
                      ) : alert.type === 'FORGOTTEN_REGISTER' ? (
                        <p className="alert-note">"{alert.notes}"</p>
                      ) : (
                        <>
                          <p className="alert-text">Sistema: S/ {alert.expected?.toFixed(2)} | Contó: S/ {alert.declared?.toFixed(2)}</p>
                          <p className="alert-note">"{alert.notes}"</p>
                        </>
                      )}

                      {/* Diferencia Matemática (Oculta en anulaciones y olvidos) */}
                      {(alert.type !== 'VOIDED_SALE' && alert.type !== 'VOIDED_CONTRACT' && alert.type !== 'FORGOTTEN_REGISTER') && (
                        <p className={`alert-amount ${severityClass}`}>
                          {isFaltante ? '❌ FALTAN' : '⚠️ SOBRAN'} S/ {Math.abs(alert.difference || 0).toFixed(2)}
                        </p>
                      )}


                      <button
                        onClick={() => markAsRead(alert.id)}
                        style={{
                          marginTop: '10px',
                          width: '100%',
                          padding: '8px',
                          background: isDanger ? '#fee2e2' : '#fef3c7',
                          color: isDanger ? '#b91c1c' : '#b45309',
                          border: `1px solid ${isDanger ? '#f87171' : '#fcd34d'}`,
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.background = isDanger ? '#fecaca' : '#fde68a';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = isDanger ? '#fee2e2' : '#fef3c7';
                        }}
                      >
                        ✓ Entendido y Descartar
                      </button>

                    </div>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
