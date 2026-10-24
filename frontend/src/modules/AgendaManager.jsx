import { useConfirmDialog } from '../shared/ui/useConfirmDialog';
import { Dialog, Button, LoadingState, PageHeader, Input, FormField, Badge, Card, SearchField, DialogFooter, EmptyState } from "../shared/ui";
// src/modules/agenda/AgendaManager.jsx
import React, { memo } from 'react';
import { useAgenda } from '../features/customers/hooks/useAgenda';
const ContactCard = memo(({
  c,
  openEditForm,
  handleDelete,
  isLoading
}) => {
  return <Card className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] animate-enter motion-reduce:animate-none border-l-4 border-l-primary" as="div">

      {/* 1. ICONO (Usamos la inicial del nombre) */}
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line [&>img]:size-full [&>img]:object-cover sm:size-14 bg-primary-soft text-primary font-bold">
        <span className="text-2xl">{c.name.charAt(0).toUpperCase()}</span>
      </div>

      {/* 2. INFO (Nombre y Teléfono) */}
      <div className="grid min-w-0 gap-1.5">
        <h3 className="break-words font-semibold">{c.name}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-subtle text-muted">
            📱 {c.phone || 'Sin número'}
          </Badge>
        </div>
      </div>

      {/* 3. ACCIÓN (Botón Editar y Eliminar) */}
      <div className="col-span-2 flex flex-wrap items-center justify-between border-t border-line pt-3 sm:col-span-1 sm:border-0 sm:pt-0 flex-row gap-1">
        <Button onClick={() => openEditForm(c)} disabled={isLoading} className="size-11 shrink-0 p-2 bg-subtle min-h-8.5 min-w-8.5" title="Editar" type="button" variant="ghost" aria-label="Editar">✏️</Button>
        <Button onClick={() => handleDelete(c.id)} disabled={isLoading} className="size-11 shrink-0 p-2 bg-danger-soft text-danger min-h-8.5 min-w-8.5" title="Eliminar" type="button" variant="ghost" aria-label="Eliminar">🗑️</Button>
      </div>

    </Card>;
});
function AgendaManager({
  user
}) {
  const {
    confirm,
    confirmation
  } = useConfirmDialog();
  const {
    isLoading,
    searchTerm,
    setSearchTerm,
    showFormModal,
    setShowFormModal,
    name,
    setName,
    phone,
    setPhone,
    editing,
    filteredContacts,
    openAddForm,
    openEditForm,
    handleSave,
    handleDelete
  } = useAgenda(user, {
    confirm
  });
  if (isLoading && filteredContacts.length === 0 && !showFormModal) {
    return <LoadingState>Abriendo Agenda...</LoadingState>;
  }
  return <div className="animate-enter motion-reduce:animate-none mx-auto min-w-0 space-y-5 pb-6 w-full max-w-6xl">
      {confirmation}

      <PageHeader className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex min-w-0 items-center gap-3 text-xl font-bold tracking-tight sm:text-2xl">
          <span className="text-2xl">📖</span>
          <span className="break-words">Agenda VIP</span>
        </h1>
        <Button onClick={openAddForm} className="shrink-0" type="button" variant="primary">
          ➕ Nuevo Contacto
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <SearchField type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar contacto por nombre o celular..." onClear={() => setSearchTerm('')} className="basis-full sm:basis-56" />
      </div>

      <h3 className="text-sm font-semibold text-muted">
        Lista de Contactos Frecuentes ({filteredContacts.length})
      </h3>

      <div className="grid gap-3">
        {filteredContacts.length === 0 ? <EmptyState title="Sin registros" description={<>
              {searchTerm ? `Nadie coincide con "${searchTerm}"` : 'Aún no has registrado clientes VIP.'}
            </>} /> : filteredContacts.map(c => <ContactCard key={c.id} c={c} openEditForm={openEditForm} handleDelete={handleDelete} isLoading={isLoading} />)}
      </div>

      {showFormModal && <Dialog title={<>
              {editing ? '✏️ Editar Contacto' : '➕ Nuevo Contacto'}
            </>} busy={isLoading} className="max-w-lg" onClose={() => setShowFormModal(false)}>

            <form onSubmit={handleSave} className="grid gap-4">
              <FormField label={<>NOMBRE DEL CLIENTE</>}>

                <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Maria Lopez" required disabled={isLoading} />
              </FormField>

              <FormField label={<>TELÉFONO / WHATSAPP</>}>

                <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ej: 987 654 321" required disabled={isLoading} />
              </FormField>

              <DialogFooter>
                <Button type="button" onClick={() => setShowFormModal(false)} disabled={isLoading} variant="secondary">
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1" disabled={isLoading} variant="primary">
                  {isLoading ? 'Guardando...' : 'Guardar Contacto'}
                </Button>
              </DialogFooter>
            </form>
          </Dialog>}

    </div>;
}
export default AgendaManager;
