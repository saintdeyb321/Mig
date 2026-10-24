import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './Dialog';

// Presentation-only bridge for operations that already request confirmation.
export function useConfirmDialog() {
  const [message, setMessage] = useState(null);
  const pending = useRef(null);
  const confirm = useCallback(text => new Promise(resolve => {
    pending.current?.(false);
    pending.current = resolve;
    setMessage(text);
  }), []);
  const finish = useCallback(answer => {
    const resolve = pending.current;
    pending.current = null;
    setMessage(null);
    resolve?.(answer);
  }, []);
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);
  const confirmation = message === null ? null : <ConfirmDialog title="Confirmar acción" description={message} onClose={() => finish(false)} onConfirm={() => finish(true)} />;
  return { confirm, confirmation };
}
