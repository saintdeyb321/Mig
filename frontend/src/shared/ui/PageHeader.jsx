import { Layers3 } from 'lucide-react';
import { cn } from './cn';

export function PageHeader({ title, description, eyebrow, icon = Layers3, actions, children, className, ...props }) {
  const Icon = icon;
  return <header className={cn('relative flex min-w-0 flex-wrap items-center justify-between gap-4 overflow-hidden rounded-2xl border border-primary/15 bg-linear-to-br from-panel via-panel to-accent-soft/70 p-4 shadow-card sm:p-5', className)} {...props}>
    {title ? <div className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-64 sm:gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-primary to-accent text-white shadow-md shadow-primary/20 sm:size-12"><Icon aria-hidden="true" className="size-5 sm:size-6" /></span>
      <div className="min-w-0">{eyebrow && <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-accent">{eyebrow}</p>}
        <h1 className="text-xl font-extrabold tracking-tight text-brand-deep sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
      </div>
    </div> : children}
    {actions && <div className="flex w-full max-w-full flex-wrap items-center justify-end gap-2 sm:w-auto">{actions}</div>}
  </header>;
}
