import { requireCapability } from '../../config/runtimeCapabilities.js';

// All unmigrated operations reject before any SDK initialization or network access.
// Future Spark repositories replace individual operations here, never with a fake receipt.
export const sparkRepository = Object.freeze({
  async invoke(operation) {
    requireCapability('cloudFunctions', operation);
    throw new Error(`Falta implementar el repositorio Spark de ${operation}.`);
  },
});
