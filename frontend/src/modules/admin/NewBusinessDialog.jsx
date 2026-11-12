import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { Button, Dialog, DialogFooter, FormField, Input, Select } from '../../shared/ui';
import { DEFAULT_MAX_REGISTERED_BRANCHES, MAX_ACTIVE_BRANCHES, MAX_REGISTERED_BRANCHES } from '../../features/branches/domain/branchPolicy.js';

export function LicenseMonthOptions() {
  return <>
    <option value={1}>1 mes</option><option value={3}>3 meses</option><option value={6}>6 meses</option><option value={12}>12 meses</option>
  </>;
}

export function NewBusinessDialog({ user, onClose, onCreate, busy, canOperate, accessRecovery }) {
  const [businessName, setBusinessName] = useState(''), [ownerEmail, setOwnerEmail] = useState('');
  const [firstName, setFirstName] = useState(''), [lastName, setLastName] = useState('');
  const [months, setMonths] = useState(1), [active, setActive] = useState(1), [registered, setRegistered] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const registeredLimit = registered ?? Math.max(DEFAULT_MAX_REGISTERED_BRANCHES, Number(active));
  const invalidRegistered = !Number.isInteger(Number(registeredLimit))
    || Number(registeredLimit) < Math.max(1, Number(active)) || Number(registeredLimit) > MAX_REGISTERED_BRANCHES;
  const ownEmail = Boolean(user.email && ownerEmail.trim().toLowerCase() === user.email.toLowerCase());
  const submit = async event => {
    event.preventDefault();
    setSubmitted(true);
    if (!canOperate || ownEmail || invalidRegistered || ![businessName, firstName, lastName].every(value => value.trim())) return;
    if (await onCreate(businessName.trim(), ownerEmail.trim().toLowerCase(), firstName.trim(), lastName.trim(), months, active, registeredLimit)) onClose();
  };
  return <Dialog title="Agregar negocio" icon={Building2} description="Crea la licencia y prepara la invitación del titular." busy={busy} onClose={onClose}>
    {accessRecovery}
    <form onSubmit={submit} className="grid gap-4">
      <fieldset className="grid min-w-0 gap-3 rounded-xl border border-line bg-panel p-3">
        <legend className="px-2 font-bold text-brand-deep">Negocio y titular</legend>
        <FormField label="Nombre del negocio" error={submitted && !businessName.trim() ? 'Escribe el nombre del negocio.' : undefined}>
          <Input value={businessName} onChange={e => setBusinessName(e.target.value)} required maxLength={120} />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Nombres" error={submitted && !firstName.trim() ? 'Escribe los nombres.' : undefined}><Input value={firstName} onChange={e => setFirstName(e.target.value)} required maxLength={120} /></FormField>
          <FormField label="Apellidos" error={submitted && !lastName.trim() ? 'Escribe los apellidos.' : undefined}><Input value={lastName} onChange={e => setLastName(e.target.value)} required maxLength={120} /></FormField>
        </div>
        <FormField label="Correo de la cuenta Google" hint="El titular usará este correo para aceptar la invitación." error={ownEmail ? 'Usa una cuenta distinta a la de SuperAdmin.' : undefined}>
          <Input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} required maxLength={254} />
        </FormField>
      </fieldset>
      <fieldset className="grid min-w-0 gap-3 rounded-xl border border-primary/15 bg-primary-soft/35 p-3">
        <legend className="px-2 font-bold text-brand-deep">Licencia y sedes</legend>
        <FormField label="Vigencia inicial"><Select value={months} onChange={e => setMonths(Number(e.target.value))}><LicenseMonthOptions /></Select></FormField>
        <FormField label="Sedes que pueden estar abiertas al mismo tiempo">
          <Input type="number" min={1} max={MAX_ACTIVE_BRANCHES} step={1} value={active} onChange={e => setActive(e.target.value)} required />
        </FormField>
        <details className="rounded-lg border border-line bg-panel p-2">
          <summary className="cursor-pointer text-sm font-semibold">Opciones avanzadas del inventario</summary>
          <FormField label="Máximo de sedes registradas" hint="Incluye sedes inactivas y debe cubrir el cupo activo." className="mt-2">
            <Input type="number" min={Number(active) || 1} max={MAX_REGISTERED_BRANCHES} step={1} value={registeredLimit} onChange={e => setRegistered(e.target.value)} required />
          </FormField>
        </details>
        {invalidRegistered && <p role="alert" className="text-sm text-danger">En Opciones avanzadas, ajusta el cupo registrado para cubrir las sedes activas sin superar {MAX_REGISTERED_BRANCHES}.</p>}
      </fieldset>
      <div className="rounded-xl border border-finance-line bg-success-soft p-3 text-sm text-ink">
        <p className="font-semibold">Al confirmar</p>
        <p>Se creará la Sede Principal activa, una invitación para el titular y una licencia de {months} {months === 1 ? 'mes' : 'meses'}. Cupos: {active || '—'} activas y {registeredLimit || '—'} registradas.</p>
      </div>
      <DialogFooter><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={busy} disabled={!canOperate || ownEmail || invalidRegistered}>Crear negocio</Button></DialogFooter>
    </form>
  </Dialog>;
}
