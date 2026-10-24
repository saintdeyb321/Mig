import { operationalBranches } from '../features/branches/domain/branchPolicy';
import { MapPin } from 'lucide-react';
import { useTenantData } from '../features/branches/context/TenantContext';
import { Select, cn } from '../shared/ui';

export function BranchSelectControl({ branches, value, onChange, dark }) {
  const active = operationalBranches(branches);
  const selected = value === 'global' || active.some(branch => branch.id === value) ? value : '';
  return <label className={cn('grid gap-1.5 text-xs font-medium',dark?'text-sidebar-muted':'text-muted')}>
    <span className="flex items-center gap-1.5"><MapPin className="size-3.5" />Sucursal activa</span>
    <Select aria-label="Seleccionar sucursal" value={selected} disabled={!active.length} style={{ colorScheme: dark ? 'dark' : 'light' }} onChange={event=>onChange(event.target.value)} className={cn('min-h-11 py-2 text-sm',dark&&'border-white/20 bg-sidebar text-white [&>option]:bg-sidebar [&>option]:text-white')}>
      <option value="" disabled>{active.length ? 'Selecciona una sede' : 'Sin sedes operativas verificadas'}</option>
      <option value="global">Vista global · solo lectura</option>
      {active.map(branch=><option key={branch.id} value={branch.id}>{branch.name}{branch.status?.toLowerCase()==='inactivo'?' (Inactiva)':''}</option>)}
    </Select>
  </label>;
}
export default function BranchSelector({ dark=false }) {
  const {businessBranches,activeBranchId,setActiveBranchId}=useTenantData();
  return <BranchSelectControl branches={businessBranches} value={activeBranchId} onChange={setActiveBranchId} dark={dark} />;
}
