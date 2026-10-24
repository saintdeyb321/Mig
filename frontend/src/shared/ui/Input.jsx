import { cn } from './cn';

const field = 'min-h-11 w-full min-w-0 rounded-xl border border-line bg-subtle/40 px-3.5 py-2.5 text-base text-ink sm:text-sm outline-none transition-colors placeholder:text-muted/70 hover:border-primary/30 focus:bg-panel focus:border-primary focus:ring-3 focus:ring-primary/10 disabled:bg-subtle disabled:text-muted aria-invalid:border-danger';
export function Input({ className, type = 'text', ref, ...props }) {
  return <input ref={ref} type={type} className={cn(['checkbox', 'radio'].includes(type) ? 'size-5 shrink-0 accent-primary' : field, className)} {...props} />;
}
export function Textarea({ className, ref, ...props }) {
  return <textarea ref={ref} className={cn(field, 'min-h-24 resize-y', className)} {...props} />;
}
export function Select({ className, children, ref, ...props }) {
  return <select ref={ref} className={cn(field, 'pr-8', className)} {...props}>{children}</select>;
}
