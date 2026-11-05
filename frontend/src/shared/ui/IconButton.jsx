import { Button } from './Button';
import { cn } from './cn';

export function IconButton({ label, className, ...props }) {
  return <Button variant="ghost" title={label} aria-label={label} className={cn('size-10 min-h-10 shrink-0 p-2', className)} {...props} />;
}
