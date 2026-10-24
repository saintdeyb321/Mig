import FirestoreQueryError from '../components/FirestoreQueryError';
import { useCatalogData } from '../features/catalog/context/CatalogContext';
import { Tags } from 'lucide-react';
import { Dialog, cn, Button, LoadingState, PageHeader, Input, FormField, Select, Badge, SearchField, Card, DialogFooter, EmptyState } from "../shared/ui";
// src/modules/CategoryManager.jsx
import React, { memo } from 'react';
import { useCategories } from '../features/catalog/hooks/useCategories';
// Esta tarjeta solo se redibujará si su nombre o estado cambian en Firebase.
// Escribir en la barra de búsqueda ya NO afectará a las categorías que no coincidan.
const CategoryCard = memo(({
  c,
  openEditForm,
  isLoading
}) => {
  const isInactive = c.status === 'inactivo';

  // Reutilizamos el estilo de las tarjetas de productos
  let cardClasses = `grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] p-4 sm:p-4 animate-enter motion-reduce:animate-none ${isInactive ? "opacity-65 border-l-4 border-l-muted" : ''} `;
  return <Card className={cn(cardClasses, !isInactive ? "border-l-4 border-l-primary" : "")} as="div">

      {/* 1. ICONO */}
      <div className={cn("flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-primary-soft [&>img]:size-full [&>img]:object-cover sm:size-14", isInactive ? "bg-subtle" : "bg-primary-soft")}>
        <span className={cn("text-2xl", isInactive ? "opacity-40" : "opacity-100")}>🏷️</span>
      </div>

      {/* 2. INFO (Nombre y Estado) */}
      <div className="grid min-w-0 gap-1.5">
        <h3 className={cn(`break-words font-semibold ${isInactive ? "text-danger line-through" : ''} `)}>
          {c.name}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn(isInactive ? "bg-danger-soft" : "bg-success-soft", isInactive ? "text-danger" : "text-success")}>
            {isInactive ? '🔴 INACTIVA' : '🟢 ACTIVA'}
          </Badge>
        </div>
      </div>

      {/* 3. ACCIÓN (Botón Editar) */}
      <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 sm:col-span-1 sm:border-0 sm:pt-0">
        <Button onClick={() => openEditForm(c)} disabled={isLoading} className="size-11 shrink-0 p-2 bg-subtle min-h-11 min-w-11 flex items-center justify-center" title="Editar" type="button" variant="ghost" aria-label="Editar">
          ✏️
        </Button>
      </div>

    </Card>;
});

// Componente Principal
function CategoryManager({
  user
}) {
  const {
    isLoading,
    searchTerm,
    setSearchTerm,
    showFormModal,
    setShowFormModal,
    name,
    setName,
    status,
    setStatus,
    editing,
    showInactive,
    setShowInactive,
    filteredCategories,
    openAddForm,
    openEditForm,
    handleSave
  } = useCategories(user);
  const { error: catalogError, retry: retryCatalog } = useCatalogData();
  if (isLoading && !showFormModal) {
    return <LoadingState>Organizando categorías...</LoadingState>;
  }
  return <div className="animate-enter motion-reduce:animate-none mx-auto min-w-0 space-y-5 pb-6 w-full max-w-6xl">

      {/* HEADER REFACTORIZADO */}
      <PageHeader title="Categorías" icon={Tags} eyebrow="Organización" description="Un catálogo claro para encontrar cada producto." actions={<><Button onClick={openAddForm} className="shrink-0" type="button" variant="primary">
          ➕ Nueva Categoria
        </Button></>} />

      {/* BARRA DE BÚSQUEDA Y TOGGLE */}
      <FirestoreQueryError error={catalogError} area="catalog" user={user} onRetry={retryCatalog} />
      <div className="flex flex-wrap items-center gap-3">
        <SearchField type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar categoría por nombre..." onClear={() => setSearchTerm('')} className="basis-full sm:basis-56" />

        <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-sm font-medium text-muted">
          <Input type="checkbox" className="shrink-0" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Ver archivados
        </label>
      </div>

      <h3 className="text-xs font-bold uppercase tracking-wide text-muted">
        Lista de Categorías ({filteredCategories.length})
      </h3>

      <div className="grid gap-3 xl:grid-cols-2">
        {filteredCategories.length === 0 && catalogError ? null : filteredCategories.length === 0 ? <EmptyState title="Sin registros" description={<>
              {searchTerm ? `No se encontraron resultados para "${searchTerm}"` : 'Aún no has registrado ninguna categoría.'}
            </>} /> : filteredCategories.map(c => (/* 🚀 Invocamos la tarjeta blindada */
      <CategoryCard key={c.id} c={c} openEditForm={openEditForm} isLoading={isLoading} />))}
      </div>

      {/* MODAL FORMULARIO LIMPIO */}
      {showFormModal && <Dialog title={<>
              {editing ? '✏️ Editar Categoría' : '➕ Nueva Categoría'}
            </>} busy={isLoading} className="max-w-lg" onClose={() => setShowFormModal(false)}>

            <form onSubmit={handleSave} className="grid gap-4">
              <FormField label={<>NOMBRE</>}>

                <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Panes, Postres..." required disabled={isLoading} />
              </FormField>

              <FormField label={<>ESTADO</>}>

                <Select value={status} onChange={e => setStatus(e.target.value)} disabled={isLoading}>
                  <option value="activo">🟢 Activo</option>
                  <option value="inactivo">🔴 Inactivo</option>
                </Select>
              </FormField>

              <DialogFooter>
                <Button type="button" onClick={() => setShowFormModal(false)} disabled={isLoading} variant="secondary">
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1" disabled={isLoading} variant="primary">
                  {isLoading ? 'Guardando...' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </Dialog>}

    </div>;
}
export default CategoryManager;
