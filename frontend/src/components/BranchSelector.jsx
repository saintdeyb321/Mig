import { operationalBranches } from '../features/branches/domain/branchPolicy';
import { MapPin } from 'lucide-react';
import { useTenantData } from '../features/branches/context/TenantContext';
import { Select, cn } from '../shared/ui';

export function BranchSelectControl({ branches, value, onChange, dark = false, isLoading = false, notice }) {
  const active = operationalBranches(branches);
  const waiting = isLoading && !active.length;
  const unavailable = value && value !== 'global' && !active.some(branch => branch.id === value);
  const selected = waiting ? '' : value === 'global' || active.some(branch => branch.id === value) ? value : 'global';
  const message = !waiting && !active.length ? 'No hay sedes operativas disponibles.' : notice || (unavailable && !waiting ? 'Sede no disponible. Se muestra la vista global de consulta.' : null);
  return <label className={cn('grid min-w-0 gap-2 text-xs font-medium', dark ? 'text-sidebar-muted' : 'text-muted')}>
    <span className="flex items-center gap-1.5"><MapPin aria-hidden="true" className="size-3.5" />Sucursal activa</span>
    <Select aria-label="Seleccionar sucursal" value={selected} disabled={waiting} style={{ colorScheme: dark ? 'dark' : 'light' }} onChange={event => onChange(event.target.value)} className={cn('min-h-11 py-2 text-sm', dark && 'border-white/20 bg-sidebar text-white focus:bg-sidebar focus:text-white disabled:bg-sidebar disabled:text-sidebar-muted [&>option]:bg-sidebar [&>option]:text-white')}>
      {waiting && <option value="">Cargando sedes…</option>}
      <option value="global">Vista global · solo lectura</option>
      {active.map(branch => <option key={branch.id} value={branch.id}>{branch.name?.trim() || `Sede ${branch.id}`}</option>)}
    </Select>
    {message && <span role="status" className="text-[11px] leading-relaxed">{message}</span>}
  </label>;
}
export default function BranchSelector({ dark = false }) {
  const { businessBranches, activeBranchId, setActiveBranchId, branchesLoading, branchSelectionNotice } = useTenantData();
  return <BranchSelectControl branches={businessBranches} value={activeBranchId} onChange={setActiveBranchId} dark={dark} isLoading={branchesLoading} notice={branchSelectionNotice} />;
}
