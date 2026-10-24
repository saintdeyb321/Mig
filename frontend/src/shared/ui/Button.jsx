import { LoaderCircle } from 'lucide-react';
import { cn } from './cn';

const variants = {
  primary: 'border border-primary/20 bg-linear-to-br from-primary to-accent text-white shadow-md shadow-primary/15 hover:from-primary-hover hover:to-primary',
  secondary: 'border border-line bg-panel text-ink shadow-xs hover:border-primary/30 hover:bg-primary-soft/50',
  ghost: 'text-muted hover:bg-subtle hover:text-ink',
  danger: 'bg-danger text-white hover:bg-danger/90',
  success: 'border border-success/20 bg-success text-white shadow-sm shadow-success/15 hover:bg-success/90',
  accent: 'border border-accent/20 bg-accent text-white shadow-sm shadow-accent/15 hover:bg-accent/90',
};
const sizes = { sm: 'min-h-11 px-3 py-2 text-xs sm:min-h-9 sm:py-1.5', md: 'min-h-11 px-4 py-2.5 text-sm', lg: 'min-h-12 px-5 py-3 text-base' };

export function Button({ variant = 'primary', size = 'md', loading = false, disabled, type = 'button', className, children, ref, ...props }) {
  return <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
    className={cn('inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold transition-[color,background-color,box-shadow] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4', variants[variant], sizes[size], className)} {...props}>
    {loading && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}{children}
  </button>;
}
