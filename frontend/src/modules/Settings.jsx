// src/modules/Settings.jsx
import React, { useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import BranchManager from './BranchManager'; 

function Settings({ user }) {
  const { 
    companyData, handleCompanyDataChange, saveCompanyData, isSavingData 
  } = useSettings(user);

  const [showBranches, setShowBranches] = useState(false);
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  
  const hasCompanyData = Boolean(companyData?.ruc || companyData?.razonSocial);

  const handleSaveCompany = async () => {
    await saveCompanyData();
    setIsEditingCompany(false); 
  };

  return (
    <div className="fade-in max-container padding-bottom-lg" style={{ maxWidth: '900px' }}>
      
      {/* HEADER SIMÉTRICO NATIVO */}
      <header className="module-header">
        <h2 className="module-title">
          <span className="module-title-icon">⚙️</span>
          <span className="module-title-text">Configuración Global</span>
        </h2>
      </header>

      {/* =========================================
          🚀 1. GESTIÓN DE SEDES
      ========================================= */}
      <section style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)' }}>🏢 Sucursales</h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Administra tus locales físicos y sus métodos de pago.</p>
          </div>
          
          <button 
            type="button" 
            onClick={() => setShowBranches(!showBranches)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              padding: '6px 14px', 
              borderRadius: '8px', 
              border: '1px solid var(--border)', 
              background: showBranches ? 'var(--bg-app)' : 'var(--bg-card)', 
              cursor: 'pointer', 
              fontSize: '0.9rem',
              fontWeight: '600',
              color: 'var(--text-main)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: showBranches ? 'inset 0 2px 4px rgba(0,0,0,0.05)' : '0 2px 4px rgba(0,0,0,0.05)'
            }}
          >
            <span>{showBranches ? 'Ocultar Sucursales' : 'Mostrar Sucursales'}</span>
            <span style={{ 
              display: 'inline-block', 
              fontSize: '0.8rem',
              transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
              transform: showBranches ? 'rotate(-180deg)' : 'rotate(0deg)' 
            }}>
              ▼
            </span>
          </button>
        </div>

        {showBranches && (
          <div 
            className="card fade-in" 
            style={{ 
              padding: '16px',
              animation: 'fadeInDown 0.3s ease-out'
            }}
          >
            <BranchManager user={user} isEmbedded={true} />
          </div>
        )}
      </section>

      {/* =========================================
          🚀 2. DATOS FISCALES
      ========================================= */}
      <section style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)' }}>🧾 Datos para Boletas / Facturas</h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Información para los tickets y facturas.</p>
          </div>
          {hasCompanyData && !isEditingCompany && (
            <button 
              onClick={() => setIsEditingCompany(true)}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: '#f5be87', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600' }}
            >
              ✏️ Editar
            </button>
          )}
        </div>

        {(!hasCompanyData || isEditingCompany) ? (
          <div className="card fade-in">
            <div className="smart-form">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">RAZÓN SOCIAL</label>
                  <input type="text" name="razonSocial" value={companyData.razonSocial} onChange={handleCompanyDataChange} placeholder="Mi Empresa S.A.C." />
                </div>
                <div className="form-group">
                  <label className="form-label">RUC</label>
                  <input type="text" name="ruc" value={companyData.ruc} onChange={handleCompanyDataChange} placeholder="Ej. 20123456789" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">DIRECCIÓN FISCAL</label>
                  <input type="text" name="direccion" value={companyData.direccion} onChange={handleCompanyDataChange} placeholder="Av. Principal 123" />
                </div>
                <div className="form-group">
                  <label className="form-label">TELÉFONO GENERAL</label>
                  <input type="text" name="telefono" value={companyData.telefono} onChange={handleCompanyDataChange} placeholder="987 654 321" />
                </div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                {hasCompanyData && (
                  <button type="button" className="btn-cancel" onClick={() => setIsEditingCompany(false)} disabled={isSavingData}>
                    Cancelar
                  </button>
                )}
                <button className="btn-primary" onClick={handleSaveCompany} disabled={isSavingData} style={{ padding: '8px 20px' }}>
                  {isSavingData ? 'Guardando...' : 'Guardar Datos'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="card fade-in" style={{ borderLeft: '4px solid var(--primary)', padding: '20px' }}>
            <div className="smart-form">
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">RAZÓN SOCIAL</label>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{companyData.razonSocial || '-'}</div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">RUC</label>
                  <div style={{ fontSize: '1rem', color: 'var(--text-main)' }}>{companyData.ruc || '-'}</div>
                </div>
              </div>
              <div className="form-row" style={{ marginTop: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">DIRECCIÓN FISCAL</label>
                  <div style={{ fontSize: '1rem', color: 'var(--text-main)' }}>{companyData.direccion || '-'}</div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">TELÉFONO GENERAL</label>
                  <div style={{ fontSize: '1rem', color: 'var(--text-main)' }}>{companyData.telefono || '-'}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}

export default Settings;