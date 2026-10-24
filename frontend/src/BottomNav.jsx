import { memo, useMemo } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ShoppingBag, CakeSlice, History, ContactRound, Package, Tags, ChartNoAxesCombined, UsersRound, Settings2, Building2, Ellipsis, Check } from 'lucide-react';
import { getSessionModules } from './core/session/context.js';
import { cn } from './shared/ui';

const items = [
  {id:'pos',label:'Punto de venta',icon:ShoppingBag}, {id:'contracts',label:'Contratos',icon:CakeSlice},
  {id:'history',label:'Historial',icon:History}, {id:'agenda',label:'Agenda VIP',icon:ContactRound},
  {id:'products',label:'Productos',icon:Package}, {id:'categories',label:'Categorías',icon:Tags},
  {id:'reports',label:'Reportes',icon:ChartNoAxesCombined}, {id:'users',label:'Personal',icon:UsersRound},
  {id:'settings',label:'Ajustes',icon:Settings2}, {id:'superadmin',label:'SaaS Admin',icon:Building2},
];
const BottomNav = memo(({ current, setCurrent, user, isDesktop }) => {
  const visible = useMemo(() => { const allowed=getSessionModules(user); return items.filter(item=>allowed.includes(item.id)); }, [user]);
  const main = visible.filter(item=>['pos','contracts','history'].includes(item.id));
  const primary = main.length ? main : visible.slice(0,3);
  const secondary = visible.filter(item=>!primary.includes(item));
  const renderItem = ({id,label,icon}) => { const Icon=icon; return <button key={id} type="button" aria-current={current===id?'page':undefined} onClick={()=>setCurrent(id)}
    className={cn('flex min-h-12 min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-focus',
      isDesktop ? current===id?'border border-white/15 bg-linear-to-r from-primary to-accent text-white shadow-lg shadow-black/10':'border border-transparent text-sidebar-muted hover:bg-white/7 hover:text-white' : 'relative flex-1 flex-col gap-1 rounded-xl px-1 py-2 text-[11px]',
      !isDesktop && (current===id?'bg-primary-soft text-primary':'text-muted hover:bg-subtle'))} title={label}><Icon aria-hidden="true" className="size-5 shrink-0" /><span className="truncate">{label}</span></button>; };
  return <nav aria-label={isDesktop?'Módulos':'Navegación principal'} className={isDesktop?'grid gap-1':'flex min-h-16 items-stretch justify-around gap-1 px-2 py-1'}>
    {(isDesktop?visible:primary).map(renderItem)}
    {!isDesktop && secondary.length>0 && <DropdownMenu.Root><DropdownMenu.Trigger className={cn('flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold outline-offset-[-4px]',secondary.some(item=>item.id===current)?'text-primary':'text-muted')}><Ellipsis className="size-5" />Más</DropdownMenu.Trigger>
      <DropdownMenu.Portal><DropdownMenu.Content side="top" align="end" sideOffset={10} className="z-50 mb-1 max-h-[min(70dvh,var(--radix-dropdown-menu-content-available-height))] w-64 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl border border-line bg-panel p-2 shadow-float">
        <DropdownMenu.Label className="px-3 py-2 text-xs font-semibold text-muted">Más herramientas</DropdownMenu.Label>
        {secondary.map(({id,label,icon})=>{ const Icon=icon; return <DropdownMenu.Item key={id} onSelect={()=>setCurrent(id)} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-sm text-ink outline-none data-[highlighted]:bg-primary-soft data-[highlighted]:text-primary"><Icon className="size-4" />{label}{current===id&&<Check className="ml-auto size-4" />}</DropdownMenu.Item>; })}
      </DropdownMenu.Content></DropdownMenu.Portal>
    </DropdownMenu.Root>}
  </nav>;
});
export default BottomNav;
