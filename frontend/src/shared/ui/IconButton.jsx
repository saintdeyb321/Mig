import { Button } from './Button';
import { cn } from './cn';

export function IconButton({ label, className, ...props }) {
  return <Button variant="ghost" title={label} aria-label={label} className={cn('size-11 min-h-11 shrink-0 p-2 lg:size-10 lg:min-h-10', className)} {...props} />;
}
