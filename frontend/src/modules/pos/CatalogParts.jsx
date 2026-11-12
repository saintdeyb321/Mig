import { memo } from 'react';
import { Package, Plus, Search, X } from 'lucide-react';
import { Badge, Button, IconButton, Input } from '../../shared/ui';

export function ProductSearch({ value, onChange }) {
  return <div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted" />
    <Input aria-label="Buscar productos" placeholder="Busca un producto…" value={value} onChange={event=>onChange(event.target.value)} className="min-h-12 border-primary/15 bg-panel pl-10 pr-11 shadow-card" />
    {value&&<IconButton label="Limpiar búsqueda" onClick={()=>onChange('')} className="absolute right-1 top-0.5"><X /></IconButton>}
  </div>;
}
export function CategoryFilters({ categories, selected, onSelect }) {
  return <div className="ui-scroll flex max-w-full gap-2 overflow-x-auto px-0.5 py-2" role="group" aria-label="Filtrar por categoría">
    <Button size="sm" variant={selected==='todas'?'primary':'secondary'} aria-pressed={selected==='todas'} onClick={()=>onSelect('todas')} className="rounded-full">Todos</Button>
    {categories?.map(category=><Button key={category.id} size="sm" variant={selected===category.name?'primary':'secondary'} aria-pressed={selected===category.name} onClick={()=>onSelect(category.name)} className="rounded-full">{category.name}</Button>)}
  </div>;
}
export const ProductCard=memo(({ product, stock, disabled, onAdd })=>{
  const unavailable=stock<=0;
  return <button type="button" title={product.name} disabled={unavailable||disabled} onClick={()=>onAdd(product)}
    className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel text-left shadow-card transition-[border-color,box-shadow] duration-150 hover:border-accent hover:shadow-md motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-90">
    <span className={`relative flex items-center justify-center overflow-hidden bg-subtle ${product.imageUrl?'aspect-[3/2]':'aspect-[2/1]'}`}>
      {product.imageUrl?<img src={product.imageUrl} alt={product.name} loading="lazy" className="size-full object-cover" />:<span aria-hidden="true" className="flex size-12 items-center justify-center rounded-2xl border border-primary/15 bg-panel text-primary"><Package className="size-6" /></span>}
      <span className="absolute bottom-2 left-2"><Badge variant={unavailable?'danger':'neutral'} className="border border-white/60 bg-panel/95 text-[10px] shadow-xs">{unavailable?'Agotado':`${stock} disponibles`}</Badge></span>
    </span>
    <span className="flex flex-1 flex-col gap-2 p-3 sm:p-4"><span className="line-clamp-2 text-sm font-semibold leading-snug">{product.name}</span><span className="mt-auto flex items-center justify-between gap-1"><strong className="text-base font-extrabold text-primary tabular-nums">S/ {Number(product.price).toFixed(2)}</strong><span className="flex size-8 items-center justify-center rounded-xl bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-white"><Plus aria-hidden="true" className="size-4" /></span></span></span>
  </button>;
});
