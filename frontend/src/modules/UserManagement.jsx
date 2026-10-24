import { UsersRound } from 'lucide-react';
import { useConfirmDialog } from '../shared/ui/useConfirmDialog';
import { Dialog, cn, Button, PageHeader, Input, FormField, Select, Badge, Card, SearchField, DialogFooter, EmptyState } from "../shared/ui";
import React, { memo } from 'react';
import { useUserManagement } from '../features/users/hooks/useUserManagement';
const UserCard = memo(({
  u,
  user,
  branches,
  isLoading,
  openEditForm,
  toggleStatus,
  cancelInvite
}) => {
  const isInactive = u.status === 'inactivo';
  const isDueño = u.role === 'dueño';
  const isSuperAdmin = u.role === 'superadmin';
  const isInvite = u.isInvite;
  const branchName = isDueño || isSuperAdmin ? '🌐 Acceso Global' : branches.find(b => b.id === u.branchId)?.name || (isInvite ? '⏳ Esperando registro...' : '⚠️ Sin sede asignada');
  return <Card className={cn(`flex min-w-0 flex-wrap items-center justify-between gap-4       p-4 sm:p-4 animate-enter motion-reduce:animate-none ${isInactive ? "opacity-65" : ''} `, isInvite ? "border-l-warning" : "")} as="div">

      <div className="flex min-w-0 flex-[1_1_15rem] items-center gap-3">
        <div className={cn(`flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl ${isDueño || isSuperAdmin ? "bg-warning-soft" : "bg-subtle"} `, isInvite ? "bg-warning-soft border-warning-soft" : "")}>
          {isInvite ? '✉️' : isDueño || isSuperAdmin ? '👑' : '👨‍🍳'}
        </div>

        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(`break-words font-semibold ${isInactive ? "line-through text-muted" : "text-ink"} `)}>
              {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : isInvite ? 'Invitación Pendiente' : 'Usuario'}
            </span>
            <Badge className={cn(` ${isDueño || isSuperAdmin ? "bg-warning-soft text-warning" : "bg-primary-soft text-primary"} `, isInvite ? "bg-warning-soft text-warning" : "")}>
              {isInvite ? 'Invitación' : u.role}
            </Badge>
          </div>

          <span className="break-all text-xs text-muted" title={u.email}>
            {u.email}
          </span>

          <div className={cn("flex flex-wrap items-center gap-1 text-xs text-primary mt-1", isDueño || isSuperAdmin ? "text-primary" : "text-muted", isDueño || isSuperAdmin ? "font-semibold" : "font-normal")}>
            <span className="text-sm">{isDueño || isSuperAdmin ? '🌍' : '🏢'}</span>
            <span className="font-medium text-inherit">{branchName}</span>
          </div>

          {!isInvite && u.role === 'cajero' && u.shiftStart && u.shiftEnd && <div className="flex flex-wrap items-center gap-1 text-xs text-primary">
              <span className="text-sm">🕒</span>
              <span className="font-medium text-muted">Turno: {u.shiftStart} - {u.shiftEnd}</span>
            </div>}
        </div>
      </div>

      <div className="flex w-full flex-wrap items-center gap-2 border-t border-line pt-3 sm:w-auto sm:border-0 sm:pt-0">
        {isInvite ? <Button onClick={() => cancelInvite(u.id)} disabled={isLoading} className="flex-1 sm:flex-none bg-danger-soft text-danger border border-danger-soft" type="button" variant="secondary">
            <span>❌</span> Cancelar invitación
          </Button> : <>
            <Button onClick={() => openEditForm(u)} disabled={isLoading || isInactive} className="flex-1 sm:flex-none" type="button" variant="secondary">
              <span>✏️</span> Editar
            </Button>

            {u.email !== user.email && !isSuperAdmin && <Button onClick={() => toggleStatus(u.id, u.status || 'activo')} disabled={isLoading} className="flex-1 sm:flex-none" type="button" variant={isInactive ? "success" : "danger"}>
                <span>{isInactive ? '🔓' : '🔒'}</span> {isInactive ? 'Habilitar' : 'Deshabilitar'}
              </Button>}
          </>}
      </div>

    </Card>;
});

// Componente Principal
function UserManagement({
  user
}) {
  const {
    confirm,
    confirmation
  } = useConfirmDialog();
  const {
    isLoading,
    searchTerm,
    setSearchTerm,
    showFormModal,
    setShowFormModal,
    showInactive,
    setShowInactive,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    emailPrefix,
    setEmailPrefix,
    role,
    setRole,
    shiftStart,
    setShiftStart,
    shiftEnd,
    setShiftEnd,
    editing,
    filteredUsers,
    branchId,
    setBranchId,
    branches,
    openAddForm,
    openEditForm,
    handleSave,
    toggleStatus,
    cancelInvite
  } = useUserManagement(user, {
    confirm
  });
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const roleRank = {
      'dueño': 1,
      'superadmin': 2,
      'invite': 3,
      'cajero': 4
    };
    const rankA = a.isInvite ? roleRank['invite'] : roleRank[a.role] || 5;
    const rankB = b.isInvite ? roleRank['invite'] : roleRank[b.role] || 5;

    // Si tienen diferente rol, se ordenan por rango
    if (rankA !== rankB) return rankA - rankB;

    // Si tienen el mismo rol, se ordenan alfabéticamente
    const nameA = (a.firstName || '').toLowerCase();
    const nameB = (b.firstName || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
  return <div className="animate-enter motion-reduce:animate-none mx-auto min-w-0 space-y-5 pb-6 w-full max-w-6xl">
      {confirmation}

      <PageHeader title="Personal" icon={UsersRound} eyebrow="Tu equipo" description="Administra los accesos y las sedes asignadas." actions={<><Button onClick={openAddForm} className="shrink-0" type="button" variant="primary">
          ➕ Nuevo Empleado
        </Button></>} />

      <div className="flex flex-wrap items-center gap-3">
        <SearchField type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar por nombre o correo..." onClear={() => setSearchTerm('')} className="basis-full sm:basis-56" />

        <label className="min-h-11 rounded-xl border border-line bg-panel px-3 font-medium cursor-pointer flex items-center gap-2 text-sm text-muted">
          <Input type="checkbox" className="shrink-0" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Mostrar bloqueados
        </label>
      </div>

      <h3 className="text-xs font-bold uppercase tracking-wide text-muted">
        Personal ({sortedUsers.length})
      </h3>

      <div className="grid gap-3">
        {sortedUsers.length === 0 ? <EmptyState title="Sin registros" description={<>{searchTerm ? `No se encontraron resultados para "${searchTerm}"` : 'No hay otros usuarios registrados.'}</>} /> : sortedUsers.map(u => <UserCard key={u.id} u={u} user={user} branches={branches} isLoading={isLoading} openEditForm={openEditForm} toggleStatus={toggleStatus} cancelInvite={cancelInvite} />)}
      </div>

      {/* MODAL FORMULARIO */}
      {showFormModal && <Dialog title={<>
              {editing ? '✏️ Editar Perfil' : '➕ Nuevo Miembro'}
            </>} busy={isLoading} className="max-w-lg" onClose={() => setShowFormModal(false)}>

            {!editing && <p className="text-sm text-muted mb-5">
                Se enviará una invitación. El empleado debe iniciar sesión con Google usando este correo.
              </p>}

            <form onSubmit={handleSave} className="grid gap-4">
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <FormField label={<>NOMBRES</>}>

                  <Input autoFocus value={firstName} onChange={e => setFirstName(e.target.value)} required disabled={isLoading} />
                </FormField>
                <FormField label={<>APELLIDOS</>}>

                  <Input value={lastName} onChange={e => setLastName(e.target.value)} required disabled={isLoading} />
                </FormField>
              </div>

              <div className="grid min-w-0 gap-1.5">
                <label className="text-sm font-medium text-muted">CUENTA DE GMAIL DEL EMPLEADO</label>
                <div className="flex items-stretch">
                  <Input type="text" value={emailPrefix} onChange={e => setEmailPrefix(e.target.value)} placeholder="ej: juan.perez" required disabled={isLoading || editing} aria-label="ej: juan.perez" className={cn("min-w-0 flex-1 rounded-tr-none rounded-br-none border-r-0", editing ? "bg-subtle" : "bg-panel")} />
                  <div className="bg-subtle text-muted py-0 px-4 flex items-center font-semibold rounded-tr-lg rounded-br-lg border border-line">
                    @gmail.com
                  </div>
                </div>
              </div>

              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <FormField label={<>NIVEL DE ACCESO</>}>

                  <Select value={role} onChange={e => setRole(e.target.value)} disabled={isLoading}>
                    <option value="cajero">Cajero (Local)</option>
                    <option value="dueño">Administrador (Global)</option>
                  </Select>
                </FormField>

                {role === 'cajero' && <FormField className="grid min-w-0 gap-1.5 animate-enter motion-reduce:animate-none" label={<>🏢 ASIGNAR A SEDE</>}>

                    <Select value={branchId} onChange={e => setBranchId(e.target.value)} required disabled={isLoading} className="border-2 border-primary">
                      <option value="">-- Seleccionar Sede --</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </FormField>}
              </div>

              {role === 'cajero' && <div className="bg-subtle p-4 rounded-xl border border-dashed border-line">
                  <label className="text-sm font-medium text-ink mb-2.5">⏰ HORARIO DE TURNO</label>
                  <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    <FormField label={<>ENTRADA</>}>

                      <Input type="time" value={shiftStart} onChange={e => setShiftStart(e.target.value)} required disabled={isLoading} className="font-bold text-primary" />
                    </FormField>
                    <FormField label={<>SALIDA</>}>

                      <Input type="time" value={shiftEnd} onChange={e => setShiftEnd(e.target.value)} required disabled={isLoading} className="font-bold text-primary" />
                    </FormField>
                  </div>
                </div>}

              <DialogFooter>
                <Button type="button" onClick={() => setShowFormModal(false)} disabled={isLoading} variant="secondary">Cancelar</Button>
                <Button type="submit" className="flex-1" disabled={isLoading} variant="primary">{isLoading ? 'Guardando...' : editing ? 'Guardar Cambios' : 'Enviar Invitación'}</Button>
              </DialogFooter>
            </form>
          </Dialog>}

    </div>;
}
export default UserManagement;
