// Audited Spark query shapes. No SDK, account, environment or network access.
const source = (feature, file) => `frontend/src/features/${feature}/infrastructure/${file}.js`;
const records = [];
const add = (id, module, collection, file, anchor, filters = [], order = [], priority = 1, kind = 'composite', note = '') => {
  records.push({ id, module, collection, scope: 'COLLECTION', file, anchor, filters, order, priority, kind, note });
};
const eq = field => [field, '=='];
const asc = field => [field, 'ASCENDING'];
const desc = field => [field, 'DESCENDING'];
const period = field => [[field, '>='], [field, '<=']];
const scoped = (id, module, collection, file, anchor, filters, order, priority = 1, note = '') => {
  for (const branch of [false, true]) add(`${id}-${branch ? 'branch' : 'global'}`, module, collection, file, anchor,
    [eq('businessId'), ...(branch ? [eq('branchId')] : []), ...filters], order, priority, 'composite', note);
};
for (const [id, module, collection, feature, file, anchor, priority] of [
  ['personnel-users', 'Personal', 'users', 'users', 'userRepository', 'subscribeUsers', 0],
  ['personnel-invites', 'Personal', 'invites', 'users', 'userRepository', 'subscribeInvites', 0],
  ['branches', 'Sucursales', 'branches', 'branches', 'branchRepository', 'subscribeBranches', 0],
  ['products', 'Catálogo/POS', 'products', 'catalog', 'catalogRepository', 'subscribeProducts', 1],
  ['categories', 'Categorías', 'categories', 'catalog', 'catalogRepository', 'subscribeCategories', 1],
  ['customers', 'Agenda', 'customers', 'customers', 'customerRepository', 'subscribeCustomers', 2],
]) add(id, module, collection, source(feature, file), anchor, [eq('businessId')], [], priority, 'automatic');
const contracts = source('contracts', 'contractQueryRepository');
scoped('contracts-active', 'Contratos activos', 'contracts', contracts, 'subscribeActiveContracts', [['status', 'in']], [asc('deliveryDate'), asc('__name__')]);
scoped('contracts-history', 'Contratos históricos', 'contracts', contracts, 'getContractHistoryPage', [['status', 'in']], [desc('createdAt'), desc('__name__')], 1, 'Sede repetida en el builder histórico: mismo filtro, no otro índice.');
for (const field of ['confirmedAt', 'createdAt']) {
  scoped(`sales-recent-${field}`, 'Historial POS', 'sales', source('sales', 'salesRepository'), 'subscribeRecentSales', [], [desc(field)]);
  scoped(`sales-period-${field}`, 'Reportes/Excel POS', 'sales', source('sales', 'salesQueryRepository'), 'createSalesPeriodReader', period(field), [asc(field), asc('__name__')], 2, 'createdAt se consulta como Timestamp e ISO; cambia el tipo de valor, no el índice.');
}
add('sales-session', 'Cierre de caja', 'sales', source('sales', 'salesQueryRepository'), 'createSalesSessionReader', [eq('businessId'), eq('branchId'), eq('sessionId')], [asc('__name__')], 1, 'equality-merge', 'Solo igualdades y orden documental: revisar combinación de índices simples; el compuesto local no se exige por defecto.');
const cash = source('cash-register', 'cashQueryRepository');
for (const field of ['openedAt', 'closedAt']) scoped(`cash-period-${field}`, 'Caja/Excel', 'cash_sessions', cash, 'createCashPeriodReader', period(field), [], 1, 'field queda acotado por getSessionsOpenedInPeriod/getSessionsInPeriod en cashRegisterRepository; orden implícito ASC del rango.');
for (const user of [false, true]) add(`cash-open-${user ? 'user' : 'branch'}`, 'Caja abierta', 'cash_sessions', cash, 'createCashStateReader', [eq('businessId'), eq('branchId'), ...(user ? [eq('userId')] : []), eq('status')], [], 1, 'equality-merge', 'Solo igualdades: índices simples combinables; compuesto existente opcional.');
add('cash-last-closed', 'Último cierre de caja', 'cash_sessions', source('cash-register', 'cashRegisterRepository'), 'findLastClosedSession', [eq('businessId'), eq('branchId'), ['status', 'in']], [desc('closedAt')]);
const payments = source('payments', 'paymentQueryRepository');
scoped('payments-contract', 'Cobros por contrato', 'payments', payments, 'getPaymentsByContract', [eq('sourceType'), eq('sourceId')], [asc('occurredAt'), asc('__name__')]);
add('payments-session', 'Cobros por caja', 'payments', payments, 'getPaymentsBySession', [eq('businessId'), eq('sessionId'), eq('branchId')], [asc('occurredAt'), asc('__name__')]);
scoped('payments-period', 'Reportes/Excel cobros', 'payments', payments, 'getPaymentsInPeriod', period('occurredAt'), [asc('occurredAt'), asc('__name__')], 2);
add('contracts-by-ids', 'Auditoría de cobros', 'contracts', payments, 'getContractAuditDocuments', [eq('businessId'), ['__name__', 'in']], [], 2, 'automatic', 'Lotes de 10 IDs; índice simple businessId incluye __name__. Revisar exenciones simples remotas si hay error.');
scoped('contracts-period', 'Reportes/Excel contratos', 'contracts', source('contracts', 'contractPeriodRepository'), 'createContractPeriodReader', period('createdAt'), [asc('createdAt'), asc('__name__')], 2);
add('contracts-legacy', 'Cobros históricos', 'contracts', source('payments', 'sparkLegacyPayments'), 'createSparkLegacyPaymentReader', [eq('businessId')], [asc('__name__')], 2, 'automatic', 'Solo lectura hasta 500 contratos; IDs individuales usan getDoc.');
const notices = source('notifications', 'notificationQueryRepository');
add('notifications-unread', 'Notificaciones', 'notifications', notices, 'subscribeUnreadNotifications', [eq('businessId'), eq('userId'), eq('readAt')], [desc('createdAt')]);
add('notifications-mark-all', 'Notificaciones', 'notifications', notices, 'markAllNotificationsRead', [eq('businessId'), eq('userId'), eq('readAt'), ['createdAt', '<=']], [desc('createdAt')]);
scoped('audit-period', 'Auditoría histórica', 'audit_events', source('notifications', 'auditQueryRepository'), 'createAuditRepository', period('occurredAt'), [desc('occurredAt'), desc('__name__')], 2);
add('alerts-unread', 'Avisos históricos', 'alerts', source('notifications', 'alertRepository'), 'subscribeUnreadAlerts', [eq('businessId'), eq('read')], [], 3, 'equality-merge');
const admin = source('licenses', 'sparkAdministrationRepository');
add('admin-page', 'SaaS Admin', 'licenses', admin, 'administrationPage', [], [asc('__name__')], 3, 'automatic');
for (const collection of ['users', 'invites']) add(`admin-owner-${collection}`, 'SaaS Admin propietario', collection, admin, 'administrationPage', [eq('businessId'), eq('role')], [], 3, 'equality-merge');
add('admin-email', 'SaaS alta negocio', 'users', admin, 'createTenant', [eq('email')], [], 3, 'automatic');
for (const collection of ['branches', 'users', 'invites']) add(`admin-detail-${collection}`, 'Detalle/cupo SaaS', collection, source('licenses', 'platformBusinessRepository'), 'createPlatformBusinessReader', [eq('businessId')], [], 3, 'automatic', 'Solo al abrir: hasta 200 sedes, 50 perfiles y 50 invitaciones; presencia de otras colecciones limitada a 1.');
scoped('pos-voids-period', 'Compensaciones POS', 'pos_voids', source('sales', 'posVoidQueryRepository'), 'inPeriod', period('occurredAt'), [asc('occurredAt'), asc('__name__')], 2);
add('pos-voids-session', 'Devoluciones por caja', 'pos_voids', source('sales', 'posVoidQueryRepository'), 'bySession', [eq('businessId'), eq('branchId'), eq('sessionId')], [asc('occurredAt'), asc('__name__')]);
add('pos-voids-ids-global', 'Estado de tickets POS', 'pos_voids', source('sales', 'posVoidQueryRepository'), 'subscribeIds', [eq('businessId'), ['__name__', 'in']], [asc('__name__')], 1, 'automatic');
add('pos-voids-ids-branch', 'Estado de tickets POS', 'pos_voids', source('sales', 'posVoidQueryRepository'), 'subscribeIds', [eq('businessId'), eq('branchId'), ['__name__', 'in']], [asc('__name__')]);
const inventoryCollections = ['branches', 'categories', 'products', 'customers', 'sales', 'contracts', 'payments', 'cash_sessions', 'active_cash_sessions', 'users', 'invites', 'spark_contract_operations', 'alerts', 'audit_events', 'daily_stats', 'notifications', 'platform_jobs', 'platform_operations', 'platform_audit', 'owner_email_claims', 'pos_sale_groups', 'pos_voids', 'pos_void_groups'];
for (const collection of inventoryCollections) add(`backup-${collection}`, 'Inventario/exportación SaaS', collection, source('backups', 'backupRepository'), 'createBackupRepository', [eq('businessId')], [asc('__name__')], 3, 'automatic', 'Colecciones declaradas; settings/tenants/licenses se leen por ID. No collectionGroup.');
add('backup-job-children', 'Subcolecciones conocidas', 'scopes / asset_sources', source('backups', 'backupRepository'), 'const path =', [], [asc('__name__')], 3, 'automatic', 'Ruta platform_jobs/{id}/(scopes|asset_sources), colección concreta; no colección group ni rutas desconocidas.');
for (const collection of inventoryCollections.filter(name => !['branches', 'users', 'invites'].includes(name))) add(`admin-presence-${collection}`, 'Presencia inicial SaaS', collection, source('licenses', 'platformBusinessRepository'), 'result.inventory', [eq('businessId')], [], 3, 'automatic', 'Muestra de 1 documento, no conteo total.');
export const firestoreQueryCatalog = records;

export const reviewedSDKQueryCounts = {
  [source('catalog', 'catalogRepository')]: 2, [source('users', 'userRepository')]: 2,
  [source('branches', 'branchRepository')]: 1, [source('cash-register', 'cashRegisterRepository')]: 1,
  [source('cash-register', 'cashQueryRepository')]: 2, [source('contracts', 'contractQueryRepository')]: 2,
  [source('contracts', 'contractPeriodRepository')]: 1, [source('sales', 'salesRepository')]: 1,
  [source('sales', 'salesQueryRepository')]: 2, [source('payments', 'paymentQueryRepository')]: 2,
  [source('sales', 'posVoidQueryRepository')]: 2,
  [source('payments', 'sparkLegacyPayments')]: 1, [source('notifications', 'notificationQueryRepository')]: 2,
  [source('notifications', 'auditQueryRepository')]: 1, [source('notifications', 'alertRepository')]: 1,
  [source('customers', 'customerRepository')]: 1, [source('licenses', 'sparkAdministrationRepository')]: 4,
  [source('licenses', 'platformBusinessRepository')]: 3, [source('backups', 'backupRepository')]: 2,
};
export const dynamicQueryReviews = {
  [source('sales', 'posVoidQueryRepository')]: 'Negocio/sede fijos; filtros por sesión o rango occurredAt, páginas <=200, máximo 10000; listeners de hasta 50 IDs en lotes de 10.',
  [source('cash-register', 'cashQueryRepository')]: 'field: openedAt/closedAt, wrappers de cashRegisterRepository; branch/user opcionales.',
  [source('sales', 'salesRepository')]: 'field: confirmedAt/createdAt; sede opcional.',
  [source('sales', 'salesQueryRepository')]: 'ranges: confirmedAt Timestamp, createdAt Timestamp/ISO; sede y cursor opcionales.',
  [source('payments', 'paymentQueryRepository')]: 'filters se construye únicamente en getPaymentsByContract, getPaymentsBySession y getPaymentsInPeriod; sede/cursor opcionales.',
  [source('notifications', 'notificationQueryRepository')]: 'unread() aporta businessId/userId/readAt; cutoff solo añade rango sobre createdAt.',
  [source('contracts', 'contractQueryRepository')]: 'status in constantes activas/cerradas, sede opcional; builder histórico repite branchId idéntico.',
  [source('contracts', 'contractPeriodRepository')]: 'Mismo createdAt ASC, valores Timestamp/ISO y sede/cursor opcionales.',
  [source('notifications', 'auditQueryRepository')]: 'Sede/cursor opcionales; verificar reachability en esta versión.',
  [source('licenses', 'sparkAdministrationRepository')]: 'Cursor documental de licencias; propietario users/invites con filtros literales iguales.',
  [source('backups', 'backupRepository')]: 'name acotado a BACKUP_COLLECTIONS; path acotado a scopes/asset_sources bajo jobs leídos del negocio. No enumera subcolecciones desconocidas.',
  [source('licenses', 'platformBusinessRepository')]: 'name acotado a users/invites/BACKUP_COLLECTIONS; presencia limit 1, no conteo exhaustivo.',
  [source('payments', 'sparkLegacyPayments')]: 'Cursor de IDs de contratos; lectura individual por ID no precisa compuesto.',
};
export function queryIndexFields(record) {
  const ordered = record.order.length ? record.order : [...new Set(record.filters.filter(([, op]) => !['==', 'in'].includes(op)).map(([field]) => field))].map(asc);
  const orderNames = new Set(ordered.map(([field]) => field));
  const equalities = [...new Set(record.filters.filter(([field, op]) => ['==', 'in'].includes(op) && field !== '__name__' && !orderNames.has(field)).map(([field]) => field))];
  const fields = [...equalities.map(asc), ...ordered];
  if (!fields.some(([field]) => field === '__name__')) fields.push(['__name__', ordered.at(-1)?.[1] ?? 'ASCENDING']);
  return fields;
}
