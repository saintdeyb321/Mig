import { Children, cloneElement, isValidElement, useId } from 'react';
import { cn } from './cn';
import { Input, Select, Textarea } from './Input';

export function FormField({ label, children, hint, error, className, htmlFor, required }) {
  const id = useId();
  const isControl = child => isValidElement(child) && ['input', 'select', 'textarea', Input, Select, Textarea].includes(child.type);
  const fields = Children.toArray(children);
  const firstControl = fields.findIndex(isControl);
  const controlId = htmlFor || fields[firstControl]?.props.id || `${id}-control`;
  const controls = fields.map((child, index) => isControl(child)
    ? cloneElement(child, {
      id: index === firstControl ? controlId : child.props.id,
      'aria-describedby': [child.props['aria-describedby'], (hint || error) && id].filter(Boolean).join(' ') || undefined,
      'aria-invalid': error ? true : child.props['aria-invalid'],
    }) : child);
  return <div className={cn('grid min-w-0 gap-1.5', className)}>
    <label htmlFor={controlId} className="text-sm font-medium text-ink">{label}{required && <span aria-hidden="true" className="ml-1 text-danger">*</span>}</label>
    {controls}
    {(hint || error) && <p id={id} role={error ? 'alert' : undefined} className={cn('text-xs leading-relaxed', error ? 'text-danger' : 'text-muted')}>{error || hint}</p>}
  </div>;
}
