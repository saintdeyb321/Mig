import { useCallback, useEffect, useState } from 'react';
import { createSubscriptionScope } from '../utils/subscriptionScope';

export const EMPTY_LIST = [];

export function useScopedSubscription(scopeKey, subscribe, initialData = EMPTY_LIST, { preserveOnError = false } = {}) {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const [snapshot, setSnapshot] = useState(() => ({
    scopeKey, data: initialData, isLoading: Boolean(scopeKey), error: null,
  }));

  if (snapshot.scopeKey !== scopeKey) {
    setSnapshot({ scopeKey, data: initialData, isLoading: Boolean(scopeKey), error: null });
  }

  useEffect(() => {
    if (!scopeKey) return;
    const scope = createSubscriptionScope();
    let timer = setTimeout(scope.guard(() => { timer = null; setSnapshot(previous => ({ ...previous, isLoading: false, isStale: true,
      error: Object.assign(new Error('No se confirmó la lectura con el servidor. Comprueba la conexión y reintenta.'), { code: 'unavailable' }) })); }), 10000);
    const done = () => { clearTimeout(timer); timer = null; };
    const unsubscribe = subscribe(
      scope.guard((data, metadata) => {
        const isStale = metadata?.fromCache === true || metadata?.hasPendingWrites === true;
        if (!isStale) done();
        setSnapshot({ scopeKey, data, isLoading: isStale && timer !== null, isStale, error: isStale && timer === null ? Object.assign(new Error('Lectura local pendiente de confirmar con el servidor.'), { code: 'unavailable' }) : null });
      }),
      scope.guard(error => { done(); setSnapshot(previous => ({ scopeKey,
        data: preserveOnError && previous.scopeKey === scopeKey ? previous.data : initialData,
        isLoading: false, isStale: true, error })); }),
    );
    return () => { scope.close(); done(); unsubscribe(); };
  }, [scopeKey, subscribe, initialData, attempt, preserveOnError]);

  // Hide the old result during the render that precedes effect cleanup.
  return scopeKey && snapshot.scopeKey === scopeKey
    ? { ...snapshot, retry }
    : { data: initialData, isLoading: Boolean(scopeKey), isStale: true, error: null, retry };
}
