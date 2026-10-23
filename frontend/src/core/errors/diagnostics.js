const known = new Set(['capability-unavailable', 'unavailable', 'deadline-exceeded', 'network-request-failed', 'offline', 'permission-denied', 'unauthenticated', 'tenant-restricted', 'outside-shift', 'insufficient-stock', 'price-changed', 'invalid-session', 'closed-session', 'sale-conflict', 'AbortError']);
const areas = new Set(['functions', 'sale', 'sync', 'network', 'license', 'storage', 'print', 'report', 'render']);
const states = new Set(['pending', 'confirmed', 'rejected', 'review', 'failed', 'offline', 'restricted']);
const events = [], recent = new Map();
export function reportDiagnostic(area, error, state = 'failed', { now = Date.now(), log = console } = {}) {
  if (!areas.has(area) || !states.has(state)) return;
  const raw = String(error?.code ?? error?.name ?? '').replace(/^(functions|firestore|storage)\//, '');
  const code = known.has(raw) ? raw : 'unknown';
  const key = `${area}:${state}:${code}`;
  if (now - (recent.get(key) ?? -Infinity) < 60000) return;
  recent.set(key, now);
  const event = { area, state, code, at: now };
  events.push(event); if (events.length > 100) events.shift();
  // Local bounded diagnostics only; never include payloads, messages, names, tokens or amounts.
  try { log.info('migapos_event', event); } catch { /* Diagnostics cannot change durable queue outcomes. */ }
}
export const diagnosticSnapshot = () => events.map(event => ({ ...event }));
