import React, { useMemo, memo } from 'react';

const UserRoleGate = memo(({ user, allowedRoles = [], children }) => {
  const hasAccess = useMemo(() => {
    if (!user) return false;
    const userRole = String(user.role || '').toLowerCase();
    if (userRole === 'superadmin') return true;
    const normalizedAllowedRoles = allowedRoles.map(role => role.toLowerCase());
    return normalizedAllowedRoles.includes(userRole);
  }, [user, allowedRoles]);

  if (!hasAccess) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '20px' }}>
        <div className="card fade-in" style={{ 
          maxWidth: '450px', 
          width: '100%',
          textAlign: 'center',
          borderTop: '5px solid var(--danger)',
          padding: '2.5rem 2rem',
          boxShadow: 'var(--shadow-md)'
        }}>
          <div style={{ 
            background: '#fee2e2', 
            width: '65px', 
            height: '65px', 
            borderRadius: '50%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            fontSize: '2rem',
            margin: '0 auto 20px auto'
          }}>
            🚫
          </div>
          <h3 style={{ color: 'var(--text-main)', marginBottom: '10px', fontSize: '1.4rem' }}>
            Acceso Restringido
          </h3>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', fontSize: '0.95rem', marginBottom: '20px' }}>
            Tu cuenta actual con el rol de <strong style={{ color: 'var(--danger)', textTransform: 'uppercase' }}>{user?.role}</strong> no tiene los permisos necesarios para visualizar esta sección.
          </p>
          <div style={{ 
            background: 'var(--bg-app)', 
            padding: '12px', 
            borderRadius: '8px',
            fontSize: '0.85rem', 
            color: 'var(--text-muted)',
            fontWeight: '600',
            border: '1px solid var(--border)'
          }}>
            Contacta al administrador si necesitas acceso.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ height: '100%' }}>
      {children}
    </div>
  );
});

export default UserRoleGate;