import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';

export const SessionResourcesContext = createContext(null);
export const useSessionResources = () => useContext(SessionResourcesContext);
export function useSessionState(key, initial) {
  const resources = useSessionResources();
  const cell = resources.cell(`view:${key}`, initial);
  return [useSyncExternalStore(cell.subscribe, cell.get), cell.set, cell];
}
export function useSharedSubscription(key, start, initial) {
  const resources = useSessionResources();
  const resource = resources.watch(key, start, initial);
  const snapshot = useSyncExternalStore(resource.subscribe, resource.get);
  return { ...snapshot, retry: resource.refresh };
}

export function useSessionScroll(key, ready) {
  const resources = useSessionResources();
  const position = resources.cell(`scroll:${key}`, 0);
  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => window.scrollTo(0, position.get()));
    const save = () => position.set(window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', save); };
  }, [position, ready]);
}
