import FirestoreQueryError from '../components/FirestoreQueryError';
import { useCatalogData } from '../features/catalog/context/CatalogContext';
import { isBranchOperational } from '../features/branches/domain/branchPolicy';
import { useState, useMemo } from 'react';
import { LockKeyhole, ShoppingBag, UnlockKeyhole } from 'lucide-react';
import { checkoutBlockReason } from '../features/sales/domain/checkoutPolicy.js';
import { parsePaymentCents, saleAmountCents } from '../features/sales/domain/saleModel.js';
import { getSafeStock } from '../features/sales/domain/cartStock';
import { usePOS } from '../features/sales/hooks/usePOS';
import { useTenantData } from '../features/branches/context/TenantContext';
import { useCashRegister } from '../features/cash-register/hooks/useCashRegister';
import { runtimeCapabilities } from '../config/runtimeCapabilities.js';
import { CashRegisterModals } from './CashRegisterModals';
import { Alert, Button, Dialog, Drawer, EmptyState, LoadingState, PageHeader } from '../shared/ui';
import { ProductSearch, CategoryFilters, ProductCard } from './pos/CatalogParts';
import { PaymentFields, PaymentSelector } from './pos/PaymentParts';
import { CashStatus, SaleStatus, Ticket } from './pos/TicketParts';

function POS({ user }) {
  const { businessBranches, activeBranchId } = useTenantData();
  const { error: catalogError, retry: retryCatalog } = useCatalogData();

  const {
    currentSession, isExpired, expiresAt, remainingMinutes, readError, checkSession, isLoadingSession, authorizeOffline, openRegister, calculateClose, confirmClose
  } = useCashRegister(user, activeBranchId);

  const {
    filteredProducts, cart, payment, setPayment, amountPaid, setAmountPaid,
    splitEfectivo, setSplitEfectivo, splitYape, setSplitYape,
    search, setSearch, isProcessing, showQrModal, setShowQrModal, qrUrl,
    addToCart, updateQty, removeFromCart, total, isPaymentValid, paymentValidation, handleCheckoutClick, processSale,
    lastSale, clearLastSale, printReceipt, activeCategories, isLoading
  } = usePOS(user, currentSession);

  const [selectedCategory, setSelectedCategory] = useState('todas');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [checkoutAttempted, setCheckoutAttempted] = useState(false);

  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);

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

  const isGlobalDisabled = branchStatus.isReadOnly || (!currentSession && !branchStatus.isReadOnly) || currentSession?.needsForceClose || isExpired;

  if (isLoading || isLoadingSession) return <LoadingState>Preparando caja registradora…</LoadingState>;
  const selectPayment = method => {
    setPayment(method);
    if(method==='mixto') { setSplitEfectivo('');setSplitYape(''); }
    else setAmountPaid('');
  };
  const requestCheckout = () => {
    setCheckoutAttempted(true);
    if (checkoutBlocked) return;
    if (isExpired) return;
    handleCheckoutClick();
  };
  const action = readError ? <Button variant="secondary" onClick={checkSession}>Reintentar lectura de caja</Button> : !currentSession&&!branchStatus.isReadOnly
    ? <Button className="w-full" onClick={()=>setShowOpenModal(true)}><UnlockKeyhole />Abrir caja para vender</Button>
    : currentSession?.needsForceClose
      ? <Button variant="danger" className="w-full" onClick={()=>setShowCloseModal(true)} disabled={!currentSession.canForceClose}>{currentSession.canForceClose?'Cerrar turno anterior':'Requiere administrador'}</Button>
      : <Button className="w-full" size="lg" onClick={requestCheckout} loading={isProcessing} disabled={isExpired||!runtimeCapabilities.saleOnline||cart.length===0||!isPaymentValid||isProcessing||branchStatus.isReadOnly}>{branchStatus.isReadOnly?'Modo lectura':isProcessing?'Procesando…':'Cobrar'}</Button>;
  const ticket = lastSale ? <SaleStatus sale={lastSale} onPrint={printReceipt} onNew={handleNuevaVenta} />
    : <Ticket drawer={isCartOpen} cart={cart} total={total} onQty={updateQty} onRemove={removeFromCart} isProcessing={isProcessing} action={action}>
      {checkoutAttempted && checkoutBlocked && <Alert variant="warning" title="No se puede confirmar este ticket">{checkoutBlocked} El carrito se conserva completo; no se ha registrado ningún cobro.</Alert>}
      <PaymentSelector payment={payment} onSelect={selectPayment} disabled={branchStatus.isReadOnly||isProcessing} />
      <PaymentFields payment={payment} amountPaid={amountPaid} onAmountPaid={setAmountPaid} splitEfectivo={splitEfectivo} onSplitEfectivo={handleSplitEfectivoChange} splitYape={splitYape} onSplitYape={handleSplitYapeChange} total={total} validation={paymentValidation} disabled={branchStatus.isReadOnly||isProcessing} />
    </Ticket>;
  return <div className="min-w-0 space-y-5">
    {isExpired && <Alert variant="warning" title="Caja vencida">Cierra este turno y abre uno nuevo para cobrar. Los movimientos se conservan.</Alert>}
    <FirestoreQueryError error={readError} area="cash-open" user={user} onRetry={checkSession} />
    <FirestoreQueryError error={catalogError} area="catalog" user={user} onRetry={retryCatalog} />
    <PageHeader title="Punto de venta" icon={ShoppingBag} eyebrow="Venta del día" description="Elige productos y prepara tu ticket." actions={<>
      <CashStatus readOnly={branchStatus.isReadOnly} session={currentSession} isExpired={isExpired} expiresAt={expiresAt} remainingMinutes={remainingMinutes} />
      {currentSession&&!branchStatus.isReadOnly&&<Button variant={currentSession.needsForceClose?'danger':'secondary'} size="sm" disabled={isProcessing} onClick={()=>setShowCloseModal(true)}><LockKeyhole />{currentSession.needsForceClose?'Forzar cierre de caja':'Cerrar caja'}</Button>}
    </>} />
    {branchStatus.isReadOnly&&<Alert variant="warning" title="Modo lectura">{branchStatus.reason==='global'?'Estás en la vista global. Selecciona una sucursal específica en el menú.':`La sucursal ${branchStatus.name} está inactiva.`}</Alert>}
    {currentSession?.needsForceClose&&!branchStatus.isReadOnly&&<Alert variant="danger" title="Acción requerida">Hay un turno o reserva offline de otro usuario. {currentSession.canForceClose?'Verifica el conteo para cerrarlo como administrador.':'Solicita el cierre a un administrador.'}</Alert>}
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] 2xl:grid-cols-[minmax(0,1fr)_23rem]">
      <section aria-label="Catálogo de productos" className="min-w-0 space-y-4 pb-20 lg:pb-0">
        <ProductSearch value={search} onChange={setSearch} />
        <CategoryFilters categories={activeCategories} selected={selectedCategory} onSelect={setSelectedCategory} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {displayedProducts.length?displayedProducts.map(product=><ProductCard key={product.id} product={product} stock={getSafeStock(product,activeBranchId)} disabled={isGlobalDisabled||isProcessing} onAdd={addToCart} />):catalogError?null:<EmptyState title="No hay productos" description={search?`No se encontraron productos para “${search}”.`:'No hay productos registrados en esta selección.'} />}
        </div>
      </section>
      <aside aria-label="Ticket" className="sticky top-6 hidden min-w-0 lg:block">{ticket}</aside>
    </div>
    <Button className="fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 min-h-14 justify-between rounded-2xl border-white/20 shadow-float sm:inset-x-6 lg:hidden" onClick={()=>setIsCartOpen(true)}><span className="flex items-center gap-2"><ShoppingBag />Ver ticket ({cart.length})</span><span>S/ {total.toFixed(2)}</span></Button>
    {isCartOpen&&<Drawer bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4" title="Tu ticket" description="Revisa los productos y el método de pago." icon={ShoppingBag} onClose={()=>setIsCartOpen(false)} busy={isProcessing}>{ticket}</Drawer>}
    {showQrModal&&<Dialog title="Escanea para pagar" description="Verifica en tu celular que el abono se haya realizado." onClose={()=>setShowQrModal(false)} busy={isProcessing} className="max-w-sm">
      <p className="text-center text-3xl font-bold text-accent">S/ {payment==='mixto'?Number(splitYape).toFixed(2):total.toFixed(2)}</p>
      <div className="mx-auto flex aspect-square w-full max-w-60 items-center justify-center rounded-2xl border border-line bg-panel p-3">{qrUrl?<img src={qrUrl} alt="QR Yape" className="size-full object-contain" />:<Alert variant="warning">QR no configurado en Ajustes.</Alert>}</div>
      <div className="grid grid-cols-2 gap-2"><Button variant="secondary" disabled={isProcessing} onClick={()=>setShowQrModal(false)}>Cancelar</Button><Button variant="success" onClick={processSale} loading={isProcessing} disabled={!!checkoutBlocked||!isPaymentValid||!runtimeCapabilities.saleOnline||isProcessing}>{isProcessing?'Procesando…':'Validar pago'}</Button></div>
    </Dialog>}
    <CashRegisterModals showOpenModal={showOpenModal} setShowOpenModal={setShowOpenModal} showCloseModal={showCloseModal} setShowCloseModal={setShowCloseModal} isLoadingSession={isLoadingSession} openRegister={openRegister} authorizeOffline={authorizeOffline} calculateClose={calculateClose} confirmClose={confirmClose} />
  </div>;
}
export default POS;
