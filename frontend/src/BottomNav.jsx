import { memo, useMemo } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Boxes, Building2, ChartColumnIncreasing, Check, ClipboardList, Ellipsis, ReceiptText, Settings2, ShoppingCart, Tags, UsersRound } from 'lucide-react';
import { getSessionModules } from './core/session/context.js';
import { cn } from './shared/ui';

const items = [
  {id:'pos',label:'Punto de venta',icon:ShoppingCart}, {id:'contracts',label:'Contratos',icon:ClipboardList},
  {id:'history',label:'Historial',icon:ReceiptText},
  {id:'products',label:'Productos',icon:Boxes}, {id:'categories',label:'Categorías',icon:Tags},
  {id:'reports',label:'Reportes',icon:ChartColumnIncreasing}, {id:'users',label:'Personal',icon:UsersRound},
  {id:'settings',label:'Ajustes',icon:Settings2}, {id:'superadmin',label:'SaaS Admin',icon:Building2},
];
const BottomNav = memo(({ current, setCurrent, user, isDesktop }) => {
  const visible = useMemo(() => { const allowed=getSessionModules(user); return items.filter(item=>allowed.includes(item.id)); }, [user]);
  const main = visible.filter(item=>['pos','contracts','history'].includes(item.id));
  const primary = main.length ? main : visible.slice(0,3);
  const secondary = visible.filter(item=>!primary.includes(item));
  const renderItem = ({ id, label, icon: Icon }) => {
    const active = current === id;
    return <button key={id} type="button" aria-current={active ? 'page' : undefined} onClick={() => setCurrent(id)} title={label}
      className={cn('group flex min-h-11 min-w-0 items-center rounded-xl font-medium focus-visible:outline-2 focus-visible:outline-focus motion-safe:transition-colors',
        isDesktop ? 'gap-2.5 border px-2.5 py-1.5 text-sm focus-visible:outline-sidebar-glow' : 'flex-1 flex-col justify-center gap-1 px-1 py-1.5 text-xs',
        isDesktop && (active ? 'border-white/25 bg-white/12 font-semibold text-white' : 'border-transparent text-sidebar-muted hover:bg-white/7 hover:text-white'),
        !isDesktop && (active ? 'bg-primary-soft/60 font-semibold text-primary' : 'text-muted hover:bg-subtle'))}>
      <span className={cn('grid shrink-0 place-items-center', isDesktop ? 'size-8 rounded-lg' : 'h-6 min-w-8 rounded-full',
        isDesktop && (active ? 'bg-white/15 text-white' : 'bg-white/6 text-sidebar-muted group-hover:text-white'),
        !isDesktop && active && 'bg-primary-soft text-primary')}>
        <Icon aria-hidden="true" strokeWidth={active ? 2.25 : 1.85} className="size-[1.125rem]" />
      </span>
      <span className={cn('wrap-anywhere', isDesktop ? 'text-left' : 'text-center')}>{label}</span>
    </button>;
  };
  return <nav aria-label={isDesktop?'Módulos':'Navegación principal'} className={isDesktop?'grid gap-1':'flex min-h-16 items-stretch justify-around gap-1 px-2 py-1'}>
    {(isDesktop?visible:primary).map(renderItem)}
    {!isDesktop && secondary.length>0 && <DropdownMenu.Root><DropdownMenu.Trigger className={cn('flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold outline-offset-[-4px]',secondary.some(item=>item.id===current)?'bg-primary-soft/60 text-primary':'text-muted hover:bg-subtle')}><span className="grid h-6 place-items-center"><Ellipsis aria-hidden="true" className="size-5" /></span>Más</DropdownMenu.Trigger>
      <DropdownMenu.Portal><DropdownMenu.Content side="top" align="end" sideOffset={10} className="ui-scroll z-50 mb-1 max-h-[min(70dvh,var(--radix-dropdown-menu-content-available-height))] w-64 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl border border-line bg-panel p-2 shadow-float">
        <DropdownMenu.Label className="px-3 py-2 text-xs font-semibold text-muted">Más herramientas</DropdownMenu.Label>
        {secondary.map(({ id, label, icon: Icon }) => <DropdownMenu.Item key={id} onSelect={() => setCurrent(id)} aria-current={current === id ? 'page' : undefined} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-primary-soft data-[highlighted]:text-primary">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-soft/65 text-primary"><Icon aria-hidden="true" strokeWidth={1.85} className="size-4" /></span>{label}{current === id && <Check aria-hidden="true" className="ml-auto size-4 text-primary" />}
        </DropdownMenu.Item>)}
      </DropdownMenu.Content></DropdownMenu.Portal>
    </DropdownMenu.Root>}
  </nav>;
});
export default BottomNav;
