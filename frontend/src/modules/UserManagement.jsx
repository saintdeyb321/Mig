import FirestoreQueryError from '../components/FirestoreQueryError';
import { Building2, Clock3, Globe2, LockKeyhole, Mail, Pencil, ShieldCheck, UnlockKeyhole, UserPlus, UserRound, UsersRound, X } from 'lucide-react';
import { useConfirmDialog } from '../shared/ui/useConfirmDialog';
import { Alert, LoadingState, Dialog, cn, Button, PageHeader, Input, FormField, Select, Badge, Card, SearchField, DialogFooter, EmptyState } from "../shared/ui";
import { memo, useId } from 'react';
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
  const hasGlobalAccess = isDueño || isSuperAdmin;
  const branchName = hasGlobalAccess ? 'Acceso global' : branches.find(b => b.id === u.branchId)?.name || (isInvite ? 'Esperando registro' : 'Sin sede asignada');
  const roleLabel = isDueño ? 'Dueño' : isSuperAdmin ? 'SuperAdmin' : u.role === 'cajero' ? 'Cajero' : u.role;
  const ProfileIcon = isInvite ? Mail : hasGlobalAccess ? ShieldCheck : UserRound;
  const BranchIcon = hasGlobalAccess ? Globe2 : Building2;
  return <Card as="article" className={cn('flex min-w-0 flex-col gap-3 border-l-4 bg-linear-to-br from-panel via-panel p-3.5 hover:shadow-md focus-within:border-primary/40 motion-safe:transition-shadow sm:p-4',
    isInvite ? 'border-l-warning/60 to-warning-soft/45' : isInactive ? 'border-l-control/45 to-subtle' : 'border-l-primary/55 to-primary-soft/35')}>
    <header className="flex min-w-0 items-start gap-3">
      <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl border', isInvite ? 'border-warning/20 bg-warning-soft text-warning' : 'border-primary/15 bg-primary-soft text-primary')}>
        <ProfileIcon aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-extrabold text-brand-deep wrap-anywhere">{u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : isInvite ? 'Invitación pendiente' : 'Usuario'}</h3>
        <p className="text-xs text-muted wrap-anywhere" title={u.email}>{u.email}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {roleLabel && <Badge variant={hasGlobalAccess ? 'primary' : 'accent'}>{roleLabel}</Badge>}
          <Badge variant={isInvite ? 'warning' : isInactive ? 'neutral' : 'success'}>{isInvite ? 'Invitación pendiente' : isInactive ? 'Bloqueado' : 'Activo'}</Badge>
        </div>
      </div>
    </header>
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2 rounded-xl border border-stellar/15 bg-stellar-soft/40 px-3 py-2.5">
      <div className="min-w-0">
        <dt className="flex items-center gap-1.5 text-xs font-semibold text-stellar"><BranchIcon aria-hidden="true" className="size-3.5 shrink-0" />Sede y acceso</dt>
        <dd className="mt-0.5 text-sm font-medium wrap-anywhere">{branchName}</dd>
      </div>
      {!isInvite && u.role === 'cajero' && u.shiftStart && u.shiftEnd && <div className="min-w-0">
        <dt className="flex items-center gap-1.5 text-xs font-semibold text-stellar"><Clock3 aria-hidden="true" className="size-3.5" />Turno</dt>
        <dd className="mt-0.5 text-sm font-medium tabular-nums">{u.shiftStart} – {u.shiftEnd}</dd>
      </div>}
    </dl>
    <footer className="mt-auto flex flex-wrap items-center justify-end gap-2 border-t border-line/75 pt-2.5">
      {isInvite ? <Button onClick={() => cancelInvite(u.id)} disabled={isLoading} size="sm" variant="secondary" className="border-danger/35 text-danger hover:border-danger hover:bg-danger-soft">
        <X aria-hidden="true" />Cancelar invitación
      </Button> : <>
        <Button onClick={() => openEditForm(u)} disabled={isLoading || isInactive} size="sm" variant="secondary"><Pencil aria-hidden="true" />Editar</Button>
        {u.email !== user.email && !isSuperAdmin && <Button onClick={() => toggleStatus(u.id, u.status || 'activo')} disabled={isLoading} size="sm" variant={isInactive ? 'success' : 'secondary'} className={isInactive ? undefined : 'border-danger/35 text-danger hover:border-danger hover:bg-danger-soft'}>
          {isInactive ? <UnlockKeyhole aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}{isInactive ? 'Habilitar' : 'Deshabilitar'}
        </Button>}
      </>}
    </footer>
  </Card>;
});

// Componente Principal
function UserManagement({
  user
}) {
  const emailId = useId();
  const {
    confirm,
    confirmation
  } = useConfirmDialog();
  const {
    isLoading, isGlobalLoading, error, isStale, retry, canManage,
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
  return <div className="workspace-page max-w-6xl animate-enter motion-reduce:animate-none">
      {confirmation}

      <PageHeader title="Personal" icon={UsersRound} eyebrow="Tu equipo" description="Administra los accesos, las sedes y los turnos del equipo." className="to-primary-soft/75" actions={<><Button onClick={openAddForm} className="w-full sm:w-auto" disabled={!canManage || isLoading} type="button" variant="primary">
          <UserPlus aria-hidden="true" /> Nuevo empleado
        </Button></>} />

      <FirestoreQueryError error={error} area="personnel" user={user} onRetry={retry} />
      {isStale && sortedUsers.length > 0 && <Alert variant="warning">Datos de esta sesión pendientes de confirmar. La edición está bloqueada hasta verificar los permisos.</Alert>}
      <div className="view-toolbar border-primary/15 bg-linear-to-r from-panel to-primary-soft/40">
        <SearchField type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar por nombre o correo..." onClear={() => setSearchTerm('')} className="basis-full sm:basis-56" />

        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-primary/15 bg-panel px-3 text-sm font-medium text-ink focus-within:border-primary">
          <Input type="checkbox" className="shrink-0" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Mostrar bloqueados
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-brand-deep">Equipo y accesos</h2>
        <Badge variant="primary" className="tabular-nums">{sortedUsers.length === 1 ? '1 registro visible' : `${sortedUsers.length} registros visibles`}</Badge>
      </div>

      <div className={cn('grid gap-3', sortedUsers.length > 0 && 'xl:grid-cols-2')}>
        {isGlobalLoading && !error && sortedUsers.length === 0 ? <LoadingState>Verificando Personal…</LoadingState> : sortedUsers.length === 0 && error ? null : sortedUsers.length === 0 ? <EmptyState title="Sin registros" description={<>{searchTerm ? `No se encontraron resultados para "${searchTerm}"` : 'No hay otros usuarios registrados.'}</>} /> : sortedUsers.map(u => <UserCard key={u.id} u={u} user={user} branches={branches} isLoading={isLoading || !canManage} openEditForm={openEditForm} toggleStatus={toggleStatus} cancelInvite={cancelInvite} />)}
      </div>

      {/* MODAL FORMULARIO */}
      {showFormModal && <Dialog title={editing ? 'Editar Perfil' : 'Nuevo Miembro'} icon={editing ? Pencil : UserPlus} busy={isLoading} className="max-w-lg" onClose={() => setShowFormModal(false)}>

            {!editing && <Alert>
                Se enviará una invitación. El empleado debe iniciar sesión con Google usando este correo.
              </Alert>}

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
                <label htmlFor={emailId} className="text-sm font-semibold text-brand-deep">Cuenta de Gmail del empleado</label>
                <div className="flex items-stretch">
                  <Input id={emailId} type="text" value={emailPrefix} onChange={e => setEmailPrefix(e.target.value)} placeholder="ej: juan.perez" required disabled={isLoading || editing} className={cn('min-w-0 flex-1 rounded-r-none border-r-0', editing ? 'bg-subtle' : 'bg-panel')} />
                  <div className="flex shrink-0 items-center rounded-r-xl border border-line bg-subtle px-2.5 text-sm font-semibold text-muted">
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

                {role === 'cajero' && <FormField className="min-w-0 animate-enter motion-reduce:animate-none" label="Asignar a sede">

                    <Select value={branchId} onChange={e => setBranchId(e.target.value)} required disabled={isLoading}>
                      <option value="">-- Seleccionar Sede --</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </FormField>}
              </div>

              {role === 'cajero' && <div className="space-y-2.5 rounded-xl border border-stellar/15 bg-stellar-soft/55 p-3.5">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-stellar"><Clock3 aria-hidden="true" className="size-4" />Horario de turno</h3>
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
