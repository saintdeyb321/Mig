import { Building2, CalendarPlus, Download, Ellipsis, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card } from '../../shared/ui';
import { toDateSafe } from '../../core/dates/dateValues.js';
import { formatLicenseDate } from '../../features/licenses/domain/licenseTerm.js';

export function ClientCard({ license, canOperate, onRenew, onQuota, onExport, onOffboard, onStatus, readContact }) {
  const [contactState, setContactState] = useState(null);
  const contact = contactState?.license === license ? contactState.value : null;
  const maintained = license.tenantStatus === 'active' && !license.maintenanceJobId;
  const suspended = license.status !== 'activa';
  const expiry = toDateSafe(license.expiry);
  const expired = !expiry || expiry < new Date();
  const active = license.branchQuotaVersion === 1 && Array.isArray(license.activeBranchIds) ? license.activeBranchIds.length : null;
  const registered = license.registeredBranchQuotaVersion === 1 && Array.isArray(license.registeredBranchIds) ? license.registeredBranchIds.length : null;
  const inactive = registered !== null && active !== null && active <= registered ? registered - active : null;
  const status = !maintained ? 'En revisión' : suspended ? 'Suspendida' : !expiry ? 'Vigencia sin verificar' : expired ? 'Vencida' : 'Activa';

  const loadContact = async () => {
    setContactState({ license, value: { loading: true } });
    try { setContactState({ license, value: await readContact(license.id) }); }
    catch (failure) { setContactState({ license, value: { error: failure.message } }); }
  };
  const owner = contact && [contact.ownerFirstName, contact.ownerLastName].filter(Boolean).join(' ');

  return <Card as="article" className="grid content-start gap-3 border-t-2 border-t-primary/60 p-4 sm:p-4">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <h2 className="min-w-0 text-lg font-extrabold text-brand-deep">{license.businessName}</h2>
      <Badge variant={status === 'Activa' ? 'success' : status === 'Suspendida' ? 'danger' : 'warning'}>{status}</Badge>
    </header>
    <dl className="grid gap-2 rounded-xl border border-line bg-primary-soft/35 p-3 text-sm sm:grid-cols-2">
      <div><dt className="text-xs text-muted">Vencimiento · Lima</dt><dd className="font-semibold">{formatLicenseDate(license.expiry)}</dd></div>
      <div><dt className="text-xs text-muted">Sedes activas</dt><dd className="font-semibold">{active === null ? 'Necesita revisión' : `${active} de ${license.maxActiveBranches}`}</dd></div>
      <div className="sm:col-span-2"><dt className="text-xs text-muted">Sedes registradas</dt><dd className="font-semibold">
        {registered === null ? 'Inventario pendiente de revisión' : `${registered} ${registered === 1 ? 'registrada' : 'registradas'}${inactive !== null ? ` · ${inactive} ${inactive === 1 ? 'inactiva' : 'inactivas'}` : ''}`}
      </dd></div>
    </dl>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={!canOperate || !maintained} onClick={() => onRenew(license)}><CalendarPlus aria-hidden="true" />Renovar licencia</Button>
      <Button size="sm" variant="secondary" disabled={!canOperate} onClick={() => onQuota(license)}><Building2 aria-hidden="true" />Gestionar sedes y cupos</Button>
    </div>
    <div className="flex flex-wrap gap-2 border-t border-line pt-2">
      <Button size="sm" variant="ghost" disabled={!canOperate} onClick={() => onExport(license)}><Download aria-hidden="true" />Descargar datos</Button>
      <Button size="sm" variant="ghost" onClick={() => onOffboard(license)}>Solicitud de baja</Button>
    </div>
    <details className="rounded-xl border border-line bg-canvas px-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-brand-deep"><Ellipsis aria-hidden="true" className="size-4" />Contacto y opciones de licencia</summary>
      <div className="grid gap-2 border-t border-line py-3 text-sm">
        {contact && !contact.loading && !contact.error && canOperate && <div role="status" className="wrap-anywhere">
          <strong>{owner || 'Titular'}</strong>
          <p className="text-muted">{contact.ownerEmail || 'Correo sin registrar'}</p>
          {contact.businessName && contact.businessName !== license.businessName && <p>{contact.businessName}</p>}
        </div>}
        {contact?.error && <p role="alert" className="text-danger">{contact.error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={!canOperate} loading={contact?.loading} onClick={loadContact}><UsersRound aria-hidden="true" />Consultar titular</Button>
          <Button variant="secondary" size="sm" disabled={!canOperate || !maintained} onClick={() => onStatus(license)}>{suspended ? 'Reactivar licencia' : 'Suspender licencia'}</Button>
        </div>
        <details><summary className="cursor-pointer text-xs text-muted">Información técnica</summary><p className="break-all text-xs text-muted">ID: {license.id}</p></details>
      </div>
    </details>
  </Card>;
}
