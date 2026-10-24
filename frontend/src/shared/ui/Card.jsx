import { cn } from './cn';

export function Card({ as = 'section', className, children, ...props }) {
  const Component = as;
  return <Component className={cn('min-w-0 rounded-card border border-line bg-panel p-4 shadow-card sm:p-6', className)} {...props}>{children}</Component>;
}
