import FirestoreQueryError from '../components/FirestoreQueryError';
import { History } from 'lucide-react';
import { useSessionScroll } from '../core/session/sessionResourceHooks.js';
import { useTenantData } from '../features/branches/context/TenantContext';
import { SaleHistoryCard } from "./sales-history/SaleHistoryCard";
import { Dialog, LoadingState, PageHeader, Input, Button, Textarea, FormField, EmptyState } from "../shared/ui";
import { runtimeCapabilities } from '../config/runtimeCapabilities.js';
// src/modules/SalesHistory.jsx
import { useState } from 'react';
import { useSalesHistory } from '../features/sales/hooks/useSalesHistory';
import toast from 'react-hot-toast';
function SalesHistory({
  user
}) {
  const {
    pendingOnly,
    setPendingOnly,
    sales,
    localCount, rejectedCount, uncertainCount,
    error, isStale, updatedAt, retry,
    isLoading,
    formatDate,
    anularVentaConfirmada,
    verificarPendiente,
    isProcessing,
    businessBranches
  } = useSalesHistory(user);
  const { activeBranchId } = useTenantData();
  useSessionScroll(`sales:${activeBranchId}`, !isLoading);
  const [saleToCancel, setSaleToCancel] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  if (isLoading) {
    return <LoadingState>Cargando historial de ventas...</LoadingState>;
  }
  return <div className="animate-enter motion-reduce:animate-none mx-auto w-full min-w-0 max-w-7xl space-y-5">

      <PageHeader title="Historial de ventas" icon={History} eyebrow="Control de operaciones" description={pendingOnly ? 'Intentos locales conservados para revisión. No representan ventas confirmadas.' : 'Ventas confirmadas y sus devoluciones.'} actions={<><span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-sm font-medium text-muted cursor-default pointer-events-none">
          Últimos 50 tickets
        </span></>} />

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted"><label className="inline-flex min-h-11 items-center gap-3 rounded-xl border border-line bg-panel px-4"><Input type="checkbox" checked={pendingOnly} onChange={event => setPendingOnly(event.target.checked)} /> Solo pendientes</label>
        {!!localCount&&<span role="status">{uncertainCount} sin confirmar · {rejectedCount} rechazados locales</span>}
        <span>{isStale ? 'Lectura local; actualización pendiente.' : updatedAt ? `Actualizado ${new Date(updatedAt).toLocaleTimeString('es-PE')}` : ''}</span></div>
      <FirestoreQueryError error={error} area="sales-recent" user={user} onRetry={retry} commercial />
      {sales.length === 0 && error ? null : sales.length === 0 ? <EmptyState title={pendingOnly ? 'Sin pendientes locales' : 'Sin ventas confirmadas'} description={pendingOnly ? 'No hay intentos locales para revisar en esta vista.' : 'Las ventas confirmadas aparecerán aquí.'} /> : <div className="grid min-w-0 gap-4 xl:grid-cols-2 3xl:grid-cols-3">
          {sales.map(s => <SaleHistoryCard key={s.id} s={s} user={user} businessBranches={businessBranches} formatDate={formatDate} isProcessing={isProcessing||isStale||!!error} verificarPendiente={verificarPendiente} setSaleToCancel={setSaleToCancel} />)}
        </div>}

      {saleToCancel && <Dialog title={<><span>⚠️</span> ¿Anular esta venta?</>} busy={isProcessing} className="max-w-lg" onClose={() => {
      setSaleToCancel(null);
      setVoidReason('');
    }}>

            <p className="text-muted text-sm mb-5">
              Estás a punto de registrar la devolución de <strong>S/ {Number(saleToCancel.total).toFixed(2)}</strong> por los medios originales y reintegrar el stock. El ticket original se conservará. Si el resultado es incierto, no repitas la devolución física.
            </p>

            <form onSubmit={async e => {
        e.preventDefault();
        if (voidReason.trim().length < 5) {
          toast.error("Por favor, explica detalladamente el motivo.");
          return;
        }
        const confirmed = await anularVentaConfirmada(saleToCancel, voidReason);
        if (!confirmed) return;
        setSaleToCancel(null);
        setVoidReason('');
      }}>

              <FormField className="mb-6" label={<>
                  MOTIVO DE LA ANULACIÓN (Obligatorio):
                </>}>

                <Textarea required minLength="5" maxLength="1000" value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Ej: El cliente se arrepintió, error de cobro, etc." autoFocus className="w-full p-3 rounded-xl border-2 border-warning min-h-20 resize-y font-sans" />
              </FormField>

              <div className="mt-5 flex-wrap justify-end flex gap-2.5">
                <Button type="button" className="min-w-0 flex-1 p-3 rounded-xl border-2 border-line bg-transparent text-ink font-bold cursor-pointer" onClick={() => {
            setSaleToCancel(null);
            setVoidReason('');
          }} disabled={isProcessing} variant="secondary">
                  Cancelar
                </Button>
                <Button type="submit" className="min-w-0 flex-1 p-3 border-0 rounded-xl font-bold cursor-pointer" disabled={isProcessing || !runtimeCapabilities.saleVoid} variant="danger">
                  {isProcessing ? 'Anulando...' : 'Sí, anular venta'}
                </Button>
              </div>
            </form>
          </Dialog>}

    </div>;
}
export default SalesHistory;
