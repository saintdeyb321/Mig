// src/App.jsx
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import './index.css';
import toast, { Toaster } from 'react-hot-toast';

import { useAuthManager } from './hooks/useAuthManager';
import { SessionProviders } from './app/providers/SessionProviders';
import { useShiftMonitor } from './hooks/useShiftMonitor';
import { useMaintenance } from './hooks/useMaintenance';

// Utils
import { retryOfflineSales } from './utils/offlineRetry';

// Componentes y Layout
import UserRoleGate from './components/UserRoleGate';
import AppLayout from './layouts/AppLayout';
import LicenseGuard from './components/LicenseGuard';
import ReloadPrompt from './components/ReloadPrompt';
import MaintenanceScreen from './components/MaintenanceScreen';
import BranchGuard from './components/BranchGuard';
import TermsModal from './components/TermsModal';

import Auth from './modules/Auth';

const POS = React.lazy(() => import('./modules/POS'));
const SalesHistory = React.lazy(() => import('./modules/SalesHistory'));
const ExportSales = React.lazy(() => import('./modules/ExportSales'));
const ProductCatalog = React.lazy(() => import('./modules/ProductCatalog'));
const CategoryManager = React.lazy(() => import('./modules/CategoryManager'));
const Reports = React.lazy(() => import('./modules/Reports'));
const UserManagement = React.lazy(() => import('./modules/UserManagement'));
const Settings = React.lazy(() => import('./modules/Settings'));
const SuperAdmin = React.lazy(() => import('./modules/SuperAdmin'));
const ContractManager = React.lazy(() => import('./modules/contracts/ContractManager'));
const AgendaManager = React.lazy(() => import('./modules/AgendaManager'));

const ADMIN_ROLES = ['dueño', 'superadmin'];
const ALL_ROLES = ['dueño', 'cajero', 'superadmin']; // Para módulos que el cajero sí ve
const NO_OP_FUNCTION = () => {};

function App() {
  const [tab, setTab] = useState('pos');
  const { user, authLoading, handleLogout } = useAuthManager();

  const { isMaintenance, maintenanceMsg } = useMaintenance();

  useShiftMonitor(user);

  useEffect(() => {
    if (user?.uid) {
      retryOfflineSales(user).catch(error => console.warn('Error sincronizando cola:', error));
    }

    const handleOnline = async () => {
      if (user?.uid) {
        const syncToast = toast.loading('Conexión recuperada. Sincronizando datos locales...', {
          style: { background: '#fffbeb', color: '#b45309', border: '1px solid #fcd34d' },
          icon: '🔄'
        });

        try {
          const result = await retryOfflineSales(user);
          if (result.pending || result.failed) toast.error('Hay ventas pendientes o fallidas. Revisa el historial.', { id: syncToast });
          else toast.success('Sincronización completada.', { id: syncToast });
        } catch (error) { toast.error(error.message || 'Sincronización pendiente.', { id: syncToast }); }
      }
    };

    window.addEventListener('online', handleOnline);
    const retryTimer = setInterval(() => {
      if (user?.uid && navigator.onLine) retryOfflineSales(user).catch(error => console.warn('Error reintentando cola:', error));
    }, 15000);
    return () => { window.removeEventListener('online', handleOnline); clearInterval(retryTimer); };
  }, [user]);

  const isAdmin = useMemo(() => {
    if (!user || !user.role) return false;
    return ADMIN_ROLES.includes(String(user.role).toLowerCase());
  }, [user]);

  if (isMaintenance) {
    return <MaintenanceScreen message={maintenanceMsg} />;
  }

  if (authLoading) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
        <h2 className="loader-text">Iniciando MigaPOS...</h2>
      </div>
    );
  }

  return (
    <>
      <ReloadPrompt user={user}/>

      {!user ? (
        <>
          <Toaster position="top-center" />
          <Auth onLogin={NO_OP_FUNCTION} />
        </>
      ) : user.hasAcceptedTerms !== true ? (
        <>
          <Toaster position="top-center" />
          <TermsModal
            user={user}
            onAccepted={() => window.location.reload()}
          />
        </>
      ) : (
        <SessionProviders user={user}>
          <LicenseGuard user={user} handleLogout={handleLogout}>
            <BranchGuard user={user} handleLogout={handleLogout}>

              <Toaster
                position="top-right"
                reverseOrder={false}
                toastOptions={{
                  style: { borderRadius: '10px', background: 'var(--text-main)', color: '#fff', padding: '16px' },
                }}
              />

              <AppLayout user={user} tab={tab} setTab={setTab} handleLogout={handleLogout}>
                <Suspense
                  fallback={
                    <div className="module-loader fade-in">
                      <div className="spinner"></div>
                      <p className="loader-text">Abriendo módulo...</p>
                    </div>
                  }
                >
                  {/* === RUTAS DE LA APLICACIÓN === */}
                  {tab === 'pos' && <POS user={user} />}


                  {tab === 'contracts' && (
                    <UserRoleGate user={user} allowedRoles={ALL_ROLES}>
                      <ContractManager user={user} />
                    </UserRoleGate>
                  )}

                  {tab === 'superadmin' && (
                    <UserRoleGate user={user} allowedRoles={['superadmin']}>
                      <SuperAdmin user={user} />
                    </UserRoleGate>
                  )}
                  {tab === 'history' && (
                    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {isAdmin && <ExportSales user={user} />}
                      <SalesHistory user={user} />
                    </div>
                  )}
                  {tab === 'products' && (
                    <UserRoleGate user={user} allowedRoles={ADMIN_ROLES}>
                      <ProductCatalog user={user} />
                    </UserRoleGate>
                  )}
                  {tab === 'categories' && (
                    <UserRoleGate user={user} allowedRoles={ADMIN_ROLES}>
                      <CategoryManager user={user} />
                    </UserRoleGate>
                  )}
                  {tab === 'reports' && (
                    <UserRoleGate user={user} allowedRoles={ADMIN_ROLES}>
                      <Reports user={user} />
                    </UserRoleGate>
                  )}
                  {tab === 'users' && (
                    <UserRoleGate user={user} allowedRoles={ADMIN_ROLES}>
                      <UserManagement user={user} />
                    </UserRoleGate>
                  )}

                  {tab === 'agenda' && (
                    <UserRoleGate user={user} allowedRoles={ADMIN_ROLES}>
                      <AgendaManager user={user} />
                    </UserRoleGate>
                  )}
                  {tab === 'settings' && (
                    <UserRoleGate user={user} allowedRoles={ADMIN_ROLES}>
                      <Settings user={user} />
                    </UserRoleGate>
                  )}
                </Suspense>
              </AppLayout>

            </BranchGuard>
          </LicenseGuard>
        </SessionProviders>
      )}
    </>
  );
}

export default App;
