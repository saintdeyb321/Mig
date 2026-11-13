import { useAssistedAccess } from '../core/session/AssistedAccessContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { useVisualViewport } from '../shared/ui/useVisualViewport';
import { MobileDockContext } from './MobileDockContext';

const AppLayout = memo(({ user, tab, setTab, handleLogout, children }) => {
  useVisualViewport();
  const shell = useRef(null);
  const header = useRef(null);
  const dock = useRef(null);
  const [dockSlot, setDockSlot] = useState(null);
  useLayoutEffect(() => {
    const layout = shell.current;
    const mobileHeader = header.current;
    const mobileDock = dock.current;
    const measure = () => {
      layout.style.setProperty('--app-mobile-header-height', `${mobileHeader.offsetHeight}px`);
      layout.style.setProperty('--app-mobile-dock-height', `${mobileDock.offsetHeight}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(mobileDock);
    observer.observe(mobileHeader);
    measure();
    return () => observer.disconnect();
  }, []);
  const { businessBranches = [] } = useTenantData() ?? {};
  const notifications = useAlerts(user);
  const online = useNetworkStatus();
  const assisted = useAssistedAccess();
  const fullName = useMemo(() => user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : 'Usuario del sistema', [user]);
  const assignedBranchName = useMemo(() => user?.role === 'cajero' && user?.branchId
    ? businessBranches.find(branch => branch.id === user.branchId)?.name || 'Sede desconocida' : null, [user, businessBranches]);
  const canSelectBranch = isBusinessSession(user) && user?.role === 'dueño';
  return <div ref={shell} className="app-shell min-h-dvh min-w-0 bg-canvas text-ink">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-40 focus:rounded-xl focus:bg-panel focus:p-4 focus:text-primary focus:shadow-float">Ir al contenido</a>
    <aside className="nebula-brand fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/10 text-white shadow-xl shadow-sidebar/10 lg:flex xl:w-68" aria-label="Navegación de escritorio">
      <div className="sidebar-identity shrink-0 space-y-3 px-4 pb-4 pt-5">
        <div className="flex items-center gap-3"><img src={brand.logo} alt="" className="size-9 rounded-xl bg-white object-contain p-1" /><div><p className="text-lg font-bold tracking-tight">{brand.name}</p></div></div>
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-white/10" aria-label="Conectividad y notificaciones"><NetworkBadge dark /><NotificationBell onOpenCashAudit={() => setTab('history')} user={user} {...notifications} isDesktop /></div>
        <div className="flex items-start gap-3 py-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/10"><UserRound aria-hidden="true" strokeWidth={1.85} className="size-4" /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold wrap-anywhere">{fullName}</p>
            <p className="mt-0.5 text-xs text-sidebar-muted"><span className="capitalize">{user?.role}</span>{online && assisted && <span role="status"> · Acceso en revisión</span>}</p>
          </div>
        </div>
        {canSelectBranch && <BranchSelector dark />}
        {assignedBranchName && <p className="flex items-center gap-2 text-xs text-sidebar-muted"><MapPin aria-hidden="true" strokeWidth={1.85} className="size-4 shrink-0" />{assignedBranchName}</p>}
      </div>
      <div className="sidebar-scroll min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 pb-4 focus-visible:outline-2 focus-visible:outline-focus" tabIndex={0} role="region" aria-label="Lista de módulos"><p className="px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-muted">Espacio de trabajo</p><BottomNav current={tab} setCurrent={setTab} user={user} isDesktop /></div>
      <div className="sidebar-footer shrink-0 border-t border-white/10 p-4">
        <Button variant="ghost" className="w-full justify-start text-sidebar-muted hover:bg-white/10 hover:text-white" onClick={handleLogout}><LogOut aria-hidden="true" strokeWidth={1.85} />Cerrar sesión</Button>
      </div>
    </aside>
    <div className="app-workspace flex min-h-dvh min-w-0 flex-col lg:pl-64 xl:pl-68">
      <header ref={header} className="app-mobile-header nebula-brand sticky top-0 z-20 grid gap-2 border-b border-white/15 text-white shadow-card lg:hidden">
        <div className="app-mobile-header-row flex min-w-0 items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2">
          <img src={brand.logo} alt="" className="size-[32px] shrink-0 rounded-lg bg-panel object-contain p-0.5" />
          <div className="min-w-0 leading-tight">
            <span className="font-bold tracking-tight wrap-anywhere">{brand.name}</span>
            {online && assisted && <span role="status" className="block text-xs text-sidebar-muted">En revisión</span>}
          </div>
        </div>
          <div className="flex shrink-0 items-center gap-1">
            <NetworkBadge dark compact />
            <NotificationBell dark onOpenCashAudit={() => setTab('history')} user={user} {...notifications} />
            <IconButton label="Cerrar sesión" className="text-sidebar-muted hover:bg-white/10 hover:text-white" onClick={handleLogout}><LogOut aria-hidden="true" strokeWidth={1.85} /></IconButton>
          </div>
        </div>
        {canSelectBranch && <BranchSelector dark compact />}
        {assignedBranchName && <Badge className="max-w-full justify-self-start bg-white/10 whitespace-normal text-white"><MapPin aria-hidden="true" strokeWidth={1.85} className="size-3 shrink-0" />{assignedBranchName}</Badge>}
      </header>
      <main id="main-content" tabIndex={-1} className="app-main mx-auto w-full min-w-0 max-w-[1680px] flex-1 space-y-6 px-3 pt-4 sm:px-6 lg:p-6 xl:p-8">
        {!online && <p role="status" className="rounded-xl border border-warning/20 bg-warning-soft px-4 py-3 text-sm text-warning">Trabajando sin conexión. Los pendientes del dispositivo se conservan. Puedes consultar datos locales; las operaciones online siguen bloqueadas.</p>}
        <MobileDockContext.Provider value={dockSlot}>{children}</MobileDockContext.Provider>
      </main>
    </div>
    <div ref={dock} className="app-mobile-dock fixed inset-x-0 bottom-0 z-30 lg:hidden">
      <div ref={setDockSlot} className="app-mobile-dock-slot empty:hidden" />
      <div className="app-bottom-nav nebula-brand border-t border-white/15 text-white shadow-[0_-4px_24px_rgb(33_26_67/0.16)]"><BottomNav current={tab} setCurrent={setTab} user={user} isDesktop={false} /></div>
    </div>
  </div>;
});
export default AppLayout;
