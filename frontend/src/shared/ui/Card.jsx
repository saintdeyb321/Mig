import { cn } from './cn';

const tones = { neutral: 'border-line bg-panel', accent: 'border-accent/20 bg-accent-soft/30', finance: 'border-finance-line bg-panel', warning: 'border-warning/20 bg-warning-soft/50' };
export function Card({ as = 'section', tone = 'neutral', className, children, ...props }) {
  const Component = as;
  return <Component className={cn('min-w-0 rounded-card border p-4 shadow-card sm:p-6', tones[tone], className)} {...props}>{children}</Component>;
}
