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
  financialOperations: false,
  offlineSync: false,
  platformJobs: false,
});

export class CapabilityUnavailableError extends Error {
  constructor(capability, operation) {
    const service = capability === 'cloudStorage' ? 'Firebase Storage' : 'Cloud Functions';
    super(`${operation}: no disponible en modo Spark. ${service} está deshabilitado; esta operación aún no se ha migrado. No se confirmó ningún cambio.`);
    this.name = 'CapabilityUnavailableError';
    this.code = 'capability-unavailable';
    this.capability = capability;
    this.operation = operation;
  }
}

export function requireCapability(capability, operation) {
  if (!runtimeCapabilities[capability]) throw new CapabilityUnavailableError(capability, operation);
}
