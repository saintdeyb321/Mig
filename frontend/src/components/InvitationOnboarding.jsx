import { useRef, useState } from 'react';
import { Building2, CheckCircle2, LogOut, ShieldCheck } from 'lucide-react';
import { Button, Card } from '../shared/ui';
import { brand } from '../config/brand';

export default function InvitationOnboarding({ invitation, onActivate, onLogout }) {
  const flight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activate = async () => {
    if (flight.current || !invitation) return;
    flight.current = true; setBusy(true); setError('');
    try { await onActivate(); }
    catch (failure) { setError(failure.message || 'No se pudo activar la cuenta. Reintenta.'); }
    finally { flight.current = false; setBusy(false); }
  };
  return <main className="flex min-h-dvh items-center justify-center bg-linear-to-br from-sidebar to-primary p-4">
    <Card className="w-full max-w-lg space-y-6 p-6 sm:p-8">
      <header className="space-y-4"><img src={brand.logo} alt={brand.name} className="size-14 rounded-2xl" /><span className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success"><CheckCircle2 className="size-4" />Invitación verificada</span>
        <h1 className="text-2xl font-extrabold text-brand-deep">Bienvenido{invitation?.firstName ? `, ${invitation.firstName}` : ''}</h1>
        <p className="text-sm leading-relaxed text-muted">Tu negocio te está esperando. Activa tu cuenta para empezar a trabajar en {brand.name}.</p></header>
      <dl className="space-y-4 rounded-2xl border border-line bg-subtle/50 p-4 text-sm">
        <div><dt className="flex items-center gap-2 text-xs font-semibold text-muted"><Building2 className="size-4" />Negocio verificado</dt><dd className="mt-1 break-all font-semibold">{invitation?.businessName || invitation?.businessId}</dd></div>
        <div><dt className="flex items-center gap-2 text-xs font-semibold text-muted"><ShieldCheck className="size-4" />Rol autorizado</dt><dd className="mt-1 font-semibold">{invitation?.role === 'dueño' ? 'Propietario' : 'Cajero'}</dd></div>
        <div><dt className="text-xs text-muted">Cuenta Google verificada</dt><dd className="break-all">{invitation?.email}</dd></div>
      </dl>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button className="w-full" size="lg" loading={busy} disabled={!invitation} onClick={activate}>Activar mi cuenta</Button>
      <Button className="w-full" variant="ghost" disabled={busy} onClick={onLogout}><LogOut />Usar otra cuenta</Button>
    </Card>
  </main>;
}
