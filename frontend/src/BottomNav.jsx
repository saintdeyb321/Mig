// src/components/BottomNav.jsx
import React, { useMemo, memo } from 'react';
import BranchSelector from '../src/components/BranchSelector'; // Verifica tu ruta

// 🚀 OPTIMIZACIÓN 1: Sacamos el menú estático afuera. 
// 🚀 NUEVO: Agregamos 'contracts' con icono de tortita/agenda
const MENU_ITEMS = [
  { id: 'pos', label: 'Venta Rápida', icon: '🛒', roles: ['dueño', 'cajero', 'superadmin'] },
  { id: 'contracts', label: 'Contratos', icon: '🎂', roles: ['dueño', 'cajero', 'superadmin'] }, 
  { id: 'history', label: 'Historial', icon: '📜', roles: ['dueño', 'cajero', 'superadmin'] },
  // 🚀 NUEVO BOTÓN
  { id: 'agenda', label: 'Agenda VIP', icon: '📖', roles: ['dueño', 'superadmin'] },
  { id: 'products', label: 'Productos', icon: '📦', roles: ['dueño', 'superadmin'] },
  { id: 'categories', label: 'Categorías', icon: '📂', roles: ['dueño', 'superadmin'] },
  { id: 'reports', label: 'Reportes', icon: '📊', roles: ['dueño', 'superadmin'] },
  { id: 'users', label: 'Personal', icon: '👥', roles: ['dueño', 'superadmin'] },
  { id: 'settings', label: 'Ajustes', icon: '⚙️', roles: ['dueño', 'superadmin'] },
  { id: 'superadmin', label: 'SaaS Admin', icon: '🚀', roles: ['superadmin'] },
];

const BottomNav = memo(({ current, setCurrent, user, assignedBranchName, isDesktop }) => {
  const role = String(user?.role || '').toLowerCase();

  // Filtramos rápido usando memoización
  const visibleItems = useMemo(() => {
    return MENU_ITEMS.filter(item => item.roles.includes(role));
  }, [role]);

  return (
    <nav className={isDesktop ? "sidebar-nav" : "app-bottom-nav"}>
      
      {(role === 'dueño' || role === 'superadmin') && <BranchSelector />}
      
      {visibleItems.map((item) => (
        <button
          key={item.id}
          onClick={() => setCurrent(item.id)}
          className={`nav-item ${current === item.id ? 'active' : ''}`}
          title={item.label}
        >
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </button>
      ))}

      {/* ======================================================== */}
      {/* 🚀 FIX CELULAR: Nombre de la sede (Llamando solo a la clase CSS) */}
      {/* ======================================================== */}
      {(!isDesktop && role === 'cajero' && assignedBranchName) && (
        <div className="assigned-branch-mobile">
          <span>📍</span> {assignedBranchName}
        </div>
      )}

    </nav>
  );
});

export default BottomNav;