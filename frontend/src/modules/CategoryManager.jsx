import FirestoreQueryError from '../components/FirestoreQueryError';
import { useCatalogData } from '../features/catalog/context/CatalogContext';
import { Tags, Plus, Pencil } from 'lucide-react';
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

  return <Card as="div" className={cn(
    'category-card grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-l-4 p-3 sm:gap-3 sm:p-3',
    isInactive ? 'border-l-control' : 'border-l-stellar/65'
  )}>
    <span className={cn('category-card-icon grid size-10 place-items-center rounded-xl', isInactive ? 'bg-subtle text-muted' : 'bg-stellar-soft text-stellar')}>
      <Tags aria-hidden="true" className="size-5" />
    </span>
    <div className="min-w-0 space-y-1">
      <h3 className="font-semibold text-ink">{c.name}</h3>
      <Badge variant={isInactive ? 'danger' : 'success'}>{isInactive ? 'Inactiva' : 'Activa'}</Badge>
    </div>
    <Button onClick={() => openEditForm(c)} disabled={isLoading} className="size-11 border border-line bg-panel p-2 text-stellar"
      title="Editar" type="button" variant="ghost" aria-label="Editar">
      <Pencil aria-hidden="true" />
    </Button>
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
    return <LoadingState variant="module">Organizando categorías...</LoadingState>;
  }
  return <div className="workspace-page max-w-6xl animate-enter motion-reduce:animate-none">

      {/* HEADER REFACTORIZADO */}
      <PageHeader title="Categorías" icon={Tags} eyebrow="Organización" className="border-t-stellar/65 p-3 sm:p-3" actions={<><Button onClick={openAddForm} className="shrink-0 max-sm:w-full" type="button" variant="primary">
          <Plus aria-hidden="true" /> Nueva categoría
        </Button></>} />

      {/* BARRA DE BÚSQUEDA Y TOGGLE */}
      <FirestoreQueryError error={catalogError} area="catalog" user={user} onRetry={retryCatalog} />
      <div className="view-toolbar">
        <SearchField type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar categoría por nombre..." onClear={() => setSearchTerm('')} className="basis-full sm:basis-56" />

        <label className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-sm font-medium text-muted max-sm:w-full">
          <Input type="checkbox" className="shrink-0" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Ver archivados
        </label>
      </div>

      <h3 className="text-xs font-bold uppercase tracking-wide text-muted">
        Lista de Categorías ({filteredCategories.length})
      </h3>

      <div className="category-grid grid min-w-0 gap-3 xl:grid-cols-2">
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
