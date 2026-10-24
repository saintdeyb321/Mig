import { useId } from 'react';
import { cn } from './cn';

export function FormField({ label, children, hint, error, className, htmlFor, required }) {
  const id = useId();
  return <div className={cn('grid min-w-0 gap-1.5', className)}>
    <label htmlFor={htmlFor} className="text-sm font-medium text-ink">{label}{required && <span aria-hidden="true" className="ml-1 text-danger">*</span>}
      {!htmlFor && <span className="mt-1.5 block font-normal">{children}</span>}
    </label>
    {htmlFor && children}
    {(hint || error) && <p id={id} role={error ? 'alert' : undefined} className={cn('text-xs leading-relaxed', error ? 'text-danger' : 'text-muted')}>{error || hint}</p>}
  </div>;
}
