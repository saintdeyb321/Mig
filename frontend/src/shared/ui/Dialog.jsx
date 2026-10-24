import { useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as AlertPrimitive from '@radix-ui/react-alert-dialog';
import { PanelsTopLeft, X } from 'lucide-react';
import { cn } from './cn';
import { Button } from './Button';
import { IconButton } from './IconButton';

export function DialogHeader({ children, className }) {
  return <div className={cn('border-b border-line pb-4', className)}>{children}</div>;
}
export function DialogFooter({ children, className }) {
  return <div className={cn('sticky -bottom-5 z-10 -mx-5 -mb-5 mt-5 flex shrink-0 flex-col-reverse gap-2 border-t border-line bg-panel/95 px-5 py-4 backdrop-blur-sm sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:flex-row sm:justify-end sm:px-6', className)}>{children}</div>;
}
function DialogSurface({ open = true, onOpenChange, onClose, title, description, children, busy = false, dismissible = true, className, bodyClassName, icon = PanelsTopLeft, drawer = false, alert = false }) {
  const Icon = icon;
  const returnFocus = useRef(document.activeElement);
  const Primitive = alert ? AlertPrimitive : DialogPrimitive;
  const Close = alert ? Primitive.Cancel : Primitive.Close;
  const change = next => { if (!busy && (next || dismissible)) { onOpenChange?.(next); if (!next) onClose?.(); } };
  return <Primitive.Root open={open} onOpenChange={change}><Primitive.Portal>
    <div className="pointer-events-none fixed inset-0 z-50 isolate">
    <Primitive.Overlay className="pointer-events-auto absolute inset-0 bg-ink/55 data-[state=open]:animate-enter motion-reduce:animate-none" />
    <Primitive.Content aria-busy={busy || undefined}
      onEscapeKeyDown={event => { if (busy || !dismissible) event.preventDefault(); }}
      onInteractOutside={event => { if (busy || !dismissible) event.preventDefault(); }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        requestAnimationFrame(() => {
          const activeDialog = [...document.querySelectorAll('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')].at(-1);
          const trigger = returnFocus.current;
          if (activeDialog && !activeDialog.contains(trigger)) return;
          if (trigger?.isConnected) trigger.focus({ preventScroll: true });
          else document.getElementById('main-content')?.focus({ preventScroll: true });
        });
      }}
      className={cn('pointer-events-auto fixed left-1/2 z-10 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-white/20 bg-canvas text-ink shadow-float outline-none',
        drawer ? 'bottom-0 max-h-[90dvh] w-full max-w-none rounded-b-none' : 'top-1/2 -translate-y-1/2', className)}>
      <DialogHeader className="flex shrink-0 items-start justify-between gap-3 border-white/10 bg-linear-to-br from-brand-deep to-primary px-5 py-4 text-white sm:px-6 sm:py-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10"><Icon aria-hidden="true" className="size-5" /></span>
        <div className="min-w-0 flex-1"><Primitive.Title className="text-lg font-extrabold tracking-tight">{title}</Primitive.Title>
          <Primitive.Description className={cn('mt-1 text-xs leading-relaxed text-white/75', !description && 'sr-only')}>{description || 'Revisa y completa los datos de esta operación.'}</Primitive.Description></div>
        {dismissible && <Close asChild><IconButton label="Cerrar diálogo" disabled={busy} className="-mr-1 -mt-1 text-white/80 hover:bg-white/10 hover:text-white"><X /></IconButton></Close>}
      </DialogHeader>
      <div className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6", bodyClassName)}><fieldset disabled={busy} className="contents space-y-4">{children}</fieldset></div>
    </Primitive.Content>
    </div>
  </Primitive.Portal></Primitive.Root>;
}
export function Dialog(props) { return <DialogSurface {...props} />; }
export function Drawer(props) { return <DialogSurface {...props} drawer />; }
export function ConfirmDialog({ onConfirm, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', children, busy, ...props }) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const occupied = busy || pending;
  const confirm = async event => {
    event.preventDefault();
    if (busy || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError('');
    try { await onConfirm(event); }
    catch (error) { setError(error?.message || 'No se pudo completar la operación. Intenta nuevamente.'); }
    finally { inFlight.current = false; setPending(false); }
  };
  return <DialogSurface {...props} busy={occupied} alert>{children}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {onConfirm && <DialogFooter>
    <AlertPrimitive.Cancel asChild><Button variant="secondary" disabled={occupied}>{cancelLabel}</Button></AlertPrimitive.Cancel>
    <AlertPrimitive.Action asChild><Button variant="danger" loading={occupied} onClick={confirm}>{confirmLabel}</Button></AlertPrimitive.Action>
  </DialogFooter>}</DialogSurface>;
}
