import { useState, useEffect, useRef } from 'react';
import { History } from 'lucide-react';
import toast from 'react-hot-toast';
import FirestoreQueryError from '../components/FirestoreQueryError';
import { useSessionScroll } from '../core/session/sessionResourceHooks.js';
import { useTenantData } from '../features/branches/context/TenantContext';
import { useSalesHistory } from '../features/sales/hooks/useSalesHistory';
import { SaleHistoryCard } from './sales-history/SaleHistoryCard';
import { Dialog, LoadingState, PageHeader, Button, Textarea, FormField, EmptyState, Alert } from '../shared/ui';
import { runtimeCapabilities } from '../config/runtimeCapabilities.js';
import { DraftSaleReview } from './sales-history/DraftSaleReview.jsx';

export default function SalesHistory({ user }) {
  const { sales, rejected, error, isStale, updatedAt, retry, isLoading, formatDate, anularVentaConfirmada,
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
  const checking = phase === 'uncertain' || current?.voidCheckPending || current?.voided;
  const close = () => { setSelected(null); setReason(''); };
  useEffect(() => {
    if (receipt || remotelyVoided || phase === 'confirmed') { setSelected(null); setReason(''); }
  }, [receipt, remotelyVoided, phase]);
  const cancelSale = async event => {
    event.preventDefault();
    if (submitting.current || !selectedSale) return;
    if (!checking && reason.trim().length < 5) { toast.error('Explica el motivo con al menos 5 caracteres.'); return; }
    submitting.current = true;
    const selectedAtStart = selected;
    try {
      const confirmed = checking ? await verificarAnulacion(selectedSale) : await anularVentaConfirmada(selectedSale, reason);
      if (confirmed) { setSelected(value => value === selectedAtStart ? null : value); setReason(''); }
    } finally { submitting.current = false; }
  };
  const card = sale => <SaleHistoryCard key={sale.id} s={sale} user={user} businessBranches={businessBranches} formatDate={formatDate}
    isProcessing={isProcessing} canOperate={!isStale && !error} verificarPendiente={verificarPendiente} verificarAnulacion={verificarAnulacion}
    onReviewDraft={setDraft} activeBranchId={activeBranchId} setSaleToCancel={sale => { setReason(''); setSelected({ sale, scopeKey }); }} />;
  if (isLoading) return <LoadingState>Cargando movimientos…</LoadingState>;
  return <div className="mx-auto w-full min-w-0 max-w-7xl space-y-5">
    <PageHeader title="Historial de ventas" icon={History} eyebrow="Movimientos recientes" description="Ventas registradas y tickets guardados en este dispositivo." />
    <p className="text-sm text-muted">{isStale ? 'Actualizando con el servidor…' : updatedAt ? `Actualizado ${new Date(updatedAt).toLocaleTimeString('es-PE')}` : ''} Los tickets sin cobrar no suman ingresos.</p>
    <FirestoreQueryError error={error} area="sales-recent" user={user} onRetry={retry} commercial />
    {sales.length ? <div className="grid min-w-0 gap-4 xl:grid-cols-2 3xl:grid-cols-3">{sales.map(card)}</div>
      : !error && <EmptyState title="Sin movimientos recientes" description="Aquí aparecerán las ventas y los tickets guardados." />}
    {rejected.length > 0 && <details className="rounded-2xl border border-line bg-panel p-4"><summary className="min-h-10 cursor-pointer font-semibold">Revisión local · {rejected.length}</summary><p className="mb-4 text-sm text-muted">Estos intentos no se realizaron. Se conservan para revisión y no suman ingresos.</p><div className="grid gap-4 xl:grid-cols-2">{rejected.map(card)}</div></details>}
    {selectedSale && <Dialog title={checking ? 'Comprobar anulación' : '¿Anular este ticket?'} onClose={close} busy={isProcessing && !receipt}>
      {checking ? <Alert variant="warning">La operación ya se intentó. Solo comprobaremos el mismo ticket; no volveremos a registrar la anulación ni a mover inventario. Puedes cerrar esta ventana y verificar después.</Alert>
        : <p className="text-sm text-muted">Se anulará el ticket de <strong>S/ {Number(selectedSale.total).toFixed(2)}</strong> y se restituirán sus productos. El registro se conserva. Esta acción no acredita una entrega física de dinero.</p>}
      <form onSubmit={cancelSale} className="space-y-4">
        {!checking ? <FormField label="Motivo de la anulación"><Textarea required minLength={5} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} autoFocus disabled={isProcessing} /></FormField>
          : reason && <p className="text-sm text-muted">Motivo conservado: {reason}</p>}
        {phase === 'rejected' && <Alert variant="danger">{voidResult.message || 'La anulación fue rechazada. Revisa tu caja y los permisos antes de continuar.'}</Alert>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={close} disabled={isProcessing}>Cerrar</Button><Button type="submit" variant={checking ? 'secondary' : 'danger'} loading={isProcessing} disabled={isProcessing || !runtimeCapabilities.saleVoid}>{checking ? 'Verificar anulación' : 'Confirmar anulación'}</Button></div>
      </form>
    </Dialog>}
    {draft?.branchId === activeBranchId && draft.userId === user.uid && <DraftSaleReview key={`${scopeKey}:${draft.id}`} sale={draft} user={user} activeBranchId={activeBranchId} onClose={() => setDraft(null)} onResult={() => setDraft(null)} />}
  </div>;
}
