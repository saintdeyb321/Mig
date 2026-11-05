import { useAssistedAccess } from '../core/session/AssistedAccessContext';
import { getFirebaseErrorCode } from '../core/errors/firebaseErrors';
import { isBranchOperational } from '../features/branches/domain/branchPolicy';
import { Button, Card, LoadingState, ErrorState, FullscreenState } from "../shared/ui";
// src/components/BranchGuard.jsx
import React, { useMemo } from 'react';
import { useCatalogData } from '../features/catalog/context/CatalogContext';
import { useTenantData } from '../features/branches/context/TenantContext';
export default function BranchGuard({
  user,
  handleLogout,
  children
}) {
  const assisted = useAssistedAccess();
  const {
    businessBranches, branchesError, retryBranches,
    isLoading: isTenantLoading
  } = useTenantData();
  const {
    isLoading: isCatalogLoading
  } = useCatalogData();

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
    if (!isBranchOperational(myBranch)) {
      return true;
    }
    return false;
  }, [isAdmin, myBranch]);
  if (!assisted && (isTenantLoading || isCatalogLoading)) {
    return <LoadingState>Verificando sede y catálogo…</LoadingState>;
  }

  if (branchesError && !(assisted && ['unavailable', 'deadline-exceeded'].includes(getFirebaseErrorCode(branchesError)))) return <ErrorState title="No se pudo verificar la sede" error={branchesError} onRetry={retryBranches} />;

  // 🚨 LA BARRERA DE SUCURSAL INACTIVA
  if (isBlocked && (!assisted || myBranch)) {
    return <FullscreenState>
        <Card className="grid w-full max-w-lg gap-4 p-6 text-center" as="div">
          <div className="flex justify-center text-4xl mb-2.5">
            🔒
          </div>
          <h1 className="text-accent mb-4">
            Sucursal Inactiva
          </h1>
          <p className="text-lg text-ink leading-relaxed mb-4">
            La sucursal <strong>{myBranch?.name}</strong> a la que estás asignado no está disponible para operar. Revisa con el administrador su estado y los permisos.
          </p>
          <p className="text-base text-muted mb-7.5">
            No puedes registrar ventas ni acceder al sistema en este momento.
          </p>
          <Button onClick={handleLogout} className="shadow-card" type="button" variant="danger">
            Cerrar Sesión
          </Button>
        </Card>
      </FullscreenState>;
  }

  // Si todo está bien, lo dejamos pasar al sistema
  return children;
}
