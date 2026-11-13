import { operationalBranches } from '../features/branches/domain/branchPolicy';
import { ChevronDown, MapPin } from 'lucide-react';
import { useTenantData } from '../features/branches/context/TenantContext';
import { Select, cn } from '../shared/ui';

export function BranchSelectControl({ branches, value, onChange, dark = false, compact = false, isLoading = false, notice }) {
  const active = operationalBranches(branches);
  const waiting = isLoading && !active.length;
  const selectedBranch = active.find(branch => branch.id === value);
  const unavailable = value && value !== 'global' && !selectedBranch;
  const selected = waiting ? '' : selectedBranch?.id ?? 'global';
  const branchLabel = branch => branch.name?.trim() || `Sede ${branch.id}`;
  const message = !waiting && !active.length ? 'No hay sedes operativas disponibles.' : notice || (unavailable && !waiting ? 'Sede no disponible. Se muestra la vista global de consulta.' : null);
  const select = <Select aria-label="Seleccionar sucursal" value={selected} disabled={waiting} style={{ colorScheme: dark ? 'dark' : 'light' }} onChange={event => onChange(event.target.value)} className={cn('min-h-11 py-2', dark && 'border-sidebar-muted bg-sidebar text-white focus:bg-sidebar focus:text-white focus-visible:outline-sidebar-glow disabled:bg-sidebar disabled:text-sidebar-muted [&>option]:bg-sidebar [&>option]:text-white')}>
    {waiting && <option value="">Cargando sedes…</option>}
    <option value="global">Vista global · solo lectura</option>
    {active.map(branch => <option key={branch.id} value={branch.id}>{branchLabel(branch)}</option>)}
  </Select>;
  return <label className={cn('grid min-w-0 gap-2 text-xs font-medium', dark ? 'text-sidebar-muted' : 'text-muted',
    compact && 'app-mobile-branch-label grid-cols-[auto_minmax(0,1fr)] items-center [&>[role=status]]:col-span-full')}>
    <span className="flex items-center gap-1.5"><MapPin aria-hidden="true" className="size-3.5 shrink-0" />{compact ? 'Sucursal' : 'Sucursal activa'}</span>
    {compact ? <span className="app-mobile-branch grid min-w-0 grid-cols-[minmax(0,1fr)]">
      {select}
      <span aria-hidden="true" className="pointer-events-none col-start-1 row-start-1 self-center py-1 pr-8 pl-3.5 text-sm font-semibold leading-snug text-white wrap-anywhere">
        {waiting ? 'Cargando sedes…' : selectedBranch ? branchLabel(selectedBranch) : 'Vista global · solo lectura'}
      </span>
      <ChevronDown aria-hidden="true" className="pointer-events-none col-start-1 row-start-1 mr-3 size-4 self-center justify-self-end" />
    </span> : select}
    {message && <span role="status" className="text-[11px] leading-relaxed">{message}</span>}
  </label>;
}
export default function BranchSelector({ dark = false, compact = false }) {
  const { businessBranches, activeBranchId, setActiveBranchId, branchesLoading, branchSelectionNotice } = useTenantData();
  return <BranchSelectControl branches={businessBranches} value={activeBranchId} onChange={setActiveBranchId} dark={dark} compact={compact} isLoading={branchesLoading} notice={branchSelectionNotice} />;
}
