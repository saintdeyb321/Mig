import { useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as AlertPrimitive from '@radix-ui/react-alert-dialog';
import { X } from 'lucide-react';
import { cn } from './cn';
import { Button } from './Button';
import { IconButton } from './IconButton';

export function DialogHeader({ children, className }) {
  return <div className={cn('border-b border-line pb-4', className)}>{children}</div>;
}
export function DialogFooter({ children, className }) {
  return <div className={cn('mt-5 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end', className)}>{children}</div>;
}
function DialogSurface({ open = true, onOpenChange, onClose, title, description, children, busy = false, dismissible = true, className, drawer = false, alert = false }) {
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
          const activeDialog = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
          const trigger = returnFocus.current;
          if (activeDialog && !activeDialog.contains(trigger)) return;
          if (trigger?.isConnected) trigger.focus({ preventScroll: true });
          else document.getElementById('main-content')?.focus({ preventScroll: true });
        });
      }}
      className={cn('pointer-events-auto fixed left-1/2 z-10 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 flex-col gap-4 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-panel p-5 text-ink shadow-float outline-none sm:p-6',
        drawer ? 'bottom-0 max-h-[90dvh] w-full max-w-none rounded-b-none pb-[max(1.25rem,env(safe-area-inset-bottom))]' : 'top-1/2 -translate-y-1/2', className)}>
      <DialogHeader className="flex items-start justify-between gap-4">
        <div className="min-w-0"><Primitive.Title className="text-lg font-bold tracking-tight">{title}</Primitive.Title>
          <Primitive.Description className={cn('mt-1 text-sm leading-relaxed text-muted', !description && 'sr-only')}>{description || 'Revisa y completa los datos de esta operación.'}</Primitive.Description></div>
        {dismissible && <Close asChild><IconButton label="Cerrar diálogo" disabled={busy}><X /></IconButton></Close>}
      </DialogHeader>
      <fieldset disabled={busy} className="contents">{children}</fieldset>
    </Primitive.Content>
    </div>
  </Primitive.Portal></Primitive.Root>;
}
export function Dialog(props) { return <DialogSurface {...props} />; }
export function Drawer(props) { return <DialogSurface {...props} drawer />; }
export function ConfirmDialog({ onConfirm, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', children, busy, ...props }) {
  return <DialogSurface {...props} busy={busy} alert>{children}{onConfirm && <DialogFooter>
    <AlertPrimitive.Cancel asChild><Button variant="secondary" disabled={busy}>{cancelLabel}</Button></AlertPrimitive.Cancel>
    <AlertPrimitive.Action asChild><Button variant="danger" loading={busy} onClick={event => { event.preventDefault(); onConfirm(event); }}>{confirmLabel}</Button></AlertPrimitive.Action>
  </DialogFooter>}</DialogSurface>;
}
