import { useState } from 'react';
import { useAcceptTerms } from '../features/users/hooks/useAcceptTerms';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { Button, Input } from '../shared/ui';
import { LegalDocumentDialog } from '../features/legal/LegalDocuments';
import { legalPublication, legalRoutes, requiresVersionedAcceptance, termsFor } from '../features/legal/publication.js';

export default function TermsModal({ user, onLogout }) {
  const [checked, setChecked] = useState(false);
  const online = useNetworkStatus();
  const { isAccepting, handleAccept, error } = useAcceptTerms(user);
  const versioned = requiresVersionedAcceptance(user);
  const terms = termsFor(user);
  const label = user.role === 'cajero' ? 'Acepto las reglas de uso que corresponden a mi rol.'
    : versioned ? 'Declaro que puedo representar al negocio y acepto las condiciones del servicio.'
      : 'Acepto las condiciones de uso de MigaPOS.';
  return <LegalDocumentDialog kind="terms" document={terms} busy={isAccepting}>
    {loaded => <div className="legal-actions grid shrink-0 gap-2 border-t border-line bg-panel px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-7">
      {versioned && <a href={legalRoutes.privacy} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-sm text-primary underline">
        Consultar Política de Privacidad v{legalPublication.privacy.version}
      </a>}
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <Input type="checkbox" checked={checked} disabled={!loaded} onChange={event => setChecked(event.target.checked)} />
        <span>{label}</span>
      </label>
      {(!online || user.accessVerified === false) && <p role="status" className="text-sm text-warning">Conéctate y espera la verificación de tu cuenta para registrar la aceptación.</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" onClick={onLogout}>Cerrar sesión</Button>
        <Button loading={isAccepting} disabled={!loaded || !checked || !online || user.accessVerified === false}
          onClick={handleAccept}>{isAccepting ? 'Registrando…' : 'Aceptar y continuar'}</Button>
      </div>
    </div>}
  </LegalDocumentDialog>;
}
