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
  return useSyncExternalStore(resource.subscribe, resource.get);
}

export function useSessionScroll(key, ready) {
  const resources = useSessionResources();
  const position = resources.cell(`scroll:${key}`, 0);
  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => window.scrollTo(0, position.get()));
    return () => { cancelAnimationFrame(frame); position.set(window.scrollY); };
  }, [position, ready]);
}
