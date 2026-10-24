import { Building2 } from 'lucide-react';
import { Alert, Dialog, cn, Button, PageHeader, Input, FormField, Select, Badge, Card, DialogFooter, SearchField, EmptyState } from "../shared/ui";
// src/modules/BranchManager.jsx
import React, { memo, useState } from 'react';
import { useBranches } from '../features/branches/hooks/useBranches';
import QRPaymentCard from './QRPaymentCard';
const BranchCard = memo(({
  b,
  openEditForm,
  isProcessing
}) => {
  const isInactive = b.status?.toLowerCase() === 'inactivo';
  const hasQR = Boolean(b.yapeQrUrl);
  return <Card className={cn(`flex min-w-0 flex-wrap items-center justify-between gap-4       p-4 sm:p-4 animate-enter motion-reduce:animate-none ${isInactive ? "opacity-65" : ''} `)} as="div">
      <div className="flex min-w-0 flex-[1_1_15rem] items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl bg-subtle relative">
          <span className={cn(isInactive ? "opacity-50" : "opacity-100")}>🏢</span>
        </div>

        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(`break-words font-semibold ${isInactive ? "line-through text-muted" : "text-ink"} `)}>
              {b.name}
            </span>
            <div className="flex gap-1">
              {hasQR && <Badge className="bg-primary-soft text-accent">
                  📱 QR Activo
                </Badge>}
              <Badge className={cn(isInactive ? "bg-danger-soft" : "bg-success-soft", isInactive ? "text-danger" : "text-success")}>
                {isInactive ? '🔴 INACTIVA' : '🟢 ACTIVA'}
              </Badge>
            </div>
          </div>

          <span className="break-all text-xs text-muted mt-1">
            📍 {b.address || 'Sin dirección'}
          </span>

          <div className="flex flex-wrap items-center gap-1 text-xs text-primary mt-0.5">
            <span className="text-sm">📞</span>
            <span className="text-muted font-medium">
              {b.phone || 'Sin teléfono'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex w-full flex-wrap items-center gap-2 border-t border-line pt-3 sm:w-auto sm:border-0 sm:pt-0">
        <Button onClick={() => openEditForm(b)} disabled={isProcessing} className="flex-1 sm:flex-none" type="button" variant="secondary">
          <span>✏️</span> Editar
        </Button>
      </div>
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
        <span className="text-3xl">🏢</span>
        <p className="text-sm text-muted">Cargando sucursales...</p>
      </div>;
  }
  return <div className={cn(isEmbedded ? "animate-enter motion-reduce:animate-none" : "animate-enter motion-reduce:animate-none mx-auto w-full min-w-0 max-w-7xl space-y-5 pb-6", isEmbedded ? "" : "w-full max-w-6xl m-[0_auto]")}>

      {!isEmbedded && <PageHeader title="Mis sucursales" icon={Building2} eyebrow="Tus locales" description="Organiza las sedes y sus métodos de pago." actions={<><Button onClick={openAddForm} className="shrink-0" type="button" variant="primary">
            ➕ Nueva Sede
          </Button></>} />}

      <Alert variant={branchQuota?.registeredBranchQuotaVersion === 1 ? 'info' : 'warning'}>{branchQuota?.registeredBranchQuotaVersion === 1 ? `Sedes activas: ${branchQuota.activeBranchIds.length} / ${branchQuota.maxActiveBranches}. Registradas: ${branchQuota.registeredBranchIds.length} / ${branchQuota.maxRegisteredBranches}. Inactivar libera solo cupo activo; el historial conserva su plaza registrada.` : 'Inventario registrado sin regularizar: conserva sus operaciones; SuperAdmin debe inventariar y regularizar antes de nuevas altas o cambios de estado.'}</Alert>
      <div className="flex flex-wrap gap-3 items-center mb-5">

        <SearchField type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar por nombre..." onClear={() => setSearchTerm('')} />

        <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-sm font-medium text-muted m-0">
          <Input type="checkbox" className="shrink-0" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Ver inactivos
        </label>

        {isEmbedded && <Button onClick={openAddForm} className="shrink-0" type="button" variant="primary">
            ➕ Nueva Sede
          </Button>}
      </div>

      <h3 className="text-sm font-semibold text-muted mt-0">
        Lista de Sedes ({filteredBranches.length})
      </h3>

      <div className="grid gap-3 xl:grid-cols-2">
        {filteredBranches.length === 0 ? <EmptyState title="Sin registros" description={<>
              {searchTerm ? `No se encontraron resultados para "${searchTerm}"` : 'Aún no hay sucursales registradas.'}
            </>} /> : filteredBranches.map(b => <BranchCard key={b.id} b={b} openEditForm={openEditForm} isProcessing={isProcessing} />)}
      </div>

      {/* MODAL FORMULARIO */}
      {showFormModal && <Dialog title={<>
              {editingBranch ? '✏️ Editar Sede' : '➕ Nueva Sede'}
            </>} busy={isProcessing} className="max-w-lg" onClose={() => setShowFormModal(false)}>

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
