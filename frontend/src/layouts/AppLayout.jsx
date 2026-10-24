import { memo, useMemo } from 'react';
import { LogOut, MapPin, UserRound } from 'lucide-react';
import { brand } from '../config/brand';
import BottomNav from '../BottomNav';
import NetworkBadge from '../components/NetworkBadge';
import BranchSelector from '../components/BranchSelector';
import { NotificationBell } from '../components/NotificationBell';
import { useTenantData } from '../features/branches/context/TenantContext';
import { useAlerts } from '../features/notifications/hooks/useAlerts';
import { isBusinessSession } from '../core/session/context.js';
import { Badge, Button, IconButton } from '../shared/ui';

const AppLayout = memo(({ user, tab, setTab, handleLogout, children }) => {
  const { businessBranches = [] } = useTenantData() ?? {};
  const notifications = useAlerts(user);
  const fullName = useMemo(() => user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : 'Usuario del sistema', [user]);
  const assignedBranchName = useMemo(() => user?.role === 'cajero' && user?.branchId
    ? businessBranches.find(branch => branch.id === user.branchId)?.name || 'Sede desconocida' : null, [user, businessBranches]);
  const canSelectBranch = isBusinessSession(user) && user?.role === 'dueño';
  return <div className="min-h-dvh min-w-0 bg-canvas text-ink">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-white/5 bg-sidebar text-white lg:flex xl:w-64" aria-label="Navegación de escritorio">
      <div className="space-y-6 px-5 pb-5 pt-7">
        <div className="flex items-center gap-3"><img src={brand.logo} alt="" className="size-10 rounded-xl bg-white object-contain p-1" /><div><p className="text-xl font-bold tracking-tight">{brand.name}</p><p className="text-xs text-sidebar-muted">Tu negocio, en orden</p></div></div>
        <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <span className="rounded-lg bg-white/10 p-2"><UserRound className="size-4" /></span>
          <div className="min-w-0"><p className="truncate text-sm font-semibold" title={fullName}>{fullName}</p><p className="mt-0.5 text-xs capitalize text-sidebar-muted">{user?.role}</p></div>
        </div>
        {canSelectBranch && <BranchSelector dark />}
        {assignedBranchName && <p className="flex items-center gap-2 text-xs text-sidebar-muted"><MapPin className="size-4 shrink-0" />{assignedBranchName}</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3"><BottomNav current={tab} setCurrent={setTab} user={user} isDesktop /></div>
      <div className="space-y-3 border-t border-white/10 p-4"><div className="flex items-center justify-between"><NetworkBadge /><NotificationBell {...notifications} isDesktop /></div>
        <Button variant="ghost" className="w-full justify-start text-sidebar-muted hover:bg-white/10 hover:text-white" onClick={handleLogout}><LogOut />Cerrar sesión</Button>
      </div>
    </aside>
    <div className="min-w-0 lg:pl-60 xl:pl-64">
      <header className="sticky top-0 z-20 space-y-3 border-b border-line bg-panel/95 px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><img src={brand.logo} alt="" className="size-8 rounded-lg object-contain" /><span className="font-bold tracking-tight">{brand.name}</span></div>
          <div className="flex shrink-0 items-center gap-1"><NetworkBadge /><NotificationBell {...notifications} /><IconButton label="Cerrar sesión" onClick={handleLogout}><LogOut /></IconButton></div>
        </div>
        {canSelectBranch && <BranchSelector />}
        {assignedBranchName && <Badge><MapPin className="size-3" />{assignedBranchName}</Badge>}
      </header>
      <main id="main-content" className="mx-auto min-w-0 max-w-[1680px] space-y-6 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:p-7 xl:p-9">{children}</main>
    </div>
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] lg:hidden"><BottomNav current={tab} setCurrent={setTab} user={user} isDesktop={false} /></div>
  </div>;
});
export default AppLayout;
