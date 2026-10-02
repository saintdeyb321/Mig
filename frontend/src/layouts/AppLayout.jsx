// src/layouts/AppLayout.jsx
import React, { useMemo, memo } from 'react';
import BottomNav from '../BottomNav';
import NetworkBadge from '../components/NetworkBadge';
import { NotificationBell } from '../components/NotificationBell';
import { useTenantData } from '../features/branches/context/TenantContext';
import { useAlerts } from '../features/notifications/hooks/useAlerts';
import '../styles/layout.css';

const AppLayout = memo(({ user, tab, setTab, handleLogout, children }) => {

  // Extraemos las sedes del contexto
  const { businessBranches } = useTenantData();
  const notifications = useAlerts(user);

  const fullName = useMemo(() => {
    if (!user) return 'Usuario del Sistema';
    return (user.firstName && user.lastName)
      ? `${user.firstName} ${user.lastName}`
      : 'Usuario del Sistema';
  }, [user]);

  // Calculamos el nombre de la sede asignada al cajero
  const assignedBranchName = useMemo(() => {
    if (user?.role !== 'cajero' || !user?.branchId) return null;
    const branch = businessBranches?.find(b => b.id === user.branchId);
    return branch ? branch.name : 'Sede Desconocida';
  }, [user, businessBranches]);

  return (
    <div className="app-layout">

      {/* ============================== */}
      {/* SIDEBAR (Solo Desktop)         */}
      {/* ============================== */}
      <aside className="app-sidebar">
        <div className="brand-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
            <h2
              className="brand-title"
              style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0, userSelect: 'none', fontSize: '1.4rem' }}
            >
              <span>🪐</span> MigaPOS
            </h2>
            <NotificationBell {...notifications} isDesktop={true} />
          </div>

          <div className="user-info-sidebar">
            <span className="user-icon">👤</span>
            <div className="user-details" style={{ minWidth: 0 }}>
              <p className="user-email" title={fullName}>
                {fullName}
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <span className="user-badge" style={{ margin: 0 }}>{user?.role}</span>
                <NetworkBadge />
              </div>

              {(user?.role === 'cajero' && assignedBranchName) && (
                <div className="assigned-branch-desktop ">
                  <span>📍</span> {assignedBranchName}
                </div>
              )}

            </div>
          </div>
        </div>


        <BottomNav current={tab} setCurrent={setTab} user={user} assignedBranchName={assignedBranchName} isDesktop={true} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '15px' }}>
          <button onClick={handleLogout} className="btn-logout-sidebar" style={{ width: '100%' }}>
            🚪 Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* ============================== */}
      {/* ÁREA DE CONTENIDO PRINCIPAL    */}
      {/* ============================== */}
      <div className="app-main-content">

        <header className="mobile-header">
          <h2 className="mobile-brand" style={{ display: 'flex', alignItems: 'center', gap: '8px', userSelect: 'none' }}>
            <span>🥧</span> MigaPOS
          </h2>

          <div className="mobile-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <NotificationBell {...notifications} isDesktop={false} />
            <NetworkBadge />
            <span className="user-badge mobile-badge">{user?.role}</span>
            <button onClick={handleLogout} className="mobile-logout-btn">
              🚪 <span>Salir</span>
            </button>
          </div>
        </header>

        <main className="content-area">
          {children}
        </main>
      </div>

      {/* ============================== */}
      {/* BOTTOM NAV (Solo Celular)      */}
      {/* ============================== */}

      <nav className="app-bottom-nav">
        <BottomNav current={tab} setCurrent={setTab} user={user} assignedBranchName={assignedBranchName} isDesktop={false} />
      </nav>

    </div>
  );
});

export default AppLayout;
