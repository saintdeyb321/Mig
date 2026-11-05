// Product policy, independent of environment, account, URL or browser storage.
// Enable each repository only after its Spark protocol and Rules are validated.
export const runtimeCapabilities = Object.freeze({
  mode: 'spark',
  repositoryStrategy: 'spark',
  authentication: true,
  firestore: true,
  hosting: true,
  localPersistence: true,
  localExports: true,
  cloudFunctions: false,
  cloudStorage: false,
  tenantAdministration: true,
  tenantProvisioning: true,
  licenseAdministration: true,
  cashOpening: true,
  saleOnline: true,
  saleVoid: true,
  contractPayments: true,
  cashClosing: true,
  cashReconciliation: false,
  offlineSync: false,
  platformJobs: false,
});

export class CapabilityUnavailableError extends Error {
  constructor(capability, operation) {
    const reason = { cloudStorage: 'Firebase Storage está deshabilitado.', cloudFunctions: 'Cloud Functions está deshabilitado.',
      saleVoid: 'Falta validar atómicamente la compensación de stock y el reembolso de caja.',
      offlineSync: 'Sin protocolo de aceptación que pruebe hora, caja y precios; conserva los pendientes para revisión.',
      cashReconciliation: 'Rules no puede certificar la suma de un libro arbitrario.' }[capability] ?? 'Esta operación aún no se ha migrado.';
    super(`${operation}: no disponible en modo Spark. ${reason} No se confirmó ningún cambio.`);
    this.name = 'CapabilityUnavailableError';
    this.code = 'capability-unavailable';
    this.capability = capability;
    this.operation = operation;
  }
}

export function requireCapability(capability, operation) {
  if (!runtimeCapabilities[capability]) throw new CapabilityUnavailableError(capability, operation);
}
