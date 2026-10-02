import React, { memo } from 'react';
import { useUserManagement } from '../features/users/hooks/useUserManagement';
const UserCard = memo(({ u, user, branches, isLoading, openEditForm, toggleStatus, cancelInvite }) => {
  const isInactive = u.status === 'inactivo';
  const isDueño = u.role === 'dueño';
  const isSuperAdmin = u.role === 'superadmin';
  const isInvite = u.isInvite;

  const branchName = (isDueño || isSuperAdmin)
    ? '🌐 Acceso Global'
    : (branches.find(b => b.id === u.branchId)?.name || (isInvite ? '⏳ Esperando registro...' : '⚠️ Sin sede asignada'));

  return (
    <div className={`user-card fade-in ${isInactive ? 'inactive' : ''}`} style={isInvite ? { borderLeftColor: '#f59e0b' } : {}}>

      <div className="user-card-content">
        <div className={`user-avatar ${isDueño || isSuperAdmin ? 'avatar-admin' : 'avatar-staff'}`} style={isInvite ? { background: '#fef3c7', borderColor: '#fde68a' } : {}}>
          {isInvite ? '✉️' : (isDueño || isSuperAdmin ? '👑' : '👨‍🍳')}
        </div>

        <div className="user-info">
          <div className="user-name-row">
            <span className={`user-name ${isInactive ? 'text-strikethrough text-muted' : 'text-main'}`}>
              {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : (isInvite ? 'Invitación Pendiente' : 'Usuario')}
            </span>
            <span className={`user-badge ${isDueño || isSuperAdmin ? 'badge-admin' : 'badge-staff'}`} style={isInvite ? { background: '#fef3c7', color: '#92400e' } : {}}>
              {isInvite ? 'Invitación' : u.role}
            </span>
          </div>

          <span className="employee-card-email" title={u.email}>
            {u.email}
          </span>

          <div className="user-shift" style={{ marginTop: '5px', color: (isDueño || isSuperAdmin) ? 'var(--primary)' : 'var(--text-muted)', fontWeight: (isDueño || isSuperAdmin) ? '600' : 'normal' }}>
            <span className="shift-icon">{(isDueño || isSuperAdmin) ? '🌍' : '🏢'}</span>
            <span className="shift-text" style={{ color: 'inherit' }}>{branchName}</span>
          </div>

          {!isInvite && u.role === 'cajero' && u.shiftStart && u.shiftEnd && (
            <div className="user-shift">
              <span className="shift-icon">🕒</span>
              <span className="shift-text" style={{ color: 'var(--text-muted)' }}>Turno: {u.shiftStart} - {u.shiftEnd}</span>
            </div>
          )}
        </div>
      </div>

      <div className="user-actions">
        {isInvite ? (
          <button
            onClick={() => cancelInvite(u.id)}
            disabled={isLoading}
            className="btn-user-action"
            style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}
          >
            <span>❌</span> Cancelar invitación
          </button>
        ) : (
          <>
            <button
              onClick={() => openEditForm(u)}
              disabled={isLoading || isInactive}
              className="btn-user-action btn-edit-user"
            >
              <span>✏️</span> Editar
            </button>

            {u.email !== user.email && !isSuperAdmin && (
              <button
                onClick={() => toggleStatus(u.id, u.status || 'activo')}
                disabled={isLoading}
                className={`btn-user-action ${isInactive ? 'btn-toggle-on' : 'btn-toggle-off'}`}
              >
                <span>{isInactive ? '🔓' : '🔒'}</span> {isInactive ? 'Habilitar' : 'Deshabilitar'}
              </button>
            )}
          </>
        )}
      </div>

    </div>
  );
});

// Componente Principal
function UserManagement({ user }) {
  const {
    isLoading, searchTerm, setSearchTerm, showFormModal, setShowFormModal, showInactive, setShowInactive,
    firstName, setFirstName, lastName, setLastName, emailPrefix, setEmailPrefix, role, setRole,
    shiftStart, setShiftStart, shiftEnd, setShiftEnd, editing, filteredUsers,
    branchId, setBranchId, branches,
    openAddForm, openEditForm, handleSave, toggleStatus, cancelInvite
  } = useUserManagement(user);
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const roleRank = { 'dueño': 1, 'superadmin': 2, 'invite': 3, 'cajero': 4 };
    const rankA = a.isInvite ? roleRank['invite'] : (roleRank[a.role] || 5);
    const rankB = b.isInvite ? roleRank['invite'] : (roleRank[b.role] || 5);

    // Si tienen diferente rol, se ordenan por rango
    if (rankA !== rankB) return rankA - rankB;

    // Si tienen el mismo rol, se ordenan alfabéticamente
    const nameA = (a.firstName || '').toLowerCase();
    const nameB = (b.firstName || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return (
    <div className="fade-in max-container padding-bottom-lg" style={{ maxWidth: '900px' }}>

      <header className="module-header">
        <h2 className="module-title">
          <span className="module-title-icon">👥</span>
          <span className="module-title-text">Personal</span>
        </h2>
        <button onClick={openAddForm} className="btn-primary btn-add-smart">
          ➕ Nuevo Empleado
        </button>
      </header>

      <div className="filter-bar-container">
        <div className="search-container">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre o correo..."
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="btn-clear-search">✖</button>
          )}
        </div>

        <label className="toggle-label" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          <input
            type="checkbox"
            className="toggle-checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Mostrar bloqueados
        </label>
      </div>

      <h3 className="inventory-title">
        Personal ({sortedUsers.length})
      </h3>

      <div className="user-list-container">
        {sortedUsers.length === 0 ? (
          <div className="card fade-in empty-state-dashed">
            <span className="empty-icon-lg">👤</span>
            <p className="empty-text-muted">{searchTerm ? `No se encontraron resultados para "${searchTerm}"` : 'No hay otros usuarios registrados.'}</p>
          </div>
        ) : (
          sortedUsers.map(u => (
            <UserCard
              key={u.id}
              u={u}
              user={user}
              branches={branches}
              isLoading={isLoading}
              openEditForm={openEditForm}
              toggleStatus={toggleStatus}
              cancelInvite={cancelInvite}
            />
          ))
        )}
      </div>

      {/* MODAL FORMULARIO */}
      {showFormModal && (
        <div className="modal-overlay fade-in">
          <div className="card modal-content" style={{ maxWidth: '500px' }}>
            <h3 className="modal-header-title">
              {editing ? '✏️ Editar Perfil' : '➕ Nuevo Miembro'}
            </h3>

            {!editing && (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Se enviará una invitación. El empleado debe iniciar sesión con Google usando este correo.
              </p>
            )}

            <form onSubmit={handleSave} className="smart-form">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">NOMBRES</label>
                  <input autoFocus value={firstName} onChange={e => setFirstName(e.target.value)} required disabled={isLoading} />
                </div>
                <div className="form-group">
                  <label className="form-label">APELLIDOS</label>
                  <input value={lastName} onChange={e => setLastName(e.target.value)} required disabled={isLoading} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">CUENTA DE GMAIL DEL EMPLEADO</label>
                <div style={{ display: 'flex', alignItems: 'stretch' }}>
                  <input type="text" value={emailPrefix} onChange={e => setEmailPrefix(e.target.value)} placeholder="ej: juan.perez" required disabled={isLoading || editing} style={{ background: editing ? 'var(--bg-app)' : 'white', flex: 1, borderTopRightRadius: '0', borderBottomRightRadius: '0', borderRight: 'none' }} />
                  <div style={{ background: 'var(--bg-app)', color: 'var(--text-muted)', padding: '0 15px', display: 'flex', alignItems: 'center', fontWeight: '600', borderTopRightRadius: '8px', borderBottomRightRadius: '8px', border: '1px solid var(--border)' }}>
                    @gmail.com
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">NIVEL DE ACCESO</label>
                  <select value={role} onChange={e => setRole(e.target.value)} disabled={isLoading}>
                    <option value="cajero">Cajero (Local)</option>
                    <option value="dueño">Administrador (Global)</option>
                  </select>
                </div>

                {role === 'cajero' && (
                  <div className="form-group fade-in">
                    <label className="form-label" style={{ color: 'var(--primary)' }}>🏢 ASIGNAR A SEDE</label>
                    <select
                      value={branchId}
                      onChange={e => setBranchId(e.target.value)}
                      required
                      disabled={isLoading}
                      style={{ border: '2px solid var(--primary)' }}
                    >
                      <option value="">-- Seleccionar Sede --</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {role === 'cajero' && (
                <div style={{ background: 'var(--bg-app)', padding: '15px', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                  <label className="form-label" style={{ color: 'var(--text-main)', marginBottom: '10px' }}>⏰ HORARIO DE TURNO</label>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">ENTRADA</label>
                      <input type="time" value={shiftStart} onChange={e => setShiftStart(e.target.value)} required disabled={isLoading} className="input-highlight" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">SALIDA</label>
                      <input type="time" value={shiftEnd} onChange={e => setShiftEnd(e.target.value)} required disabled={isLoading} className="input-highlight" />
                    </div>
                  </div>
                </div>
              )}

              <div className="modal-actions-footer">
                <button type="button" onClick={() => setShowFormModal(false)} disabled={isLoading} className="btn-cancel">Cancelar</button>
                <button type="submit" className="btn-primary flex-1" disabled={isLoading}>{isLoading ? 'Guardando...' : (editing ? 'Guardar Cambios' : 'Enviar Invitación')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default UserManagement;
