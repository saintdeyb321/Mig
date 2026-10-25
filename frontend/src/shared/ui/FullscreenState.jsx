import { LoaderCircle } from 'lucide-react';
import { cn } from './cn';

export function FullscreenState({ title, description, loading = false, children, tone = 'light' }) {
  return <main className={cn('grid min-h-dvh w-full place-items-center px-4 py-8 sm:px-6', tone === 'dark' ? 'bg-ink text-panel' : 'bg-canvas text-ink')} aria-busy={loading || undefined}>
    <section className="grid w-full max-w-lg justify-items-center gap-4 text-center" role={loading ? 'status' : undefined}>
      {loading && <LoaderCircle aria-hidden="true" className="size-9 animate-spin text-primary motion-reduce:animate-none" />}
      {title && <h1 className="text-xl font-semibold tracking-tight">{title}</h1>}
      {description && <p className="max-w-md text-sm leading-relaxed text-muted">{description}</p>}
      {children}
    </section>
  </main>;
}
