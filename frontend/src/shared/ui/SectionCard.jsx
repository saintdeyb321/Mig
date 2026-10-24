import { Card } from './Card';
import { cn } from './cn';

export function SectionCard({ number, title, description, icon: Icon, tone = 'accent', children, className }) {
  const finance = tone === 'finance';
  return <Card tone={finance ? 'finance' : 'neutral'} className={cn('space-y-4 p-4 sm:p-5', className)}>
    <header className="flex items-center gap-3">
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold shadow-xs', finance ? 'bg-success text-white' : 'bg-primary-soft text-primary')}>{number || (Icon && <Icon aria-hidden="true" className="size-4" />)}</span>
      <div className="min-w-0"><h3 className={cn('text-sm font-bold tracking-tight sm:text-base', finance ? 'text-success' : 'text-brand-deep')}>{title}</h3>{description && <p className="mt-0.5 text-xs text-muted">{description}</p>}</div>
      {number && Icon && <Icon aria-hidden="true" className={cn('ml-auto size-5 shrink-0', finance ? 'text-success/55' : 'text-accent/45')} />}
    </header>{children}
  </Card>;
}
