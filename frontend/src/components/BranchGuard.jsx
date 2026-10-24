import { Button, Card } from "../shared/ui";
// src/components/BranchGuard.jsx
import React, { useMemo } from 'react';
import { useCatalogData } from '../features/catalog/context/CatalogContext';
import { useTenantData } from '../features/branches/context/TenantContext';
export default function BranchGuard({
  user,
  handleLogout,
  children
}) {
  const {
    businessBranches,
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
    return <div className="flex min-h-dvh items-center justify-center bg-canvas p-4 animate-enter motion-reduce:animate-none">
        <Card className="grid w-full max-w-lg gap-4 p-6 text-center" as="div">
          <div className="flex justify-center text-4xl mb-2.5">
            🔒
          </div>
          <h1 className="text-accent mb-4">
            Sucursal Inactiva
          </h1>
          <p className="text-lg text-ink leading-relaxed mb-4">
            La sucursal <strong>{myBranch?.name}</strong> a la que estás asignado ha sido desactivada por el administrador.
          </p>
          <p className="text-base text-muted mb-7.5">
            No puedes registrar ventas ni acceder al sistema en este momento.
          </p>
          <Button onClick={handleLogout} className="shadow-card" type="button" variant="danger">
            Cerrar Sesión
          </Button>
        </Card>
      </div>;
  }

  // Si todo está bien, lo dejamos pasar al sistema
  return children;
}
