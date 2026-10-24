import { useEffect, useState } from 'react';
import { SessionResourcesContext } from './sessionResourceHooks.js';
import { createSessionResources } from './sessionResources.js';

export function SessionResourcesProvider({ children }) {
  const [resources] = useState(createSessionResources);
  // Lease cleanup is deferred one microtask for StrictMode's cleanup/setup replay.
  useEffect(() => {
    const release = resources.lease();
    const online = () => resources.retryErrors();
    window.addEventListener('online', online);
    return () => { window.removeEventListener('online', online); release(); };
  }, [resources]);
  return <SessionResourcesContext.Provider value={resources}>{children}</SessionResourcesContext.Provider>;
}
