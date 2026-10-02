import { useEffect, useState } from 'react';
import { createSubscriptionScope } from '../utils/subscriptionScope';

export const EMPTY_LIST = [];

export function useScopedSubscription(scopeKey, subscribe, initialData = EMPTY_LIST) {
  const [snapshot, setSnapshot] = useState(() => ({
    scopeKey, data: initialData, isLoading: Boolean(scopeKey), error: null,
  }));

  if (snapshot.scopeKey !== scopeKey) {
    setSnapshot({ scopeKey, data: initialData, isLoading: Boolean(scopeKey), error: null });
  }

  useEffect(() => {
    if (!scopeKey) return;
    const scope = createSubscriptionScope();
    const unsubscribe = subscribe(
      scope.guard(data => setSnapshot({ scopeKey, data, isLoading: false, error: null })),
      scope.guard(error => setSnapshot({ scopeKey, data: initialData, isLoading: false, error })),
    );
    return () => {
      scope.close();
      unsubscribe();
    };
  }, [scopeKey, subscribe, initialData]);

  // Hide the old result during the render that precedes effect cleanup.
  return scopeKey && snapshot.scopeKey === scopeKey
    ? snapshot
    : { data: initialData, isLoading: Boolean(scopeKey), error: null };
}
