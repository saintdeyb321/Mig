import { ChevronDown, Info } from 'lucide-react';
import { cn } from './cn';

export function HelpDisclosure({ title = 'Información del módulo', children, className }) {
  return <details className={cn('group rounded-xl border border-line bg-panel/65 text-sm text-muted', className)}>
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold outline-offset-2 [&::-webkit-details-marker]:hidden"><Info aria-hidden="true" className="size-4 shrink-0 text-primary" />{title}<ChevronDown aria-hidden="true" className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" /></summary>
    <div className="space-y-3 border-t border-line px-4 py-3 text-xs leading-relaxed">{children}</div>
  </details>;
}
