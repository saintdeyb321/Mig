const collections = new Set(['tenants', 'licenses', 'settings', 'branches', 'categories', 'products', 'customers', 'sales', 'contracts', 'payments',
  'cash_sessions', 'active_cash_sessions', 'users', 'invites', 'spark_contract_operations', 'alerts', 'audit_events', 'daily_stats', 'notifications',
  'platform_jobs', 'platform_operations', 'platform_audit', 'owner_email_claims']);
export function validCleanupPath(path, businessId) {
  if (typeof path !== 'string' || path.includes('\\') || path.includes('\0')) return false;
  const parts = path.split('/');
  if (parts.some(part => !part || part === '.' || part === '..') || !collections.has(parts[0])) return false;
  if (parts.length === 2) return !['tenants', 'licenses', 'settings'].includes(parts[0]) || parts[1] === businessId;
  return parts.length === 4 && parts[0] === 'platform_jobs' && ['scopes', 'asset_sources'].includes(parts[2]);
}
export function prepareCleanupPlan(verified, businessId) {
  if (verified?.manifest?.businessId !== businessId || verified.manifest.purpose !== 'inventory' || !verified.sections) throw new Error('Selecciona un inventario del negocio, verificado localmente; no un archivo de fotos o datos sin inventariar.');
  const candidates = new Set(), references = new Set();
  for (const section of verified.sections) for (const record of section.records) {
    if (record.businessId !== businessId || !validCleanupPath(record.path, businessId)) throw new Error('Ruta de inventario inválida o fuera del negocio.');
    candidates.add(record.path);
    (record.references ?? []).forEach(path => references.add(path));
  }
  const paths = [...candidates].sort((a, b) => b.split('/').length - a.split('/').length || a.localeCompare(b));
  const checkpoints = [];
  for (let offset = 0; offset < paths.length; offset += 50) checkpoints.push({ batch: checkpoints.length + 1, paths: paths.slice(offset, offset + 50), status: 'not-started' });
  return { format: 'migapos-cleanup-dry-run', version: 1, businessId, sourceIntegrity: verified.integrity,
    sourceFinishedAt: verified.manifest.finishedAt, sourceSections: verified.manifest.sections, sourcePartial: verified.manifest.partial,
    exhaustive: false, executable: false, businessWrites: 0, authAction: 'manual-review-only',
    paths, checkpoints, unverifiedReferences: [...references].sort(),
    blockers: ['Autorización destructiva independiente pendiente.', 'No se han enumerado subcolecciones desconocidas ni padres ausentes.',
      'Pendientes/fotos de cada dispositivo y cuentas Authentication requieren revisión manual.', 'Confirmar procedencia, propiedad de rutas, cierre operativo y copia de datos verificada antes de cualquier borrado.'] };
}
