import { LoaderCircle } from 'lucide-react';
import { cn } from './cn';

const variants = {
  primary: 'bg-primary text-white hover:bg-primary-hover shadow-sm',
  secondary: 'border border-line bg-panel text-ink hover:bg-subtle',
  ghost: 'text-muted hover:bg-subtle hover:text-ink',
  danger: 'bg-danger text-white hover:bg-danger/90',
  success: 'bg-success text-white hover:bg-success/90',
  accent: 'bg-accent text-white hover:bg-accent/90',
};
const sizes = { sm: 'min-h-9 px-3 py-1.5 text-xs', md: 'min-h-11 px-4 py-2.5 text-sm', lg: 'min-h-12 px-5 py-3 text-base' };

export function Button({ variant = 'primary', size = 'md', loading = false, disabled, type = 'button', className, children, ref, ...props }) {
  return <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
    className={cn('inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4', variants[variant], sizes[size], className)} {...props}>
    {loading && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}{children}
  </button>;
}
