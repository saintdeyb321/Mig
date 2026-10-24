import { memo } from 'react';
import { Card, Button, cn } from '../../shared/ui';
import { toDateSafe } from '../../core/dates/dateValues.js';
const formatDate = timestamp => {
  if (!timestamp) return 'Sin fecha';
  const d = toDateSafe(timestamp);
  if (!d) return 'Fecha inválida';
  return d.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};
export const ClientCard = memo(({
  license,
  isProcessing,
  setExtendModalInfo,
  handleToggleStatus,
  handleExport, onQuota, onDetails
}) => {
  const expiryDate = toDateSafe(license.expiry);
  const isExpired = !expiryDate || expiryDate < new Date();
  const isInactive = license.status !== 'activa';
  const hasProblem = isExpired || isInactive;
  const fullName = `${license.ownerFirstName || ''} ${license.ownerLastName || ''}`.trim() || 'Dueño';
  return <Card className={cn("animate-enter motion-reduce:animate-none overflow-hidden p-0 sm:p-0 border-t-4", hasProblem ? "border-t-danger" : "border-t-success")} as="div">

      {/* Cabecera de Tarjeta */}
      <div className="p-5 flex flex-col gap-2">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <h3 className="m-0 text-brand-deep text-lg font-bold break-words">
            {license.businessName}
          </h3>
          <div className="flex gap-3 items-center">
            <span className={cn("text-xs font-bold uppercase py-1 px-2 rounded-lg", hasProblem ? "bg-danger-soft" : "bg-success-soft", hasProblem ? "text-danger" : "text-success")}>
              {isExpired ? 'VENCIDA' : isInactive ? 'SUSPENDIDA' : 'ACTIVA'}
            </span>

            {/* 🚀 BOTÓN DE EXPORTAR BD */}
            <Button onClick={() => handleExport(license.id)} disabled={isProcessing} title="Exportar datos autorizados a un archivo local" aria-label="Exportar datos autorizados" type="button" variant="secondary" className="bg-transparent border-0 cursor-pointer text-xl p-0 opacity-80 transition-colors motion-reduce:transition-none">
              📥
            </Button>

          </div>
        </div>

        <span className="break-all text-xs text-muted font-mono">
          ID: {license.id}
        </span>
      </div>

      {/* Detalles de Tarjeta */}
      <div className="bg-primary-soft/40 py-4 px-5 border-t border-t-line border-b border-b-line grid gap-2.5">
        <div className="flex items-center gap-2.5 text-sm">
          <span className="text-xl">👤</span>
          <div>
            <strong className="block text-ink">{fullName}</strong>
            <span className="break-all text-muted">{license.ownerEmail}</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 text-sm">
          <span className="text-xl">📅</span>
          <div>
            <strong className="block text-ink">Vencimiento</strong>
            <span className={cn(hasProblem ? "text-danger" : "text-muted", hasProblem ? "font-bold" : "font-normal")}>
              {formatDate(license.expiry)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3 text-xs text-muted"><span>Sedes activas registradas: {license.branchQuotaVersion === 1 ? `${license.activeBranchIds?.length ?? '?'} / ${license.maxActiveBranches}` : 'cupo histórico sin regularizar'}</span><Button variant="secondary" size="sm" disabled={isProcessing} onClick={() => onQuota(license)}>Editar cupo</Button></div>
      <div className="px-5 py-3"><Button variant="secondary" onClick={() => onDetails(license)} disabled={isProcessing} className="w-full">Ver detalles</Button></div>
      {/* Botonera de Tarjeta */}
      {license.tenantStatus !== 'active' && <p role="status" className="rounded-xl border border-line bg-subtle/60 p-3 text-xs leading-relaxed text-muted">Estado histórico: {license.tenantStatus}. Mantenimiento privilegiado no disponible en Spark.</p>}
      <div className="py-4 px-5 flex flex-wrap gap-2.5">
        <Button disabled={isProcessing || license.tenantStatus !== 'active' || !!license.maintenanceJobId} onClick={() => setExtendModalInfo(license.id)} className="min-w-0 flex-1 p-2 text-sm" type="button" variant="primary">
          🚀 Renovar
        </Button>
        <Button onClick={() => handleToggleStatus(license.id, license.status)} disabled={isProcessing || license.tenantStatus !== 'active' || !!license.maintenanceJobId} className={cn("size-11 shrink-0 p-2 border border-line rounded-xl", isProcessing ? "opacity-50" : "opacity-100")} title={isInactive ? 'Activar Servicio' : 'Suspender Servicio'} type="button" variant="ghost" aria-label={isInactive ? 'Activar Servicio' : 'Suspender Servicio'}>
          {isInactive ? '▶️' : '⏸️'}
        </Button>
      </div>
    </Card>;
});

// Componente Principal
