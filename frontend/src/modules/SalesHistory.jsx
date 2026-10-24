import FirestoreQueryError from '../components/FirestoreQueryError';
import { History } from 'lucide-react';
import { useSessionScroll } from '../core/session/sessionResourceHooks.js';
import { useTenantData } from '../features/branches/context/TenantContext';
import { SaleHistoryCard } from "./sales-history/SaleHistoryCard";
import { Alert, Dialog, LoadingState, PageHeader, Input, Button, Textarea, FormField, EmptyState } from "../shared/ui";
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

      <PageHeader title="Historial de ventas" icon={History} eyebrow="Control de operaciones" description="Revisa tickets confirmados y pendientes locales." actions={<><span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-sm font-medium text-muted cursor-default pointer-events-none">
          Últimos 50 tickets
        </span></>} />

      {sales.some(sale => sale.isOffline) && <Alert variant="warning" title="Hay pendientes locales">Comprueba ID, sede e importe con el libro remoto antes de volver a cobrar. Los pendientes se conservan cifrados y no se sincronizan automáticamente.</Alert>}
      <p role="status" className="text-sm text-muted">{isStale ? 'Historial pendiente de validar con el servidor; no confirma saldos actuales.' : `Lectura: ${new Date(updatedAt).toLocaleTimeString('es-PE')}.`}</p>
      <label className="inline-flex min-h-11 items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-sm text-muted"><Input type="checkbox" checked={pendingOnly} onChange={event => setPendingOnly(event.target.checked)} /> Revisar únicamente pendientes locales (últimos 50, sin sincronizarlos)</label>
      <FirestoreQueryError error={error} area="sales-recent" user={user} onRetry={retry} />
      {sales.length === 0 && error ? null : sales.length === 0 ? <EmptyState title="Sin registros" description={<>Aún no hay ventas registradas.</>} /> : <div className="grid min-w-0 gap-4 xl:grid-cols-2 3xl:grid-cols-3">
          {sales.map(s => <SaleHistoryCard key={s.id} s={s} user={user} businessBranches={businessBranches} formatDate={formatDate} isProcessing={isProcessing} verificarPendiente={verificarPendiente} setSaleToCancel={setSaleToCancel} />)}
        </div>}

      {saleToCancel && <Dialog title={<><span>⚠️</span> ¿Anular esta venta?</>} busy={isProcessing} className="max-w-lg" onClose={() => {
      setSaleToCancel(null);
      setVoidReason('');
    }}>

            <p className="text-muted text-sm mb-5">
              Estás a punto de anular una venta de <strong>S/ {Number(saleToCancel.total).toFixed(2)}</strong>. El dinero se restará de la caja y se devolverá el stock.
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

                <Textarea required minLength="5" value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Ej: El cliente se arrepintió, error de cobro, etc." autoFocus className="w-full p-3 rounded-xl border-2 border-warning min-h-20 resize-y font-sans" />
              </FormField>

              <div className="mt-5 flex-wrap justify-end flex gap-2.5">
                <Button type="button" className="min-w-0 flex-1 p-3 rounded-xl border-2 border-line bg-transparent text-ink font-bold cursor-pointer" onClick={() => {
            setSaleToCancel(null);
            setVoidReason('');
          }} disabled={isProcessing} title="Anulación POS restringida: compensación de stock y reembolso aún sin protocolo validado" variant="secondary">
                  Cancelar
                </Button>
                <Button type="submit" className="min-w-0 flex-1 p-3 border-0 rounded-xl font-bold cursor-pointer" disabled={isProcessing || !runtimeCapabilities.saleVoid} title="Anulación POS restringida: compensación de stock y reembolso aún sin protocolo validado" variant="danger" aria-label="Anulación POS restringida: compensación de stock y reembolso aún sin protocolo validado">
                  {isProcessing ? 'Anulando...' : 'Sí, anular venta'}
                </Button>
              </div>
            </form>
          </Dialog>}

    </div>;
}
export default SalesHistory;
