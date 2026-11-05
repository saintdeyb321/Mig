import { Card } from "../shared/ui";
import React, { useMemo, memo } from 'react';
const UserRoleGate = memo(({
  user,
  allowedRoles = [],
  children
}) => {
  const hasAccess = useMemo(() => {
    if (!user) return false;
    const userRole = String(user.role || '').toLowerCase();
    if (userRole === 'superadmin') return true;
    const normalizedAllowedRoles = allowedRoles.map(role => role.toLowerCase());
    return normalizedAllowedRoles.includes(userRole);
  }, [user, allowedRoles]);
  if (!hasAccess) {
    return <div className="flex justify-center items-center h-full p-5">
        <Card className="animate-enter motion-reduce:animate-none max-w-lg w-full text-center border-t-4 border-t-danger p-[2.5rem_2rem]" as="div">
          <div className="bg-danger-soft w-[65px] h-[65px] rounded-full flex items-center justify-center text-3xl m-[0_auto_20px_auto]">
            🚫
          </div>
          <h3 className="text-ink mb-2.5 text-xl">
            Acceso Restringido
          </h3>
          <p className="text-muted text-base mb-5">
            Tu cuenta actual con el rol de <strong className="text-danger uppercase">{user?.role}</strong> no tiene los permisos necesarios para visualizar esta sección.
          </p>
          <div className="bg-subtle p-3 rounded-xl text-sm text-muted font-semibold border border-line">
            Contacta al administrador si necesitas acceso.
          </div>
        </Card>
      </div>;
  }
  return <div className="animate-enter motion-reduce:animate-none h-full">
      {children}
    </div>;
});
export default UserRoleGate;
