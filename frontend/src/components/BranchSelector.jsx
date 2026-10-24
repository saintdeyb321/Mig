import { MapPin } from 'lucide-react';
import { useTenantData } from '../features/branches/context/TenantContext';
import { Select, cn } from '../shared/ui';

export function BranchSelectControl({ branches, value, onChange, dark }) {
  if (!branches || branches.length<=1) return null;
  return <label className={cn('grid gap-1.5 text-xs font-medium',dark?'text-sidebar-muted':'text-muted')}>
    <span className="flex items-center gap-1.5"><MapPin className="size-3.5" />Sucursal activa</span>
    <Select aria-label="Seleccionar sucursal" value={value||''} onChange={event=>onChange(event.target.value)} className={cn('min-h-10 py-2 text-xs',dark&&'border-white/15 bg-white/7 text-white [&>option]:bg-sidebar')}>
      <option value="global">Vista global · solo lectura</option>
      {branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name}{branch.status?.toLowerCase()==='inactivo'?' (Inactiva)':''}</option>)}
    </Select>
  </label>;
}
export default function BranchSelector({ dark=false }) {
  const {businessBranches,activeBranchId,setActiveBranchId}=useTenantData();
  return <BranchSelectControl branches={businessBranches} value={activeBranchId} onChange={setActiveBranchId} dark={dark} />;
}
