import { ClientCard } from "./admin/ClientCard.jsx";
import { Dialog, Button, LoadingState, PageHeader, Input, FormField, Select, Card, SearchField, DialogFooter, EmptyState } from "../shared/ui";
import { brand } from '../config/brand';
// src/modules/SuperAdmin.jsx
import { useState } from 'react';
import { useSuperAdmin } from '../hooks/useSuperAdmin';
import BackupPanel from '../features/backups/components/BackupPanel.jsx';
import { runtimeCapabilities } from '../config/runtimeCapabilities.js';
// Componente Principal
function SuperAdmin({
  user
}) {
  const {
    isLoading,
    isProcessing,
    handleCreateClient,
    handleExtendLicense,
    handleToggleStatus,
    searchTerm,
    setSearchTerm,
    filteredLicenses,
    licenses,
    error,
    hasMore,
    loadMore,
    refresh
  } = useSuperAdmin(user);
  const [backupBusinessId, setBackupBusinessId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [extendModalInfo, setExtendModalInfo] = useState(null);
  const [businessName, setBusinessName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [months, setMonths] = useState(1);
  const [extendMonths, setExtendMonths] = useState(1);
  if (user?.role !== 'superadmin') {
    return <div className="animate-enter motion-reduce:animate-none mx-auto w-full min-w-0 max-w-7xl space-y-5 pb-6 text-center pt-12.5">
        <h2 className="text-ink text-2xl mb-2.5">⛔ Acceso Denegado</h2>
        <p className="text-muted">Esta área es exclusiva para el CEO de {brand.name}.</p>
      </div>;
  }
  if (!runtimeCapabilities.tenantAdministration) return <section className="animate-enter motion-reduce:animate-none mx-auto w-full min-w-0 max-w-7xl space-y-5 pb-6" aria-label="Administración de plataforma">
      <h2>Clientes SaaS · Firebase Spark</h2>
      <p>Contexto de plataforma: SuperAdmin.</p>
      <Card role="status" as="div">
        <p>Authentication, Firestore, Hosting y persistencia local disponibles.</p>
        <p>Consulta y creación de negocios no disponibles en SPARK-0. Se habilitarán en SPARK-1.</p>
        <p>Backups cloud, purgas y automatizaciones aún no disponibles. Cloud Functions y Firebase Storage deshabilitados.</p>
      </Card>
      <Button disabled title="Pendiente de SPARK-1" type="button" variant="primary">Nuevo negocio · pendiente de SPARK-1</Button>
    </section>;
  const submitCreate = async e => {
    e.preventDefault();
    const success = await handleCreateClient(businessName, ownerEmail, firstName, lastName, months);
    if (success) {
      setBusinessName('');
      setOwnerEmail('');
      setFirstName('');
      setLastName('');
      setMonths(1);
      setShowAddModal(false);
    }
  };
  const submitExtend = async e => {
    e.preventDefault();
    const success = await handleExtendLicense(extendModalInfo, extendMonths);
    if (success) {
      setExtendMonths(1);
      setExtendModalInfo(null);
    }
  };
  const isActuallyLoading = isLoading || licenses && licenses.length === 0 && isLoading !== false;
  if (isActuallyLoading && !showAddModal && !extendModalInfo) {
    return <LoadingState>Cargando Clientes de {brand.name}...</LoadingState>;
  }
  return <div className="animate-enter motion-reduce:animate-none mx-auto min-w-0 space-y-5 pb-6 w-full max-w-6xl" aria-label="Administración de plataforma">

      <PageHeader className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex min-w-0 items-center gap-3 text-xl font-bold tracking-tight sm:text-2xl">
          <span className="text-2xl">👑</span>
          <span className="break-words">Clientes SaaS · Firebase Spark</span>
        </h1>

        <Button className="shrink-0" onClick={() => setShowAddModal(true)} type="button" variant="primary">
          ➕ Nuevo Cliente
        </Button>
      </PageHeader>
      <p role="status" className="rounded-xl border border-line bg-subtle/60 p-3 text-xs leading-relaxed text-muted">Administración Spark mediante Firestore. Usa un Gmail distinto del SuperAdmin para el propietario. Exportación local bajo demanda; el dueño puede exportar sus datos operativos desde Ajustes. Purga, eliminación masiva, restauración privilegiada, scheduler y jobs backend deshabilitados.</p>
      {error && <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      <Button disabled={isLoading} onClick={refresh} type="button" variant="secondary">Actualizar clientes</Button>
      {backupBusinessId && <BackupPanel key={`${user.uid}:${backupBusinessId}`} user={user} businessId={backupBusinessId} onClose={() => setBackupBusinessId(null)} />}

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <SearchField type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar entre clientes cargados por negocio, dueño, correo o ID..." onClear={() => setSearchTerm('')} className="basis-full sm:basis-56" />
      </div>

      {filteredLicenses.length === 0 ? <EmptyState title="Sin registros" description={<>
            {error ? 'No se pudo consultar la lista. Revisa el error y vuelve a intentarlo.' : searchTerm ? `No se encontraron clientes para "${searchTerm}"` : 'Aún no tienes clientes registrados.'}
          </>} /> : <div className="grid min-w-0 gap-4 xl:grid-cols-2 3xl:grid-cols-3">
          {filteredLicenses.map(license => <ClientCard key={license.id} license={license} isProcessing={isProcessing} setExtendModalInfo={setExtendModalInfo} handleToggleStatus={handleToggleStatus} handleExport={setBackupBusinessId} />)}
        </div>}
      {hasMore && <Button disabled={isLoading} onClick={loadMore} type="button" variant="secondary">Cargar más clientes</Button>}

      {/* MODAL: NUEVO CLIENTE */}
      {showAddModal && <Dialog title={<>🏢 Alta de Nuevo Cliente</>} busy={isProcessing} className="max-w-lg" onClose={() => setShowAddModal(false)}>

            <div className="bg-primary-soft text-primary p-3 rounded-xl text-sm mb-4 flex gap-2 items-center">
              <span>💡</span>
              <p className="m-0">El sistema creará automáticamente la <strong>Sede Principal</strong> y los Ajustes base para este cliente.</p>
            </div>

            <form onSubmit={submitCreate} className="grid gap-4">
              <FormField label={<>NOMBRE DEL NEGOCIO</>}>

                <Input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Ej: Panadería San José" required disabled={isProcessing} />
              </FormField>

              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <FormField label={<>NOMBRE DUEÑO</>}>

                  <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Ej: Juan" required disabled={isProcessing} />
                </FormField>
                <FormField label={<>APELLIDO</>}>

                  <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Ej: Pérez" required disabled={isProcessing} />
                </FormField>
              </div>

              <FormField label={<>CORREO GMAIL</>}>

                <Input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} placeholder="Correo del titular" required disabled={isProcessing} />
              </FormField>

              <FormField label={<>MESES PAGADOS</>}>

                <Select value={months || 1} onChange={e => setMonths(e.target.value)} disabled={isProcessing}>
                  <option value={1}>1 Mes</option>
                  <option value={3}>3 Meses</option>
                  <option value={6}>6 Meses</option>
                  <option value={12}>1 Año</option>
                </Select>
              </FormField>

              <DialogFooter>
                <Button type="button" onClick={() => setShowAddModal(false)} disabled={isProcessing} variant="secondary">Cancelar</Button>
                <Button type="submit" disabled={isProcessing} className="flex-1" variant="primary">{isProcessing ? 'Creando...' : 'Crear Inquilino'}</Button>
              </DialogFooter>
            </form>
          </Dialog>}

      {/* MODAL: RENOVAR LICENCIA */}
      {extendModalInfo && <Dialog title={<>🚀 Renovar Licencia</>} busy={isProcessing} className="max-w-lg" onClose={() => setExtendModalInfo(null)}>

            <p className="text-muted text-sm mb-5 leading-snug">
              Agrega meses de servicio a este cliente. Si estaba suspendido, se reactivará automáticamente.
            </p>

            <form onSubmit={submitExtend} className="grid gap-4">
              <FormField label={<>TIEMPO A EXTENDER</>}>

                <Select value={extendMonths || 1} onChange={e => setExtendMonths(e.target.value)} disabled={isProcessing}>
                  <option value={1}>+ 1 Mes de servicio</option>
                  <option value={3}>+ 3 Meses de servicio</option>
                  <option value={6}>+ 6 Meses de servicio</option>
                  <option value={12}>+ 1 Año de servicio</option>
                </Select>
              </FormField>

              <DialogFooter>
                <Button type="button" onClick={() => setExtendModalInfo(null)} disabled={isProcessing} variant="secondary">Cancelar</Button>
                <Button type="submit" disabled={isProcessing} className="flex-1" variant="success">Confirmar Pago</Button>
              </DialogFooter>
            </form>
          </Dialog>}

    </div>;
}
export default SuperAdmin;
