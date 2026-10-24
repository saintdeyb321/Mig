export const DEFAULT_MAX_ACTIVE_BRANCHES = 1;
export const MAX_ACTIVE_BRANCHES = 100;
export const isBranchOperational = branch => branch?.status === 'activo';
export const operationalBranches = branches => (branches || []).filter(isBranchOperational);
export function resolveOperationalBranch(user, branches, requested) {
  const active = operationalBranches(branches);
  if (user?.role === 'cajero') return active.some(branch => branch.id === user.branchId) ? user.branchId : null;
  if (user?.role !== 'dueño') return null;
  if (requested === 'global' || active.some(branch => branch.id === requested)) return requested;
  return active.length === 1 ? active[0].id : 'global';
}
export function validateBranchQuota(value) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_ACTIVE_BRANCHES) throw new Error(`El cupo debe ser un entero de 1 a ${MAX_ACTIVE_BRANCHES} sedes activas.`);
  return value;
}
export function nextActiveBranchIds(license, id, wasActive, willBeActive) {
  if (license?.branchQuotaVersion !== 1 || !Array.isArray(license.activeBranchIds)) throw new Error('Cupo histórico sin regularizar. SuperAdmin debe revisar las sedes antes de nuevas altas o cambios de estado.');
  validateBranchQuota(license.maxActiveBranches);
  const ids = license.activeBranchIds;
  if (new Set(ids).size !== ids.length || ids.length > license.maxActiveBranches || ids.includes(id) !== wasActive) throw new Error('El inventario de cupos no coincide con la sede. Requiere revisión administrativa.');
  const next = willBeActive ? [...ids, id] : ids.filter(value => value !== id);
  if (next.length > license.maxActiveBranches) throw new Error('Se alcanzó el máximo de sedes activas de la licencia.');
  if (!next.length) throw new Error('Conserva al menos una sede activa para operar.');
  return next;
}
