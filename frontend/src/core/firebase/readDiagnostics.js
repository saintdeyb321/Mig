import { withQueryContext } from './queryErrors.js';
const counts = new Map();
// Observed documents, not a billing estimate: Rules/index reads and minimum charges are external.
export function checkedRead(read, area, signal) {
  return async (...args) => {
    signal?.throwIfAborted();
    let snapshot;
    try { snapshot = await read(...args); } catch (error) { throw withQueryContext(error, area); }
    const previous = counts.get(area) ?? { queries: 0, documents: 0 };
    counts.set(area, { queries: previous.queries + 1, documents: previous.documents + (snapshot.size ?? (snapshot.exists() ? 1 : 0)) });
    signal?.throwIfAborted();
    return snapshot;
  };
}
export const readDiagnostics = () => Object.fromEntries([...counts].map(([area, count]) => [area, { ...count }]));
