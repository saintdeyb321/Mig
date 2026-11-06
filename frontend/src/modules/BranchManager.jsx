import { MapPin, Pencil, Phone, Plus, QrCode, Store } from 'lucide-react';
import { Alert, Dialog, cn, Button, PageHeader, Input, FormField, Select, Badge, Card, DialogFooter, SearchField, EmptyState } from "../shared/ui";
import { memo, useState } from 'react';
import { useBranches } from '../features/branches/hooks/useBranches';
import QRPaymentCard from './QRPaymentCard';
const BranchCard = memo(({
  b,
  openEditForm,
  isProcessing
}) => {
  const isInactive = b.status?.toLowerCase() === 'inactivo';
  const hasQR = Boolean(b.yapeQrUrl);
  return <Card as="article" className={cn('grid min-w-0 gap-3 border-l-4 bg-linear-to-br from-panel via-panel p-3.5 hover:shadow-md motion-safe:transition-shadow sm:p-4',
    isInactive ? 'border-l-control/45 to-subtle' : 'border-l-stellar/55 to-stellar-soft/45')}>
    <header className="flex min-w-0 items-start gap-2.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-stellar/15 bg-stellar-soft text-stellar"><Store aria-hidden="true" className="size-5" /></span>
      <div className="min-w-0 space-y-1">
        <h4 className="font-extrabold text-brand-deep wrap-anywhere">{b.name}</h4>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={isInactive ? 'neutral' : 'success'}>{isInactive ? 'Inactiva' : 'Activa'}</Badge>
          {hasQR && <Badge variant="accent"><QrCode aria-hidden="true" className="size-3.5" />QR configurado</Badge>}
        </div>
      </div>
    </header>
    <dl className="grid min-w-0 gap-2 rounded-xl border border-stellar/15 bg-stellar-soft/40 px-3 py-2.5">
      <div className="grid min-w-0 gap-0.5">
        <dt className="flex items-center gap-1.5 text-xs font-semibold text-stellar"><MapPin aria-hidden="true" className="size-3.5 shrink-0" />Dirección</dt>
        <dd className="text-sm wrap-anywhere">{b.address || 'Sin dirección'}</dd>
      </div>
      <div className="grid min-w-0 gap-0.5">
        <dt className="flex items-center gap-1.5 text-xs font-semibold text-stellar"><Phone aria-hidden="true" className="size-3.5 shrink-0" />Teléfono</dt>
        <dd className="text-sm tabular-nums wrap-anywhere">{b.phone || 'Sin teléfono'}</dd>
      </div>
    </dl>
    <footer className="flex justify-end border-t border-line/75 pt-2.5">
      <Button onClick={() => openEditForm(b)} disabled={isProcessing} size="sm" type="button" variant="secondary"><Pencil aria-hidden="true" />Editar</Button>
    </footer>
  </Card>;
});
function BranchManager({
  user,
  isEmbedded = false
}) {
  const {
    branches, branchQuota,
    isLoading,
    isProcessing,
    showFormModal,
    setShowFormModal,
    name,
    setName,
    address,
    setAddress,
    phone,
    setPhone,
    status,
    setStatus,
    qrImageBase64,
    handleImageChange,
    removeQrImage,
    editingBranch,
    openAddForm,
    openEditForm,
    handleSave
  } = useBranches(user);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const filteredBranches = branches.filter(b => {
    const matchesSearch = b.name.toLowerCase().includes(searchTerm.toLowerCase()) || b.address && b.address.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = showInactive ? true : b.status !== 'inactivo';
    return matchesSearch && matchesStatus;
  });
  if (isLoading && !showFormModal) {
    return <div className="flex min-h-64 flex-col items-center justify-center gap-4 animate-enter motion-reduce:animate-none p-5">
        <span className="grid size-12 place-items-center rounded-xl bg-stellar-soft text-stellar"><Store aria-hidden="true" className="size-6" /></span>
        <p className="text-sm text-muted">Cargando sucursales...</p>
      </div>;
  }
  return <div className={cn('animate-enter motion-reduce:animate-none', isEmbedded ? 'space-y-3' : 'workspace-page max-w-6xl')}>

      {!isEmbedded && <PageHeader title="Mis sucursales" icon={Store} eyebrow="Tus locales" description="Organiza las sedes y sus métodos de pago." className="to-stellar-soft/65" actions={<><Button onClick={openAddForm} className="shrink-0" type="button" variant="primary">
            <Plus aria-hidden="true" /> Nueva sede
          </Button></>} />}

      <Alert variant={branchQuota?.registeredBranchQuotaVersion === 1 ? 'info' : 'warning'}>{branchQuota?.registeredBranchQuotaVersion === 1 ? `Sedes activas: ${branchQuota.activeBranchIds.length} / ${branchQuota.maxActiveBranches}. Registradas: ${branchQuota.registeredBranchIds.length} / ${branchQuota.maxRegisteredBranches}. Inactivar libera solo cupo activo; el historial conserva su plaza registrada.` : 'Inventario registrado sin regularizar: conserva sus operaciones; SuperAdmin debe inventariar y regularizar antes de nuevas altas o cambios de estado.'}</Alert>
      <div className="view-toolbar border-stellar/20 bg-panel/85">

        <SearchField type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar por nombre..." onClear={() => setSearchTerm('')} className="basis-full sm:basis-48" />

        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-stellar/15 bg-stellar-soft/45 px-3 text-sm font-medium text-ink focus-within:border-stellar">
          <Input type="checkbox" className="shrink-0" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Ver inactivos
        </label>

        {isEmbedded && <Button onClick={openAddForm} className="shrink-0" type="button" variant="primary">
            <Plus aria-hidden="true" /> Nueva sede
          </Button>}
      </div>

      <h3 className="text-sm font-bold text-brand-deep">
        Lista de Sedes ({filteredBranches.length})
      </h3>

      <div className="grid gap-3 xl:grid-cols-2">
        {filteredBranches.length === 0 ? <EmptyState title="Sin registros" description={<>
              {searchTerm ? `No se encontraron resultados para "${searchTerm}"` : 'Aún no hay sucursales registradas.'}
            </>} /> : filteredBranches.map(b => <BranchCard key={b.id} b={b} openEditForm={openEditForm} isProcessing={isProcessing} />)}
      </div>

      {/* MODAL FORMULARIO */}
      {showFormModal && <Dialog title={editingBranch ? 'Editar sede' : 'Nueva sede'} icon={Store} busy={isProcessing} className="max-w-lg" onClose={() => setShowFormModal(false)}>

            <form onSubmit={handleSave} className="grid gap-4">
              <FormField label={<>NOMBRE DE LA SEDE</>}>

                <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Sede Principal" required disabled={isProcessing} />
              </FormField>
              <FormField label={<>DIRECCIÓN FÍSICA</>}>

                <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Ej: Av. Las Begonias 123" disabled={isProcessing} />
              </FormField>

              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <FormField label={<>TELÉFONO DE ATENCIÓN</>}>

                  <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Opcional" disabled={isProcessing} />
                </FormField>
                <FormField label={<>ESTADO</>}>

                  <Select value={status} onChange={e => setStatus(e.target.value)} disabled={isProcessing}>
                    <option value="activo">🟢 Activa</option>
                    <option value="inactivo">🔴 Inactiva</option>
                  </Select>
                </FormField>
              </div>

              <QRPaymentCard qrImageBase64={qrImageBase64} isProcessing={isProcessing} handleImageChange={handleImageChange} onRemoveImage={removeQrImage} />

              <DialogFooter>
                <Button type="button" onClick={() => setShowFormModal(false)} disabled={isProcessing} variant="secondary">Cancelar</Button>
                <Button type="submit" className="flex-1" disabled={isProcessing} variant="accent">
                  {isProcessing ? 'Guardando...' : 'Guardar Sede'}
                </Button>
              </DialogFooter>
            </form>
          </Dialog>}
    </div>;
}
export default BranchManager;
