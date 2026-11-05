import { cn } from './cn';

const variants = { neutral: 'bg-subtle text-muted', primary: 'bg-primary-soft text-primary', accent: 'bg-accent-soft text-accent', success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-warning', danger: 'bg-danger-soft text-danger' };
export function Badge({ variant = 'neutral', className, children, ...props }) {
  return <span className={cn('inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold leading-relaxed wrap-anywhere [&>svg]:shrink-0', variants[variant], className)} {...props}>{children}</span>;
}
