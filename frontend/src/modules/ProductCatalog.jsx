import { Dialog, Button, LoadingState, PageHeader, Input, FormField, Select, SearchField, Card, DialogFooter, cn, EmptyState } from "../shared/ui";
// src/modules/ProductCatalog.jsx
import React, { useCallback, memo } from 'react';
import { useProducts } from '../features/catalog/hooks/useProducts';
import { useTenantData } from '../features/branches/context/TenantContext';
import toast from 'react-hot-toast';
import { useCatalogData } from '../features/catalog/context/CatalogContext';
const getSafeStock = (product, branchId) => {
  if (!product) return 0;
  const stockObj = typeof product.stock === 'object' && product.stock !== null ? product.stock : typeof product.rawStock === 'object' && product.rawStock !== null ? product.rawStock : null;
  if (stockObj) {
    if (branchId === 'global') {
      return Object.values(stockObj).reduce((sum, val) => sum + (Number(val) || 0), 0);
    }
    return Number(stockObj[branchId] || 0);
  }
  return branchId === 'global' ? Number(product.stock || 0) : 0;
};
const ProductCard = memo(({
  p,
  activeBranchId,
  openEditForm,
  isLoading
}) => {
  const currentStock = getSafeStock(p, activeBranchId);
  const isAgotado = currentStock <= 0;
  const isPoco = currentStock > 0 && currentStock <= 10;
  const isActivo = p.status === 'activo';
  let cardClasses = `grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] animate-enter motion-reduce:animate-none ${isActivo ? '' : "opacity-65"} `;
  if (isActivo) {
    cardClasses += isAgotado ? " border-l-4 border-l-danger" : " border-l-4 border-l-success";
  } else {
    cardClasses += " border-l-4 border-l-muted";
  }
  const stockClass = "rounded-md px-2 py-1 text-xs font-semibold " + (isAgotado ? "bg-danger-soft text-danger" : isPoco ? "bg-warning-soft text-warning" : "bg-subtle text-muted");
  const stockText = isAgotado ? 'AGOTADO' : isPoco ? `¡Solo ${currentStock}!` : `${currentStock} disp.`;
  return <Card className={cn(cardClasses)} as="div">
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-primary-soft [&>img]:size-full [&>img]:object-cover sm:size-14">
        {p.imageUrl ? <img src={p.imageUrl} alt={p.name} loading="lazy" /> : <span className="text-xl font-bold text-primary">{p.name.charAt(0)}</span>}
      </div>

      <div className="grid min-w-0 gap-1.5">
        <h3 className={cn(`break-words font-semibold ${isAgotado ? "text-danger line-through" : ''} `)}>{p.name}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-subtle px-2 py-1 text-xs font-medium text-muted">{p.category}</span>
          <span className={cn(stockClass)}>📦 {stockText}</span>
          {!isActivo && <span className="text-xs font-semibold text-danger">INACTIVO</span>}
        </div>
      </div>

      <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 sm:col-span-1 sm:border-0 sm:pt-0">
        <span className="text-lg font-bold text-primary">S/ {Number(p.price).toFixed(2)}</span>
        <Button onClick={() => openEditForm(p)} disabled={isLoading} className="size-11 shrink-0 p-2" title="Editar" type="button" variant="ghost" aria-label="Editar">✏️</Button>
      </div>
    </Card>;
});
function ProductCatalog({
  user
}) {
  const {
    activeBranchId
  } = useTenantData();
  const {
    products: globalProducts
  } = useCatalogData();
  const {
    categories,
    businessBranches,
    isLoading,
    searchTerm,
    setSearchTerm,
    showFormModal,
    setShowFormModal,
    showInactive,
    setShowInactive,
    name,
    setName,
    price,
    setPrice,
    category,
    setCategory,
    status,
    setStatus,
    editing,
    branchStocks,
    setBranchStocks,
    imageUrl,
    setImageUrl,
    filteredProducts,
    openAddForm,
    openEditForm,
    handleSave
  } = useProducts(user);
  const handleImageUpload = useCallback(e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecciona una imagen válida.');
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = event => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 200;
        const MAX_HEIGHT = 200;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        setImageUrl(compressedBase64);
      };
    };
  }, [setImageUrl]);
  const currentEditingProduct = editing ? globalProducts.find(p => p.id === editing) : null;
  if (isLoading && !showFormModal) {
    return <LoadingState>Cargando inventario...</LoadingState>;
  }
  return <div className="animate-enter motion-reduce:animate-none mx-auto min-w-0 space-y-5 pb-6 w-full max-w-6xl">

      <PageHeader className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex min-w-0 items-center gap-3 text-xl font-bold tracking-tight sm:text-2xl">
          <span className="text-2xl">☕</span>
          <span className="break-words">Productos</span>
        </h1>

        <Button onClick={openAddForm} className="shrink-0" type="button" variant="primary">
          ➕ Nuevo Producto
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <SearchField type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar producto..." onClear={() => setSearchTerm('')} className="basis-full sm:basis-56" />

        <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-sm font-medium text-muted">
          <Input type="checkbox" className="shrink-0" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Ver archivados
        </label>
      </div>

      <h3 className="text-sm font-semibold text-muted">
        Inventario {activeBranchId === 'global' ? 'Global' : 'de la Sede'} ({filteredProducts.length})
      </h3>

      <div className="grid gap-3">
        {filteredProducts.length === 0 ? <EmptyState title="Sin registros" description={<>
              {searchTerm ? `No se encontraron productos para "${searchTerm}"` : 'Aún no tienes productos.'}
            </>} /> : filteredProducts.map(p => <ProductCard key={p.id} p={p} activeBranchId={activeBranchId} openEditForm={openEditForm} isLoading={isLoading} />)}
      </div>

      {showFormModal && <Dialog title={<>
              {editing ? '✏️ Editar Producto' : '📦 Nuevo Producto'}
            </>} busy={isLoading} className="max-w-lg" onClose={() => setShowFormModal(false)}>

            <form onSubmit={handleSave} className="grid gap-4">

              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-line bg-subtle p-4">
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-panel">
                  {imageUrl ? <img src={imageUrl} alt="Preview" className="size-full object-cover" /> : <span className="text-3xl text-muted">📷</span>}
                </div>

                <FormField className="grid min-w-0 flex-1 gap-2" label={<>FOTO DEL PRODUCTO (Opcional)</>}>

                  <Input type="file" id="product-img" accept="image/*" onChange={handleImageUpload} disabled={isLoading} className="hidden" />

                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="product-img" className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-panel px-3 text-sm font-medium hover:bg-subtle">
                       {imageUrl ? '🔄 Cambiar' : '📁 Seleccionar archivo'}
                    </label>

                    {imageUrl && <Button type="button" onClick={() => setImageUrl('')} title="Eliminar foto" variant="danger">
                        🗑️ Quitar
                      </Button>}
                  </div>
                </FormField>
              </div>

              <FormField label={<>NOMBRE</>}>

                <Input autoFocus value={name} onChange={e => setName(e.target.value)} required disabled={isLoading} maxLength="100" pattern=".*\S+.*" />
              </FormField>

              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <FormField label={<>PRECIO (S/)</>}>

                  <Input value={price} onChange={e => setPrice(e.target.value)} type="number" step="0.01" min="0" required disabled={isLoading} className="font-bold text-primary" />
                </FormField>
                <FormField label={<>CATEGORÍA</>}>

                  <Select value={category} onChange={e => setCategory(e.target.value)} required disabled={isLoading}>
                    <option value="" disabled>Selecciona...</option>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </Select>
                </FormField>
              </div>

              <div className="space-y-4 rounded-xl border border-line bg-subtle p-4">
                <label className="text-sm font-semibold text-primary">
                  <span>📦</span> DISTRIBUCIÓN DE INVENTARIO
                </label>

                {businessBranches.length === 0 ? <p className="text-sm text-danger">
                    ⚠️ No tienes sucursales creadas. Ve a Configuración para crearlas.
                  </p> : <div className="flex flex-col">

                    <div className="flex justify-between gap-3 border-b border-line pb-2">
                      <span className="text-xs font-semibold text-muted">SUCURSAL</span>
                      <span className="text-xs font-semibold text-muted w-24 shrink-0 text-center">
                        {editing ? 'AJUSTAR STOCK' : 'STOCK INICIAL'}
                      </span>
                    </div>

                    {businessBranches.map(branch => {
              const stockActual = getSafeStock(currentEditingProduct, branch.id);
              const ajusteInput = branchStocks[branch.id];
              const ajusteNumerico = Number(ajusteInput);
              const delta = isNaN(ajusteNumerico) ? 0 : Math.floor(ajusteNumerico);
              const stockFinal = Math.max(0, stockActual + delta);
              const historyText = currentEditingProduct?.lastStockHistory?.[branch.id];
              return <div key={branch.id} className="flex items-center justify-between gap-3 border-b border-dashed border-line py-4 last:border-0">

                          <div className="grid min-w-0 flex-1 gap-1">
                            <span className="break-words text-sm font-semibold">
                              {branch.name.toUpperCase()}
                            </span>
                            {editing && <div className="flex flex-col gap-0.5">
                                <span className="text-xs text-muted block">
                                  En almacén: <span className="font-semibold text-ink">{stockActual}</span> uds.
                                </span>

                                {historyText && <span className="text-sm text-success font-bold">
                                    Último mov: {historyText}
                                  </span>}
                              </div>}
                          </div>

                          <div className="relative w-24 shrink-0 pb-5">

                            <Input type="number" value={ajusteInput !== undefined ? ajusteInput : ''} onChange={e => {
                    setBranchStocks(prev => ({
                      ...prev,
                      [branch.id]: e.target.value
                    }));
                  }} placeholder={editing ? "Ej: 10, -5" : "0"} disabled={isLoading} className={cn(`text-center font-semibold ${delta > 0 ? "border-success" : delta < 0 ? "border-danger" : ''} `)} aria-label={editing ? "Ej: 10, -5" : "0"} />

                            {editing && ajusteInput !== undefined && ajusteInput !== '' && !isNaN(ajusteNumerico) && delta !== 0 && <span className={cn(`absolute inset-x-0 bottom-0 text-center text-xs font-medium ${delta > 0 ? "text-success" : "text-danger"} `)}>
                                ➔ {stockFinal} uds.
                              </span>}
                          </div>

                        </div>;
            })}

                  </div>}
                {editing && <div className="rounded-xl border border-primary/20 bg-primary-soft p-3">
                    <p className="text-xs leading-relaxed text-primary">
                      <strong>Tip:</strong> Usa números positivos (ej: <b>10</b>) para agregar stock, o negativos (ej: <b>-5</b>) para retirarlo.
                    </p>
                  </div>}
              </div>

              <FormField label={<>ESTADO DEL PRODUCTO</>}>

                <Select value={status} onChange={e => setStatus(e.target.value)} disabled={isLoading}>
                  <option value="activo">🟢 Activo y Visible</option>
                  <option value="inactivo">🔴 Inactivo (Oculto)</option>
                </Select>
              </FormField>

              <DialogFooter>
                <Button type="button" onClick={() => setShowFormModal(false)} disabled={isLoading} variant="secondary">
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1" disabled={isLoading || businessBranches.length === 0} variant="primary">
                  {isLoading ? 'Guardando...' : 'Guardar Producto'}
                </Button>
              </DialogFooter>
            </form>

          </Dialog>}
    </div>;
}
export default ProductCatalog;
