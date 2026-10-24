import { CircleAlert, Info } from 'lucide-react';
import { cn } from './cn';

const variants = { info: 'border-primary/15 bg-primary-soft text-primary', warning: 'border-warning/20 bg-warning-soft text-warning', danger: 'border-danger/20 bg-danger-soft text-danger', success: 'border-success/20 bg-success-soft text-success' };
export function Alert({ variant = 'info', title, children, className, ...props }) {
  const Icon = variant === 'info' ? Info : CircleAlert;
  return <div role={variant === 'danger' ? 'alert' : 'status'} className={cn('flex min-w-0 items-start gap-3 rounded-xl border p-3 text-sm leading-relaxed', variants[variant], className)} {...props}>
    <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><div className="min-w-0 break-words">{title && <p className="mb-0.5 font-semibold">{title}</p>}{children}</div>
  </div>;
}
