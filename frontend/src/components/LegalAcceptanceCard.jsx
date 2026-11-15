import { Button, Card } from '../shared/ui';
import { useAcceptTerms } from '../features/users/hooks/useAcceptTerms';
import { requiresVersionedAcceptance } from '../features/legal/publication.js';
import LegalConfirmation from './LegalConfirmation';

export default function LegalAcceptanceCard({ user, onLogout }) {
  const { isAccepting, handleAccept, error } = useAcceptTerms(user);
  return <main className="nebula-brand flex min-h-dvh items-center justify-center p-4">
    <Card className="w-full max-w-lg space-y-4">
      <h1 className="text-xl font-extrabold text-brand-deep">Antes de continuar</h1>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <LegalConfirmation needsPrivacy={requiresVersionedAcceptance(user)} onConfirm={handleAccept}
        disabled={user.accessVerified === false} busy={isAccepting} submitLabel="Aceptar y continuar" />
      <Button className="w-full" variant="ghost" disabled={isAccepting} onClick={onLogout}>Cerrar sesión</Button>
    </Card>
  </main>;
}
