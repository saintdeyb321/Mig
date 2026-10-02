// src/components/BranchGuard.jsx
import React, { useMemo } from 'react';
import { useCatalogData } from '../features/catalog/context/CatalogContext';
import { useTenantData } from '../features/branches/context/TenantContext';

export default function BranchGuard({ user, handleLogout, children }) {
  const { businessBranches, isLoading: isTenantLoading } = useTenantData();

  const { isLoading: isCatalogLoading } = useCatalogData();

  // Verificamos si el usuario es administrador
  const isAdmin = useMemo(() => {
    if (!user || !user.role) return false;
    return ['dueño', 'superadmin'].includes(String(user.role).toLowerCase());
  }, [user]);

  // Buscamos la sucursal del usuario
  const myBranch = useMemo(() => {
    if (!businessBranches || !user?.branchId) return null;
    return businessBranches.find(b => b.id === user.branchId);
  }, [businessBranches, user]);

  // Evaluamos si debemos bloquearlo
  const isBlocked = useMemo(() => {
    // Si es admin, NUNCA lo bloqueamos (necesita entrar a arreglar las cosas)
    if (isAdmin) return false;

    // Si encontramos su sucursal y está inactiva, lo bloqueamos
    if (myBranch && myBranch.status?.toLowerCase() === 'inactivo') {
      return true;
    }

    return false;
  }, [isAdmin, myBranch]);

  if (isTenantLoading || isCatalogLoading) {
    return null;
  }

  // 🚨 LA BARRERA DE SUCURSAL INACTIVA
  if (isBlocked) {
    return (
      <div className="maintenance-screen fade-in">
        <div className="maintenance-content">
          <div className="maintenance-media-container" style={{ fontSize: '5rem', marginBottom: '10px' }}>
            🔒
          </div>
          <h1 style={{ color: '#43278e', marginBottom: '15px' }}>
            Sucursal Inactiva
          </h1>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-main)', lineHeight: '1.5', marginBottom: '15px' }}>
            La sucursal <strong>{myBranch?.name}</strong> a la que estás asignado ha sido desactivada por el administrador.
          </p>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '30px' }}>
            No puedes registrar ventas ni acceder al sistema en este momento.
          </p>
          <button
            onClick={handleLogout}
            className="maintenance-btn"
            style={{ background: 'var(--danger, #dc2626)', boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)' }}
          >
            Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  // Si todo está bien, lo dejamos pasar al sistema
  return children;
}
