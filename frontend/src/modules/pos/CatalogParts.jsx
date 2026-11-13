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
  return <div className="responsive-filter-rail ui-scroll flex min-w-0 max-w-full gap-2 overflow-x-auto px-1 py-2" role="group" aria-label="Filtrar por categoría" tabIndex={0}>
    <Button size="sm" variant={selected==='todas'?'primary':'secondary'} aria-pressed={selected==='todas'} onClick={()=>onSelect('todas')} className="rounded-full max-lg:min-h-11">Todos</Button>
    {categories?.map(category=><Button key={category.id} size="sm" variant={selected===category.name?'primary':'secondary'} aria-pressed={selected===category.name} onClick={()=>onSelect(category.name)} className="max-w-[85%] rounded-full max-lg:min-h-11">{category.name}</Button>)}
  </div>;
}
export const ProductCard=memo(({ product, stock, disabled, onAdd })=>{
  const unavailable=stock<=0;
  return <button type="button" title={product.name} disabled={unavailable||disabled} onClick={()=>onAdd(product)}
    className="pos-product-card group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel text-left shadow-card transition-[border-color,box-shadow] duration-150 hover:border-accent hover:shadow-md motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-90">
    <span className={`pos-product-image relative flex min-w-0 items-center justify-center overflow-hidden bg-subtle ${product.imageUrl?'aspect-[3/2]':'aspect-[2/1]'}`}>
      {product.imageUrl?<img src={product.imageUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />:<span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl border border-primary/15 bg-panel text-primary"><Package className="size-5" /></span>}
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-1.5 p-2.5 sm:p-3">
      <span className="text-sm font-semibold leading-snug wrap-anywhere">{product.name}</span>
      <Badge variant={unavailable?'danger':'neutral'} className="self-start text-[11px] leading-tight">{unavailable?'Agotado':`${stock} disponibles`}</Badge>
      <span className="mt-auto flex flex-wrap items-center justify-between gap-1">
        <strong className="min-w-0 text-base font-extrabold text-primary tabular-nums wrap-anywhere">S/ {Number(product.price).toFixed(2)}</strong>
        <span className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-white"><Plus aria-hidden="true" className="size-4" /></span>
      </span>
    </span>
  </button>;
});
