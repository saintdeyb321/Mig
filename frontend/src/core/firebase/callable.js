import { sparkRepository } from './sparkRepository.js';
import { reportDiagnostic } from '../errors/diagnostics.js';

export async function callBackend(name, payload) {
  try { return await sparkRepository.invoke(name, payload); }
  catch (error) {
    reportDiagnostic('functions', error, 'restricted');
    throw error;
  }
}
