const businessModules = Object.freeze({
  dueño: ['pos', 'contracts', 'history', 'agenda', 'products', 'categories', 'reports', 'users', 'settings'],
  cajero: ['pos', 'contracts', 'history'],
});

export function getSessionContext(user) {
  if (!user?.uid) return 'anonymous';
  const role = String(user.role || '').toLowerCase();
  if (role === 'superadmin') return 'platform-admin';
  if (Object.hasOwn(businessModules, role) && typeof user.businessId === 'string'
    && user.businessId.trim() && user.businessId.trim() !== 'platform-admin') return 'business';
  return 'unassigned';
}

export const isBusinessSession = user => getSessionContext(user) === 'business';

export function getSessionModules(user) {
  const context = getSessionContext(user);
  if (context === 'platform-admin') return ['superadmin'];
  return context === 'business' ? [...businessModules[String(user.role).toLowerCase()]] : [];
}

export function getSessionTab(user, requested) {
  const modules = getSessionModules(user);
  return modules.includes(requested) ? requested : modules[0] ?? null;
}
