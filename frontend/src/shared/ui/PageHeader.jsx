import { cn } from './cn';

export function PageHeader({ title, description, eyebrow, actions, children, className, ...props }) {
  return <header className={cn('flex min-w-0 flex-wrap items-start justify-between gap-4', className)} {...props}>
    {title ? <div className="min-w-0 flex-1">{eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">{eyebrow}</p>}
      <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
      {description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}
    </div> : children}
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>;
}
