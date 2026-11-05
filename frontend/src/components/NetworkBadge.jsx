import { memo, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { cn } from '../shared/ui';
const NetworkBadge = memo(({ dark = false }) => {
  const isOnline = useNetworkStatus();
  const [hovered, setHovered] = useState(false), [expanded, setExpanded] = useState(false);
  const [focused, setFocused] = useState(false);
  const open = hovered || focused || expanded;
  const Icon = isOnline ? Wifi : WifiOff;
  const label = isOnline ? 'En línea' : 'Sin conexión';
  return <button type="button" aria-label={label} aria-expanded={open} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); setExpanded(false); }} onClick={() => setExpanded(value => !value)}
    className={cn('relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition-colors', dark ? 'hover:bg-white/10' : 'hover:bg-subtle', isOnline ? dark ? 'text-emerald-300' : 'text-success' : dark ? 'text-rose-300' : 'text-danger')}>
    <Icon aria-hidden="true" className="size-4 shrink-0" />
    <span aria-hidden="true" className={cn('overflow-hidden whitespace-nowrap transition-all duration-200 motion-reduce:transition-none', dark ? open ? 'max-w-28 opacity-100' : 'max-w-0 opacity-0' : 'absolute right-0 top-full z-40 rounded-lg border border-line bg-panel px-3 py-2 shadow-card', !dark && (open ? 'visible translate-y-1 opacity-100' : 'invisible translate-y-0 opacity-0'))}>{label}</span>
    <span className="sr-only" role="status" aria-live="polite">{label}</span>
  </button>;
});
export default NetworkBadge;
