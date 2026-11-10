const known = new Set(['capability-unavailable', 'unavailable', 'deadline-exceeded', 'network-request-failed', 'offline', 'permission-denied', 'unauthenticated', 'user-disabled', 'user-token-expired', 'invalid-user-token', 'tenant-restricted', 'outside-shift', 'insufficient-stock', 'price-changed', 'invalid-session', 'closed-session', 'sale-conflict', 'AbortError']);
const areas = new Set(['functions', 'sale', 'sync', 'network', 'profile', 'license', 'storage', 'print', 'report', 'render']);
const states = new Set(['pending', 'confirmed', 'rejected', 'review', 'failed', 'offline', 'restricted']);
const events = [], recent = new Map();
export function reportDiagnostic(area, error, state = 'failed', { now = Date.now(), log = console } = {}) {
  if (!areas.has(area) || !states.has(state)) return;
  const raw = String(error?.code ?? error?.name ?? '').replace(/^(functions|firestore|storage|auth)\//, '');
  const code = known.has(raw) ? raw : 'unknown';
  storeDiagnostic({ area, state, code, at: now }, `${area}:${state}:${code}`, log);
}
function storeDiagnostic(event, key, log) {
  const now = event.at;
  if (now - (recent.get(key) ?? -Infinity) < 60000) return;
  recent.set(key, now);
  events.push(event); if (events.length > 100) events.shift();
  // Local bounded diagnostics only; never include payloads, messages, names, tokens or amounts.
  try { log.info('migapos_event', event); } catch { /* Diagnostics cannot change durable queue outcomes. */ }
}

const accessVerdicts = new Set(['active', 'loading', 'offline-unverified', 'network-error', 'permission-denied',
  'auth-unverified', 'configuration-error', 'suspended', 'expired', 'tenant-missing-confirmed', 'license-missing-confirmed']);
export function reportAccessDiagnostic(source, verdict, { license, tenant, identityMatches, environment }, { now = Date.now(), log = console } = {}) {
  if (!['watch', 'manual', 'online', 'resume'].includes(source) || !accessVerdicts.has(verdict)) return;
  const describe = record => {
    const raw = String(record?.error?.code ?? '').replace(/^(firestore|auth)\//, '');
    return { present: record?.received && !record.error && record.metadata ? Boolean(record.data) : null,
      fromCache: typeof record?.metadata?.fromCache === 'boolean' ? record.metadata.fromCache : null,
      pendingWrites: typeof record?.metadata?.hasPendingWrites === 'boolean' ? record.metadata.hasPendingWrites : null,
      code: raw ? (known.has(raw) ? raw : 'unknown') : null };
  };
  storeDiagnostic({ area: 'license', source, verdict, identityMatches: identityMatches === true,
    environment: ['production', 'emulator', 'staging'].includes(environment) ? environment : 'unknown',
    license: describe(license), tenant: describe(tenant), at: now }, `access:${source}:${verdict}`, log);
}
export const diagnosticSnapshot = () => events.map(event => ({ ...event }));
