import { Card } from './Card';
import { cn } from './cn';

const sectionTones = {
  customer: { border: 'border-accent/25', header: 'bg-accent-soft text-accent' },
  delivery: { surface: 'border-stellar/25 bg-stellar-soft/25', header: 'bg-linear-to-r from-stellar-soft to-stellar-soft/45 text-stellar' },
  details: { surface: 'border-accent/20 bg-accent-soft/25', header: 'bg-linear-to-r from-accent-soft to-indigo-soft/50 text-brand-deep' },
  finance: { surface: 'border-finance-line bg-success-soft/75', header: 'bg-linear-to-r from-success-soft to-panel/55 text-success' },
};

export function SectionCard({ number, title, description, icon: Icon, tone = 'accent', children, className }) {
  const style = sectionTones[tone];
  return <Card className={cn('space-y-4 p-4 sm:p-5', style?.border, style?.surface, className)}>
    <header className={cn('flex items-center gap-3', style && 'rounded-xl px-3 py-2.5', style?.header)}>
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold shadow-xs', style ? 'bg-panel' : 'bg-primary-soft text-primary')}>{number || (Icon && <Icon aria-hidden="true" className="size-4" />)}</span>
      <div className="min-w-0"><h3 className={cn('text-sm font-bold tracking-tight sm:text-base', !style && 'text-brand-deep')}>{title}</h3>{description && <p className="mt-0.5 text-xs text-muted">{description}</p>}</div>
      {number && Icon && <Icon aria-hidden="true" className={cn('ml-auto size-5 shrink-0', !style && 'text-accent/45')} />}
    </header>{children}
  </Card>;
}
