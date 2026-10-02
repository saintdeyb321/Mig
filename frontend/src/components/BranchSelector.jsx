// src/components/BranchSelector.jsx
import React from 'react';
import { useTenantData } from '../features/branches/context/TenantContext';

const BranchSelector = () => {
  const { businessBranches, activeBranchId, setActiveBranchId } = useTenantData();

  // Si no hay sucursales o solo hay una, ocultamos el selector para no estorbar
  if (!businessBranches || businessBranches.length <= 1) {
    return null;
  }

  const isGlobal = activeBranchId === 'global';
  const boxClass = isGlobal ? 'global' : 'branch';

  return (
    <div className="branch-selector-wrapper fade-in">
      <div className={`branch-selector-box ${boxClass}`} title="Gestión de Sucursales">
        <span className="branch-selector-icon">🏢</span>
        <span className="branch-selector-text">Sucursales</span>
        <span className="branch-selector-arrow">▼</span>

        <select
          className="branch-select-input"
          value={activeBranchId || ''}
          onChange={(e) => setActiveBranchId(e.target.value)}
          aria-label="Seleccionar sucursal"
        >
          <option value="global">🌍 Vista Global</option>


          {businessBranches.map(b => {
            const isInactive = b.status?.toLowerCase() === 'inactivo';
            return (
              <option key={b.id} value={b.id}>
                {isInactive ? '🔴' : '🏢'} {b.name} {isInactive ? '(Inactiva)' : ''}
              </option>
            );
          })}
        </select>
      </div>
    </div>
  );
};

export default BranchSelector;
