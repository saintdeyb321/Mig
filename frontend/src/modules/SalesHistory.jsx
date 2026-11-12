import { useState, useEffect, useRef } from 'react';
import { History, TriangleAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import FirestoreQueryError from '../components/FirestoreQueryError';
import { useSessionScroll } from '../core/session/sessionResourceHooks.js';
import { useTenantData } from '../features/branches/context/TenantContext';
import { useSalesHistory } from '../features/sales/hooks/useSalesHistory';
import { SaleHistoryCard } from './sales-history/SaleHistoryCard';
import { Dialog, LoadingState, Button, Textarea, FormField, EmptyState, Alert } from '../shared/ui';
import { runtimeCapabilities } from '../config/runtimeCapabilities.js';
import { DraftSaleReview } from './sales-history/DraftSaleReview.jsx';

export default function SalesHistory({ user }) {
  const { sales, rejected, unreadableLocalCount = 0, error, isStale, updatedAt, retry, isLoading, formatDate, anularVentaConfirmada,
    verificarPendiente, verificarAnulacion, isProcessing, businessBranches, voidResult, confirmedVoid } = useSalesHistory(user);
  const { activeBranchId } = useTenantData();
  useSessionScroll(`sales:${activeBranchId}`, !isLoading);
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState('');
  const [draft, setDraft] = useState(null);
  const submitting = useRef(false);
  const scopeKey = JSON.stringify([user.uid, user.businessId, activeBranchId]);
  const previousScope = useRef(scopeKey);
  useEffect(() => {
    if (previousScope.current === scopeKey) return;
    previousScope.current = scopeKey; setSelected(null); setReason(''); setDraft(null);
  }, [scopeKey]);
  const selectedSale = selected?.scopeKey === scopeKey ? selected.sale : null;
  const receipt = selectedSale && confirmedVoid(selectedSale.id, reason);
  const phase = selectedSale && voidResult?.id === selectedSale.id ? voidResult.phase : null;
  const current = sales.find(sale => sale.id === selectedSale?.id);
  const remotelyVoided = current?.voidServerConfirmed === true;
  // The local attempt can appear before the active transaction has settled.
  const checking = phase !== 'processing' && (phase === 'uncertain' || current?.voidCheckPending || current?.voided);
  const close = () => { setSelected(null); setReason(''); };
  useEffect(() => {
    if (receipt || remotelyVoided || phase === 'confirmed') { setSelected(null); setReason(''); }
  }, [receipt, remotelyVoided, phase]);
  const cancelSale = async event => {
    event.preventDefault();
    if (submitting.current || isProcessing || !selectedSale || receipt || remotelyVoided || phase === 'confirmed') return;
    if (!checking && reason.trim().length < 5) { toast.error('Explica el motivo con al menos 5 caracteres.'); return; }
    submitting.current = true;
    const selectedAtStart = selected;
    try {
      const confirmed = checking ? await verificarAnulacion(selectedSale) : await anularVentaConfirmada(selectedSale, reason);
      if (confirmed) setSelected(value => value === selectedAtStart ? null : value);
    } finally { submitting.current = false; }
  };
  const card = sale => <SaleHistoryCard key={sale.id} s={sale} user={user} businessBranches={businessBranches} formatDate={formatDate}
    isProcessing={isProcessing} canOperate={!isStale && !error && !(voidResult?.phase === 'confirmed' && voidResult.id === sale.id)}
    verificarPendiente={verificarPendiente} verificarAnulacion={verificarAnulacion}
    onReviewDraft={setDraft} activeBranchId={activeBranchId} setSaleToCancel={sale => { setReason(''); setSelected({ sale, scopeKey }); }} />;
  if (isLoading) return <LoadingState variant="module">Cargando movimientos…</LoadingState>;
  return <div className="sales-history mx-auto w-full min-w-0 max-w-7xl space-y-3">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-brand-deep"><History aria-hidden="true" className="size-5 text-primary" />Historial de ventas</h1>
      <p className="text-xs text-muted" role="status">{isStale ? 'Actualizando con el servidor…' : updatedAt ? `Actualizado ${new Date(updatedAt).toLocaleTimeString('es-PE')}` : ''}</p>
    </header>
    <p className="text-xs text-muted">Los tickets sin cobrar no suman ingresos.</p>
    <FirestoreQueryError error={error} area="sales-recent" user={user} onRetry={retry} commercial />
    {unreadableLocalCount > 0 && <Alert variant="warning" title="Tickets locales por revisar">
      No se pudo leer el contenido de {unreadableLocalCount} {unreadableLocalCount === 1 ? 'ticket local' : 'tickets locales'}. Los registros se conservan. Si alguno se envió, comprueba su recibo antes de volver a cobrar.
    </Alert>}
    {sales.length ? <div className="history-grid min-w-0">{sales.map(card)}</div>
      : !error && !unreadableLocalCount && <EmptyState title="Sin movimientos recientes" description="Aquí aparecerán las ventas y los tickets guardados." />}
    {rejected.length > 0 && <details className="rounded-2xl border border-line bg-panel p-4"><summary className="flex min-h-11 cursor-pointer items-center font-semibold">Revisión local · {rejected.length}</summary><p className="mb-4 text-sm text-muted">Estos intentos no se realizaron. Se conservan para revisión y no suman ingresos.</p><div className="history-grid">{rejected.map(card)}</div></details>}
    {selectedSale && <Dialog
      title="¿Anular esta venta?"
      icon={TriangleAlert}
      onClose={close}
      busy={isProcessing && !receipt}
      className="sale-void-dialog max-w-md border-t-4 border-t-danger"
      bodyClassName="p-4 sm:p-5"
    >
      <p className="text-sm leading-relaxed text-muted">
        Venta de <strong className="text-ink">S/ {Number(selectedSale.total).toFixed(2)}</strong>.
        {!checking && ' Al confirmar, se anulará el ticket y se restituirá el stock. La devolución física del dinero se revisa por separado.'}
      </p>
      {isProcessing && <p role="status" className="text-sm font-semibold text-ink">{checking ? 'Verificando el comprobante…' : 'Procesando la anulación…'}</p>}
      {checking && !isProcessing && <Alert variant="warning" title="Resultado pendiente de confirmación">
        Puedes verificar el comprobante aquí o volver al historial. La comprobación no vuelve a anular ni mueve inventario.
      </Alert>}
      <form onSubmit={cancelSale} className="space-y-3">
        {!checking ? <FormField label="Motivo de anulación" required hint="Escribe al menos 5 caracteres.">
          <Textarea
            required minLength={5} maxLength={1000} rows={3} className="min-h-20"
            placeholder="Ej.: cliente desistió, error de cobro…"
            value={reason} onChange={event => setReason(event.target.value)} autoFocus disabled={isProcessing}
          />
        </FormField> : reason && <p className="text-sm text-muted wrap-anywhere"><strong>Motivo conservado</strong> · {reason}</p>}
        {phase === 'rejected' && <Alert variant="danger">{voidResult.message || 'La anulación fue rechazada. Revisa tu caja y los permisos antes de continuar.'}</Alert>}
        <div className="grid gap-2 min-[360px]:grid-cols-2">
          <Button variant="secondary" className="w-full px-2" onClick={close} disabled={isProcessing}>{checking ? 'Cerrar' : 'Cancelar'}</Button>
          <Button type="submit" variant={checking ? 'secondary' : 'danger'} className="w-full px-2" loading={isProcessing} disabled={isProcessing || !runtimeCapabilities.saleVoid}>
            {checking ? 'Verificar anulación' : 'Sí, anular venta'}
          </Button>
        </div>
      </form>
    </Dialog>}
    {draft?.branchId === activeBranchId && draft.userId === user.uid && <DraftSaleReview key={`${scopeKey}:${draft.id}`} sale={draft} user={user} activeBranchId={activeBranchId} onClose={() => setDraft(null)} onResult={() => setDraft(null)} />}
  </div>;
}
