import { Search, X } from 'lucide-react';
import { Input } from './Input';
import { IconButton } from './IconButton';
import { cn } from './cn';

export function SearchField({ value, onChange, onClear, placeholder = 'Buscar…', label = placeholder, className, ...props }) {
  return <div className={cn('flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-panel px-3 focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/10', className)}>
    <Search aria-hidden="true" className="size-4 shrink-0 text-muted" />
    <Input {...props} value={value} onChange={onChange} placeholder={placeholder} aria-label={label} className="border-0 bg-transparent px-0 focus:ring-0" />
    {value && onClear && <IconButton label="Limpiar búsqueda" onClick={onClear} className="size-9 min-h-9"><X /></IconButton>}
  </div>;
}
