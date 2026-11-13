import FirestoreQueryError from '../components/FirestoreQueryError';
import { useCatalogData } from '../features/catalog/context/CatalogContext';
import { isBranchOperational } from '../features/branches/domain/branchPolicy';
import { useContext, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MobileDockContext } from '../layouts/MobileDockContext';
import { Banknote, Info, LockKeyhole, ShoppingBag, UnlockKeyhole } from 'lucide-react';
import { checkoutBlockReason } from '../features/sales/domain/checkoutPolicy.js';
import { parsePaymentCents, saleAmountCents } from '../features/sales/domain/saleModel.js';
import { canAddDistinctProduct } from '../features/sales/domain/cartCatalog.js';
import { getSafeStock } from '../features/sales/domain/cartStock';
import { usePOS } from '../features/sales/hooks/usePOS';
import { useTenantData } from '../features/branches/context/TenantContext';
import { useCashRegister } from '../features/cash-register/hooks/useCashRegister';
import { runtimeCapabilities } from '../config/runtimeCapabilities.js';
import { CashRegisterModals } from './CashRegisterModals';
import CashRecoveryStatus from './CashRecoveryStatus.jsx';
import { Alert, Button, Dialog, Drawer, EmptyState, LoadingState } from '../shared/ui';
import { ProductSearch, CategoryFilters, ProductCard } from './pos/CatalogParts';
import { PaymentFields, PaymentSelector } from './pos/PaymentParts';
import { CashStatus, SaleStatus, Ticket } from './pos/TicketParts';
import { DraftSaleReview } from './sales-history/DraftSaleReview.jsx';

function POS({ user }) {
  const mobileDock = useContext(MobileDockContext);
  const { businessBranches, activeBranchId } = useTenantData();
  const { error: catalogError, retry: retryCatalog } = useCatalogData();

  const {
    currentSession, isExpired, expiresAt, recoverySession, expiryState, remainingMinutes, readError, checkSession, isLoadingSession, authorizeOffline, openRegister, calculateClose, confirmClose
  } = useCashRegister(user, activeBranchId);

  const {
    filteredProducts, cart, payment, setPayment, amountPaid, setAmountPaid,
    splitEfectivo, setSplitEfectivo, splitYape, setSplitYape,
    search, setSearch, isProcessing, showQrModal, setShowQrModal, qrUrl,
    addToCart, updateQty, removeFromCart, total, isPaymentValid, paymentValidation, handleCheckoutClick, processSale,
    lastSale, clearLastSale, printReceipt, activeCategories, isLoading,
    catalogChanges, catalogBlocked, acceptCatalogChange, verifyLastSale, isOnline, acceptReviewedSale
  } = usePOS(user, currentSession);

  const [selectedCategory, setSelectedCategory] = useState('todas');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [checkoutAttempted, setCheckoutAttempted] = useState(false);
  const [draftReview, setDraftReview] = useState(null);

  const [cashModal, setCashModal] = useState(null);
  const modalScope = JSON.stringify([user.uid, user.businessId, activeBranchId]);
  const [previousModalScope, setPreviousModalScope] = useState(modalScope);
  if (previousModalScope !== modalScope) {
    setPreviousModalScope(modalScope);
    setDraftReview(null); setCashModal(null); setIsCartOpen(false);
  }

  const checkoutBlocked = checkoutBlockReason(cart);

  // Funciones exclusivas de interfaz para autocompletado
  const handleSplitEfectivoChange = (val) => {
    setSplitEfectivo(val);
    if (val === '') {
      setSplitYape('');
    } else {
      try {
        const cents = parsePaymentCents(val), totalCents = saleAmountCents(total);
        if (cents <= totalCents) setSplitYape(((totalCents - cents) / 100).toFixed(2));
      } catch { /* Keep the original invalid text visible; never round the other part from it. */ }
    }
  };

  const handleSplitYapeChange = (val) => {
    setSplitYape(val);
    if (val === '') {
      setSplitEfectivo('');
    } else {
      try {
        const cents = parsePaymentCents(val), totalCents = saleAmountCents(total);
        if (cents <= totalCents) setSplitEfectivo(((totalCents - cents) / 100).toFixed(2));
      } catch { /* Validation below reports the unmodified input. */ }
    }
  };

  const branchStatus = useMemo(() => {
    if (activeBranchId === 'global') return { isReadOnly: true, reason: 'global' };
    if (businessBranches && activeBranchId) {
      const branch = businessBranches.find(b => b.id === activeBranchId);
      if (!isBranchOperational(branch)) {
        return { isReadOnly: true, reason: 'inactive', name: branch?.name || 'no verificada' };
      }
    }
    return { isReadOnly: false };
  }, [businessBranches, activeBranchId]);

  const displayedProducts = useMemo(() => {
    if (selectedCategory === 'todas') return filteredProducts;
    const selCat = (selectedCategory || '').trim().toLowerCase();
    return filteredProducts.filter(p => (p.category || '').trim().toLowerCase() === selCat);
  }, [filteredProducts, selectedCategory]);

  const handleNuevaVenta = () => {
    clearLastSale();
    setCheckoutAttempted(false);
    setIsCartOpen(false);
  };

  const cashReady = currentSession?.serverConfirmed === true && !currentSession.needsForceClose && !isExpired && !readError;
  const isGlobalDisabled = branchStatus.isReadOnly || (isOnline && !cashReady);

  const dismissCashModal = () => setCashModal(request => request === cashModal ? null : request);
  const showCashClosing = () => setCashModal({ mode: 'close', sessionId: currentSession.id });
  const cashModals = <CashRegisterModals
    key={cashModal?.mode === 'open' ? `${modalScope}:open` : `${modalScope}:${currentSession?.id ?? 'closed'}`}
    showOpenModal={cashModal?.mode === 'open'} setShowOpenModal={dismissCashModal}
    showCloseModal={cashModal?.mode === 'close' && !isExpired && cashModal.sessionId === currentSession?.id} setShowCloseModal={dismissCashModal}
    currentSession={currentSession} recoverySession={recoverySession} expiryState={expiryState} isLoadingSession={isLoadingSession} checkSession={checkSession}
    openRegister={openRegister} authorizeOffline={authorizeOffline} calculateClose={calculateClose} confirmClose={confirmClose}
  />;
  if (isLoading || isLoadingSession) return <><LoadingState>Preparando caja registradora…</LoadingState>{cashModals}</>;
  const selectPayment = method => {
    setPayment(method);
    if(method==='mixto') { setSplitEfectivo('');setSplitYape(''); }
    else setAmountPaid('');
  };
  const requestCheckout = () => {
    setCheckoutAttempted(true);
    if (checkoutBlocked) return;
    if (isExpired || (isOnline && !cashReady)) return;
    handleCheckoutClick();
  };
  const action = readError && isOnline ? <Button variant="secondary" onClick={checkSession}>Reintentar lectura de caja</Button> : isOnline&&(!currentSession||recoverySession)&&!branchStatus.isReadOnly
    ? <Button className="w-full" onClick={() => setCashModal({ mode: 'open' })}><UnlockKeyhole />{(recoverySession || expiryState?.finalized) ? 'Abrir caja nueva' : 'Abrir caja para vender'}</Button>
    : isOnline&&currentSession?.needsForceClose&&!isExpired
      ? currentSession.canForceClose ? <Button variant="danger" className="w-full" onClick={showCashClosing}>Revisar y cerrar turno anterior</Button>
        : <Button variant="secondary" className="w-full" onClick={checkSession}>Comprobar disponibilidad</Button>
      : <Button className="w-full" data-pos-charge={isOnline && !branchStatus.isReadOnly ? '' : undefined} variant={isOnline && !branchStatus.isReadOnly ? 'success' : 'primary'} size="lg" onClick={requestCheckout} loading={isProcessing} disabled={isGlobalDisabled||catalogBlocked||!runtimeCapabilities.saleOnline||cart.length===0||!isPaymentValid||isProcessing}>
        {isOnline && !isProcessing && !branchStatus.isReadOnly && <Banknote aria-hidden="true" />}
        {branchStatus.isReadOnly?'Modo lectura':isProcessing?'Procesando…':isOnline?'Cobrar':'Guardar sin cobrar'}
      </Button>;
  const ticket = lastSale ? <SaleStatus sale={lastSale} onPrint={printReceipt} onNew={handleNuevaVenta} onVerify={verifyLastSale} onReview={() => setDraftReview(lastSale)} isProcessing={isProcessing} />
    : <Ticket drawer={isCartOpen} cart={cart} total={total} onQty={updateQty} onRemove={removeFromCart} isProcessing={isProcessing} action={action} catalogChanges={catalogChanges} onAcceptChange={acceptCatalogChange}>
      {!isProcessing && catalogBlocked && <Alert variant="warning">Cambió el catálogo. Acepta los datos vigentes, ajusta cantidades o retira los productos señalados antes de cobrar.</Alert>}
      {checkoutAttempted && checkoutBlocked && <Alert variant="warning" title="No se puede confirmar este ticket">{checkoutBlocked} El carrito se conserva completo; no se ha registrado ningún cobro.</Alert>}
      <PaymentSelector inTicket payment={payment} onSelect={selectPayment} disabled={branchStatus.isReadOnly||isProcessing} />
      <PaymentFields inTicket payment={payment} amountPaid={amountPaid} onAmountPaid={setAmountPaid} splitEfectivo={splitEfectivo} onSplitEfectivo={handleSplitEfectivoChange} splitYape={splitYape} onSplitYape={handleSplitYapeChange} total={total} validation={paymentValidation} disabled={branchStatus.isReadOnly||isProcessing} />
    </Ticket>;
  const ticketLauncher = <Button className="pos-cart-launcher w-full min-h-12 justify-between rounded-2xl border-white/20 shadow-float lg:hidden" onClick={()=>setIsCartOpen(true)}>
    <span className="flex min-w-0 items-center gap-2"><ShoppingBag aria-hidden="true" className="size-4 shrink-0" /><span>Ver ticket ({cart.length})</span></span>
    <span className="min-w-0 text-right tabular-nums">S/ {total.toFixed(2)}</span>
  </Button>;
  return <><div className="pos-workspace min-w-0 space-y-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-3 lg:space-y-0">
    {!isOnline && <Alert variant="info">Sin conexión: puedes guardar un ticket sin cobrar. No se moverá inventario ni se enviará automáticamente al reconectar.</Alert>}
    {!branchStatus.isReadOnly && <CashRecoveryStatus session={currentSession} isExpired={isExpired} expiresAt={expiresAt}
      expiryState={expiryState} online={isOnline} onCheck={checkSession} />}
    <FirestoreQueryError error={readError} area="cash-open" user={user} onRetry={checkSession} />
    <FirestoreQueryError error={catalogError} area="catalog" user={user} onRetry={retryCatalog} />
    <header className="pos-toolbar flex shrink-0 flex-wrap items-center justify-between gap-2">
      <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight"><ShoppingBag aria-hidden="true" className="size-5 text-primary" />Punto de venta</h1>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <CashStatus inPOS readOnly={branchStatus.isReadOnly} session={currentSession} isExpired={isExpired} expiresAt={expiresAt} remainingMinutes={remainingMinutes} />
        {currentSession&&!isExpired&&!branchStatus.isReadOnly&&(!currentSession.needsForceClose||currentSession.canForceClose)&&<Button variant="danger" size="sm" className="max-lg:min-h-11" disabled={isProcessing} onClick={showCashClosing}><LockKeyhole aria-hidden="true" />{currentSession.needsForceClose?'Revisar cierre anterior':'Cerrar caja'}</Button>}
      </div>
    </header>
    {branchStatus.isReadOnly&&<p role="status" className="flex shrink-0 items-start gap-2 rounded-xl border border-warning/25 bg-warning-soft px-3 py-2 text-sm text-warning"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{branchStatus.reason==='global'?<><strong>Vista global · Solo lectura.</strong> Elige una sucursal en el selector de sede para vender.</>:<><strong>Solo lectura.</strong> La sucursal {branchStatus.name} está inactiva.</>}</span></p>}
    {currentSession?.needsForceClose&&!isExpired&&!branchStatus.isReadOnly&&<Alert variant="warning" title="Caja a cargo de otro responsable"><p>{businessBranches?.find(branch=>branch.id===currentSession.branchId)?.name??'Esta sede'} · {currentSession.cashierName||'Responsable sin nombre registrado'}</p><p>{currentSession.canForceClose?'Revisa los movimientos y realiza el arqueo antes de cerrar este turno.':'Solicita al dueño que realice el arqueo y cierre el turno anterior.'}</p></Alert>}
    <div className="grid min-w-0 items-start gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1fr)_23rem]">
      <section aria-label="Catálogo de productos" className="pos-catalog min-w-0 space-y-1 lg:h-full lg:min-h-0 lg:space-y-3 lg:overflow-y-auto lg:overscroll-contain">
        <div className="pos-catalog-tools space-y-1 bg-canvas pb-2 lg:sticky lg:top-0 lg:z-10">
        <ProductSearch value={search} onChange={setSearch} />
        <CategoryFilters categories={activeCategories} selected={selectedCategory} onSelect={setSelectedCategory} />
        </div>
        <div className="pos-catalog-grid grid gap-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {displayedProducts.length?displayedProducts.map(product=><ProductCard key={product.id} product={product} stock={getSafeStock(product,activeBranchId)} disabled={isGlobalDisabled||isProcessing||!canAddDistinctProduct(cart,product.id)} onAdd={addToCart} />):catalogError?null:<div className="col-span-full"><EmptyState title="No hay productos" description={search?`No se encontraron productos para “${search}”.`:'No hay productos registrados en esta selección.'} /></div>}
        </div>
      </section>
      <aside aria-label="Ticket" className="pos-ticket-desktop hidden min-w-0 lg:block">{ticket}</aside>
    </div>
    {mobileDock ? createPortal(ticketLauncher, mobileDock) : ticketLauncher}
    {isCartOpen&&<Drawer bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4" title="Tu ticket" description="Revisa los productos y el método de pago." icon={ShoppingBag} onClose={()=>setIsCartOpen(false)} busy={isProcessing}>{ticket}</Drawer>}
    {showQrModal&&<Dialog title="Escanea para pagar" description="Verifica en tu celular que el abono se haya realizado." onClose={()=>setShowQrModal(false)} busy={isProcessing} className="max-w-sm">
      <p className="text-center text-3xl font-bold text-accent">S/ {payment==='mixto'?Number(splitYape).toFixed(2):total.toFixed(2)}</p>
      <div className="mx-auto flex aspect-square w-full max-w-60 items-center justify-center rounded-2xl border border-line bg-panel p-3">{qrUrl?<img src={qrUrl} alt="QR Yape" className="size-full object-contain" />:<Alert variant="warning">QR no configurado en Ajustes.</Alert>}</div>
      <div className="grid grid-cols-2 gap-2"><Button variant="secondary" disabled={isProcessing} onClick={()=>setShowQrModal(false)}>Cancelar</Button><Button variant="success" onClick={processSale} loading={isProcessing} disabled={!isOnline||isGlobalDisabled||catalogBlocked||!!checkoutBlocked||!isPaymentValid||!runtimeCapabilities.saleOnline||isProcessing}>{isProcessing?'Procesando…':'Validar pago'}</Button></div>
    </Dialog>}
    {draftReview?.branchId === activeBranchId && draftReview.userId === user.uid && <DraftSaleReview key={`${modalScope}:${draftReview.saleId ?? draftReview.id}`} sale={draftReview} user={user} activeBranchId={activeBranchId} onClose={() => setDraftReview(null)} onResult={result => { acceptReviewedSale(result); setDraftReview(null); }} />}
  </div>{cashModals}</>;
}
export default POS;
