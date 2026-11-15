import { useEffect, useState } from 'react';
import { Button, Input } from '../shared/ui';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { fetchLegalText, legalConfirmationComplete, legalPublication, legalRoutes } from '../features/legal/publication.js';

export default function LegalConfirmation({ onConfirm, busy, disabled = false, needsPrivacy = true, submitLabel }) {
  const [confirmation, setConfirmation] = useState({ acceptedTerms: false, acknowledgedPrivacy: false });
  const [attempt, setAttempt] = useState(0);
  const [verified, setVerified] = useState(null);
  const online = useNetworkStatus();
  const { terms, privacy } = legalPublication;
  useEffect(() => {
    const controller = new AbortController();
    const documents = needsPrivacy ? [terms, privacy] : [terms];
    void Promise.all(documents.map(document => fetchLegalText(document, controller.signal))).then(
      () => { if (!controller.signal.aborted) setVerified(true); },
      () => { if (!controller.signal.aborted) setVerified(false); },
    );
    return () => controller.abort();
  }, [attempt, needsPrivacy, terms, privacy]);

  const canConfirm = verified === true && online && !disabled && !busy && legalConfirmationComplete(confirmation, needsPrivacy);
  const acknowledgements = [
    { key: 'acceptedTerms', label: `He leído y acepto los Términos y Condiciones de MigaPOS (v${terms.version}).`, route: legalRoutes.terms, link: 'Consultar Términos y Condiciones' },
  ];
  if (needsPrivacy) acknowledgements.push({
    key: 'acknowledgedPrivacy', label: `He leído la Política de Privacidad de MigaPOS (v${privacy.version}) y conozco el tratamiento de mis datos.`,
    route: legalRoutes.privacy, link: 'Consultar Política de Privacidad',
  });

  return <div className="grid min-w-0 gap-3">
    <fieldset disabled={busy} className="grid min-w-0 gap-2 rounded-xl border border-line bg-subtle/50 px-3 pb-3">
      <legend className="px-1 font-semibold text-brand-deep">Confirmación de documentos</legend>
      {acknowledgements.map(({ key, label, route, link }) => <div key={key}>
        <a href={route} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4 wrap-anywhere">{link}</a>
        <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed">
          <Input type="checkbox" checked={confirmation[key]} disabled={verified !== true}
            onChange={event => setConfirmation({ ...confirmation, [key]: event.target.checked })} className="mt-1" />
          <span>{label}</span>
        </label>
      </div>)}
    </fieldset>
    {verified === null && <p role="status" className="text-sm text-muted">Verificando documentos…</p>}
    {verified === false && <div className="grid gap-2">
      <p role="alert" className="text-sm text-danger">No se pudieron verificar los documentos. Comprueba la conexión y vuelve a intentarlo.</p>
      <Button variant="secondary" disabled={!online} onClick={() => { setVerified(null); setAttempt(value => value + 1); }}>Volver a verificar documentos</Button>
    </div>}
    {(!online || disabled) && <p role="status" className="text-sm text-warning">Conéctate y espera la verificación de tu cuenta para continuar.</p>}
    <Button className="w-full" size="lg" loading={busy} disabled={!canConfirm}
      onClick={() => { if (canConfirm) void onConfirm(confirmation); }}>{submitLabel}</Button>
  </div>;
}
