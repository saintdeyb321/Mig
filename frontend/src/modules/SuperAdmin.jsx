import { useState } from 'react';
import { CalendarPlus, ClipboardList, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import FirestoreQueryError from '../components/FirestoreQueryError';
import { runtimeCapabilities } from '../config/runtimeCapabilities.js';
import { toMillisSafe } from '../core/dates/dateValues.js';
import { addLicenseMonths, formatLicenseDate } from '../features/licenses/domain/licenseTerm.js';
import { useSuperAdmin } from '../hooks/useSuperAdmin';
import { Alert, Button, ConfirmDialog, Dialog, DialogFooter, EmptyState, FormField, LoadingState, PageHeader, SearchField, Select } from '../shared/ui';
import { BranchQuotaModal } from './admin/BranchQuotaModal';
import { BusinessDownloadsDialog } from './admin/BusinessDownloadsDialog.jsx';
import { ClientCard } from './admin/ClientCard.jsx';
import { LicenseMonthOptions, NewBusinessDialog } from './admin/NewBusinessDialog.jsx';

function RenewalDialog({ license, onClose, onSave, busy, canOperate, accessRecovery }) {
  const [months, setMonths] = useState(1);
  const [openedAt] = useState(Date.now);
  const estimate = addLicenseMonths(Math.max(openedAt, toMillisSafe(license.expiry)), months);
  return <Dialog title="Renovar licencia" description={license.businessName} icon={CalendarPlus} busy={busy} onClose={onClose}>
    {accessRecovery}
    <form className="grid gap-4" onSubmit={async event => {
      event.preventDefault();
      if (canOperate && await onSave(license, months)) onClose();
    }}>
      <FormField label="Meses de servicio"><Select value={months} onChange={e => setMonths(Number(e.target.value))}><LicenseMonthOptions /></Select></FormField>
      <dl className="grid gap-3 rounded-xl border border-primary/20 bg-primary-soft/40 p-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted">Vencimiento actual</dt><dd className="font-bold">{formatLicenseDate(license.expiry)}</dd></div>
        <div><dt className="text-muted">Nuevo vencimiento estimado</dt><dd className="font-bold">{formatLicenseDate(estimate)}</dd></div>
      </dl>
      <p className="text-sm text-muted">Se cuentan los meses desde el vencimiento vigente o desde hoy si ya venció, en horario de Lima. La renovación {license.status === 'activa' ? 'mantiene activa' : 'reactiva'} la licencia y no realiza un cobro.</p>
      <DialogFooter><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={busy} disabled={!canOperate}>Confirmar renovación</Button></DialogFooter>
    </form>
  </Dialog>;
}

function AdminWorkspace({ user }) {
  const admin = useSuperAdmin(user);
  const [selection, setSelection] = useState(null);
  const { licenses, filteredLicenses, isLoading, isProcessing, canOperate, online, updatedAt, error } = admin;
  const close = () => setSelection(null);
  const select = (type, license) => setSelection({ type, license });
  const { type, license } = selection ?? {};
  const statusText = isLoading ? 'Consultando Firestore…' : !online ? 'Sin conexión' : !canOperate && !isProcessing ? 'Actualiza para confirmar el acceso' :
    updatedAt ? `Consulta confirmada · ${new Date(updatedAt).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })}` : '';
  const suspending = license?.status === 'activa';
  const accessRecovery = !canOperate && !isProcessing && <Alert variant="warning">
    <p>{online ? 'Actualiza el acceso para continuar con los datos de este formulario.' : 'Se perdió la conexión. Conservamos los datos de este formulario.'}</p>
    <Button variant="secondary" size="sm" loading={isLoading} disabled={!online} onClick={admin.refresh}>Actualizar acceso</Button>
  </Alert>;

  return <section className="workspace-page max-w-6xl" aria-label="Administración de plataforma">
    <PageHeader title="Negocios" icon={ShieldCheck} eyebrow="Administración · Firebase Spark"
      actions={<Button onClick={() => select('create')} disabled={!canOperate}><Plus aria-hidden="true" />Agregar negocio</Button>} />
    <div className="grid gap-3 rounded-2xl border border-line bg-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField value={admin.searchTerm} onChange={event => admin.setSearchTerm(event.target.value)} onClear={() => admin.setSearchTerm('')}
          label="Buscar por nombre en los negocios cargados" placeholder="Buscar por nombre" className="min-w-0 flex-1 basis-48" />
        <Button variant="secondary" size="sm" disabled={!online || isLoading || isProcessing} onClick={admin.refresh}><RefreshCw aria-hidden="true" />Actualizar</Button>
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted" role="status">
        <span>{admin.searchTerm ? 'Buscando en' : 'Mostrando'} {licenses.length} {licenses.length === 1 ? 'negocio cargado' : 'negocios cargados'}</span>
        <span>{statusText}</span>
      </div>
    </div>
    <FirestoreQueryError error={error} area="administration" user={user} onRetry={admin.refresh} />
    {isLoading && licenses.length === 0 ? <LoadingState>Consultando negocios…</LoadingState> : filteredLicenses.length ? (
      <div className="grid min-w-0 gap-3 xl:grid-cols-2 3xl:grid-cols-3">
        {filteredLicenses.map(row => <ClientCard key={row.id} license={row} canOperate={canOperate}
          onRenew={value => select('renew', value)} onQuota={value => select('quota', value)} onExport={value => select('export', value)}
          onOffboard={value => select('offboard', value)} onStatus={value => select('status', value)} readContact={admin.readContact} />)}
      </div>
    ) : !error && <EmptyState title={admin.searchTerm ? 'Sin coincidencias entre los negocios cargados' : 'Aún no hay negocios registrados'} />}
    {admin.hasMore && <Button className="justify-self-start" variant="secondary" disabled={!canOperate} onClick={admin.loadMore}>Cargar más negocios</Button>}
    {type === 'create' && <NewBusinessDialog user={user} busy={isProcessing} canOperate={canOperate} accessRecovery={accessRecovery} onCreate={admin.handleCreateClient} onClose={close} />}
    {type === 'renew' && <RenewalDialog license={license} onClose={close} onSave={admin.handleExtendLicense} busy={isProcessing} canOperate={canOperate} accessRecovery={accessRecovery} />}
    {type === 'status' && <ConfirmDialog title={suspending ? 'Suspender licencia' : 'Reactivar licencia'} onClose={close}
      description={suspending ? `Se bloqueará el acceso operativo de ${license.businessName}. El historial y la fecha de vencimiento se conservan.` : `Se reactivará ${license.businessName}. Si la vigencia terminó, seguirá necesitando renovación.`}
      confirmLabel={suspending ? 'Confirmar suspensión' : 'Confirmar reactivación'}
      onConfirm={async () => {
        if (!canOperate) throw new Error('Actualiza la lista para confirmar la licencia.');
        if (await admin.handleToggleStatus(license)) close();
      }}>{accessRecovery}</ConfirmDialog>}
    {type === 'quota' && <BranchQuotaModal user={user} license={license} onClose={close} onSave={admin.handleSetBranchQuota} busy={isProcessing} canOperate={canOperate} accessRecovery={accessRecovery} />}
    {type === 'export' && <BusinessDownloadsDialog user={user} license={license} onClose={close} />}
    {type === 'offboard' && <Dialog title="Solicitud de baja" description={license.businessName} icon={ClipboardList} onClose={close}>
      <Alert variant="warning">Coordina la solicitud por un canal verificado con el titular. Esta pantalla no registra una baja ni modifica el negocio.</Alert>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>Confirma la identidad, el negocio, las obligaciones pendientes y la conservación aplicable. Revisa cajas, anticipos y devoluciones.</li>
        <li>Entrega una copia cifrada con alcance verificado. Recoge pendientes y fotos de cada dispositivo con autorización.</li>
        <li>Completa el inventario de rutas y referencias, incluidas subcolecciones y cuentas Auth. Prepara y verifica el dry-run antes de pedir autorización independiente.</li>
        <li>Una futura limpieza requiere un entorno administrativo, checkpoints y comprobación posterior de las rutas. La eliminación está deshabilitada.</li>
      </ol>
      <DialogFooter><Button variant="secondary" onClick={close}>Cerrar</Button><Button disabled={!canOperate} onClick={() => select('export', license)}>Abrir exportación e inventario</Button></DialogFooter>
    </Dialog>}
  </section>;
}

export default function SuperAdmin({ user }) {
  if (user?.role !== 'superadmin') return <Alert variant="danger">El acceso a Negocios requiere el rol SuperAdmin.</Alert>;
  if (!runtimeCapabilities.tenantAdministration) return <Alert variant="warning">La administración de negocios no está disponible en este entorno.</Alert>;
  return <AdminWorkspace key={user.uid} user={user} />;
}
