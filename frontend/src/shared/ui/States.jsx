import { CircleAlert, Inbox, LoaderCircle } from 'lucide-react';
import { Button } from './Button';
import { cn } from './cn';

export function LoadingState({ children = 'Cargando…', className }) {
  return <div role="status" className={cn('flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted', className)}><LoaderCircle aria-hidden="true" className="size-7 animate-spin text-primary motion-reduce:animate-none" />{children}</div>;
}
export function EmptyState({ title = 'No hay registros', description, icon = Inbox, children, className }) {
  const Icon = icon;
  return <div className={cn('col-span-full flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line bg-panel px-5 py-12 text-center', className)}>
    <span className="rounded-2xl bg-subtle p-3 text-muted"><Icon aria-hidden="true" className="size-6" /></span><h3 className="font-semibold text-ink">{title}</h3>
    {description && <p className="max-w-md text-sm text-muted">{description}</p>}{children}
  </div>;
}
export function ErrorState({ title = 'No se pudo cargar', error, onRetry, children }) {
  return <EmptyState icon={CircleAlert} title={title} description={error?.message || error}>{children}{onRetry && <Button variant="secondary" onClick={onRetry}>Reintentar</Button>}</EmptyState>;
}
