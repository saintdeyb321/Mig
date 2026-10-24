import { useEffect, useState } from 'react';
import { SessionResourcesContext } from './sessionResourceHooks.js';
import { createSessionResources } from './sessionResources.js';

export function SessionResourcesProvider({ children }) {
  const [resources] = useState(createSessionResources);
  // Lease cleanup is deferred one microtask for StrictMode's cleanup/setup replay.
  useEffect(() => resources.lease(), [resources]);
  return <SessionResourcesContext.Provider value={resources}>{children}</SessionResourcesContext.Provider>;
}
