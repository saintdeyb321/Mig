import { useEffect, useState } from 'react';
import { Download, FileText, ShieldCheck } from 'lucide-react';
import { Button, Dialog, cn } from '../../shared/ui';
import { fetchLegalText, legalPublication, legalRoutes, legalTitles } from './publication.js';

export function LegalLinks({ newTab = false, className }) {
  const target = newTab ? '_blank' : undefined;
  const { provider } = legalPublication;
  return <nav aria-label="Información legal" className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs', className)}>
    {Object.entries(legalRoutes).map(([kind, route]) => <a key={kind} href={route} target={target} rel={newTab ? 'noopener' : undefined}
      className="inline-flex min-h-11 items-center underline underline-offset-4">{legalTitles[kind]}</a>)}
    {provider?.complaintsUrl && <a href={provider.complaintsUrl} target={target} rel={newTab ? 'noopener' : undefined}
      className="inline-flex min-h-11 items-center underline underline-offset-4">Libro de Reclamaciones</a>}
    {provider && <>
      <a href={`mailto:${provider.supportEmail}`} className="inline-flex min-h-11 items-center underline underline-offset-4">Soporte</a>
      <p className="w-full">{provider.name} · RUC {provider.ruc}</p>
    </>}
  </nav>;
}

export function LegalDocumentDialog({ kind, document = legalPublication[kind], onClose, busy, children }) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(null);
  const current = loaded?.document === document && loaded.attempt === attempt ? loaded : null;
  useEffect(() => {
    if (!document) return;
    const controller = new AbortController();
    void fetchLegalText(document, controller.signal).then(
      text => { if (!controller.signal.aborted) setLoaded({ document, attempt, text }); },
      () => { if (!controller.signal.aborted) setLoaded({ document, attempt, error: true }); },
    );
    return () => controller.abort();
  }, [document, attempt]);
  const title = legalTitles[kind];
  return <Dialog title={title} description={document ? `Versión ${document.version} · ${document.dateLabel}` : 'Estado de publicación'}
    icon={kind === 'terms' ? FileText : ShieldCheck} onClose={onClose} dismissible={Boolean(onClose)} busy={busy}
    className="legal-dialog max-w-3xl" bodyClassName="p-0 sm:p-0">
      <div className="legal-document ui-scroll min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-7"
      tabIndex={0} role="region" aria-label={`Texto de ${title}`}>
      {!document ? <p className="text-sm leading-relaxed text-muted">La Política de Privacidad v1.0 se publicará después de validar los datos del proveedor y los canales de atención.</p>
        : current?.error ? <div className="space-y-3">
          <p role="alert" className="text-sm text-danger">No se pudo abrir el documento oficial. Comprueba la conexión y vuelve a intentarlo.</p>
          <Button variant="secondary" onClick={() => setAttempt(attempt + 1)}>Volver a cargar</Button>
        </div> : !current ? <p role="status" className="text-sm text-muted">Cargando documento…</p>
        : <>
          <a href={document.path} download className="inline-flex min-h-11 flex-wrap items-center gap-2 font-semibold text-primary underline underline-offset-4">
            <Download aria-hidden="true" className="size-4 shrink-0" /> Descargar texto v{document.version}
          </a>
          <article className="space-y-4 text-base leading-relaxed wrap-anywhere">
            {current.text.trim().split(/\r?\n\s*\r?\n/).map((block, index) => block.startsWith('## ')
              ? <h3 key={index} className="pt-1 font-bold text-brand-deep">{block.slice(3)}</h3>
              : <p key={index} className="whitespace-pre-line">{block}</p>)}
          </article>
          {kind === 'privacy' && legalPublication.provider?.privacyEmail && <p className="text-sm">
            <a className="inline-flex min-h-11 items-center font-semibold text-primary underline wrap-anywhere"
              href={`mailto:${legalPublication.provider.privacyEmail}`}>Contactar para ejercer derechos ARCO</a>
          </p>}
        </>}
      </div>
      {children?.(Boolean(current?.text))}
  </Dialog>;
}
