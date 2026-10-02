// src/components/NotificationBell.jsx
import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useGlobalData } from '../context/GlobalDataContext';

export const NotificationBell = ({ user, isDesktop = false }) => {
  const { businessBranches } = useGlobalData();
  const [alerts, setAlerts] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  const isAdmin = ['dueño', 'superadmin', 'admin'].includes(String(user?.role).toLowerCase());

  useEffect(() => {
    if (!user?.businessId || !isAdmin) return;

    const q = query(
      collection(db, 'alerts'),
      where('businessId', '==', user.businessId),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(
      q, 
      (snapshot) => {
        const newAlerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        newAlerts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setAlerts(newAlerts);
      },
      (error) => {
        if (error.code === 'permission-denied') {
          setAlerts([]);
        } else {
          console.error("Error en notificaciones:", error);
        }
      }
    );

    return () => unsubscribe();
  }, [user?.businessId, isAdmin]);

  const markAsRead = async (alertId) => {
    try {
      await updateDoc(doc(db, 'alerts', alertId), { read: true });
    } catch (error) {
      console.error("Error al marcar como leída:", error);
    }
  };

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
                  
                  // 🚀 NUEVO: Lógica de Severidad incluyendo Contratos Anulados
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
                          {new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                      
                      {/* 🚀 FIX: Botón de Marcar como Visto con diseño de botón real */}
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