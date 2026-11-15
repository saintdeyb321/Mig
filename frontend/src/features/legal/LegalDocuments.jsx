import { useEffect, useState } from 'react';
import { FileText, ShieldCheck } from 'lucide-react';
import { Button, Dialog, cn } from '../../shared/ui';
import { fetchLegalText, legalPublication, legalRoutes, legalTitles } from './publication.js';

const linkClass = 'inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';
const whatsappSupport = 'https://wa.me/51928318947?text=Hola%2C%20necesito%20soporte%20t%C3%A9cnico%20de%20MigaPOS';

export function LegalLinks({ newTab = false, placement = 'documents', className }) {
  const target = newTab ? '_blank' : undefined;
  const complaintsUrl = legalPublication.provider?.complaintsUrl;
  const settings = placement === 'settings';
  return <nav aria-label="Información legal" className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs', className)}>
    {Object.entries(legalRoutes).map(([kind, route]) => <a key={kind} href={route} target={target} rel={newTab ? 'noopener noreferrer' : undefined}
      className={linkClass}>{legalTitles[kind]}</a>)}
    {settings && complaintsUrl && <a href={complaintsUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>Libro de Reclamaciones</a>}
    {(settings || placement === 'login') && <a href={whatsappSupport} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {settings ? 'Soporte técnico por WhatsApp · +51 928 318 947' : 'Soporte por WhatsApp'}
    </a>}
    {settings && <p className="w-full text-muted">Solo mensajes por WhatsApp. No se atienden llamadas telefónicas.</p>}
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
        : <article className="space-y-4 text-base leading-relaxed wrap-anywhere">
            {current.text.trim().split(/\r?\n\s*\r?\n/).map((block, index) => block.startsWith('## ')
              ? <h3 key={index} className="pt-1 font-bold text-brand-deep">{block.slice(3)}</h3>
              : <p key={index} className="whitespace-pre-line">{block}</p>)}
          </article>}
      </div>
      {children?.(Boolean(current?.text))}
  </Dialog>;
}
