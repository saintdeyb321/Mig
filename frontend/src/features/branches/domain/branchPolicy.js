export const DEFAULT_MAX_ACTIVE_BRANCHES = 1;
export const MAX_ACTIVE_BRANCHES = 100;
export const DEFAULT_MAX_REGISTERED_BRANCHES = 5;
export const MAX_REGISTERED_BRANCHES = 200;
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
export function validateBranchQuotas(maxActiveBranches, maxRegisteredBranches) {
  validateBranchQuota(maxActiveBranches);
  if (!Number.isInteger(maxRegisteredBranches) || maxRegisteredBranches < maxActiveBranches || maxRegisteredBranches > MAX_REGISTERED_BRANCHES) {
    throw new Error(`El cupo de sedes registradas debe ser un entero entre el cupo activo (${maxActiveBranches}) y ${MAX_REGISTERED_BRANCHES}.`);
  }
  return { maxActiveBranches, maxRegisteredBranches };
}
export function nextBranchInventory(license, id, { create, wasActive, willBeActive }) {
  if (license?.branchQuotaVersion !== 1 || license.registeredBranchQuotaVersion !== 1) throw new Error('Regulariza los inventarios de sedes con SuperAdmin antes de nuevas altas o cambios de estado.');
  validateBranchQuotas(license.maxActiveBranches, license.maxRegisteredBranches);
  const active = license.activeBranchIds, registered = license.registeredBranchIds;
  const validIds = (ids, maximum) => Array.isArray(ids) && ids.length >= 1 && ids.length <= maximum
    && new Set(ids).size === ids.length && ids.every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value));
  if (!validIds(active, license.maxActiveBranches) || !validIds(registered, license.maxRegisteredBranches)
    || !active.every(value => registered.includes(value)) || active.includes(id) !== wasActive) throw new Error('El inventario de cupos no coincide con la sede. Requiere revisión administrativa.');
  if (create && registered.includes(id)) throw new Error('Este ID ya fue registrado; no se puede reutilizar para otra sede.');
  if (!create && !registered.includes(id)) throw new Error('Sede histórica fuera del inventario registrado; requiere revisión administrativa.');
  const registeredBranchIds = create ? [...registered, id] : registered;
  const activeBranchIds = wasActive === willBeActive ? active : willBeActive ? [...active, id] : active.filter(value => value !== id);
  if (registeredBranchIds.length > license.maxRegisteredBranches) throw new Error('Se alcanzó el máximo de sedes registradas. Inactivar no libera esta plaza.');
  if (activeBranchIds.length > license.maxActiveBranches) throw new Error('Se alcanzó el máximo de sedes activas de la licencia.');
  if (!activeBranchIds.length) throw new Error('Conserva al menos una sede activa para operar.');
  return { activeBranchIds, registeredBranchIds };
}
