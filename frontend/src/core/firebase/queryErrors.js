import { getFirebaseErrorCode } from '../errors/firebaseErrors.js';
import { firestoreQueryCatalog, queryIndexFields } from './queryCatalog.js';

export function withQueryContext(error, area) {
  if (error?.queryArea) return error;
  return Object.assign(new Error(error?.message || String(error), { cause: error }), { code: error?.code, queryArea: area });
}
export function realIndexCreationUrl(message, projectId = 'migapos') {
  for (const match of String(message).matchAll(/https:\/\/console\.firebase\.google\.com\/[^\s<>"']+/g)) {
    try {
      const url = new URL(match[0].replace(/[).,;]+$/, ''));
      const parts = url.pathname.split('/').map(decodeURIComponent);
      if (url.protocol === 'https:' && url.hostname === 'console.firebase.google.com' && !url.port && !url.username && !url.password
        && parts[parts.indexOf('project') + 1] === projectId && parts.includes('indexes') && url.searchParams.get('create_composite')) return url.href;
    } catch { /* A malformed or untrusted URL is retained only as plain technical text. */ }
  }
  return null;
}
const groups = {
  personnel: ['personnel-users', 'personnel-invites'], catalog: ['products', 'categories'],
  reports: ['sales-period', 'payments-period', 'contracts-period', 'cash-period'],
  payments: ['payments-contract', 'payments-session', 'payments-period'],
  'payments-period': ['payments-contract', 'payments-session', 'payments-period'],
  'platform-detail': ['admin-detail', 'admin-presence'], administration: ['admin-page', 'admin-owner', 'admin-email'],
  'contracts-audit': ['contracts-by-ids'],
};
export function queryErrorDiagnostic(error, area) {
  const code = getFirebaseErrorCode(error), technical = error?.message || String(error);
  const context = error?.queryArea || area || 'consulta no identificada';
  const missingIndex = code === 'failed-precondition' && /index|índice|create_composite/i.test(technical);
  const prefixes = groups[context] || [context];
  const shapes = firestoreQueryCatalog.filter(record => prefixes.some(prefix => record.id === prefix || record.id.startsWith(prefix + '-')));
  return { code, technical, area: context, missingIndex,
    url: missingIndex ? realIndexCreationUrl(technical) : null,
    message: missingIndex ? 'Esta lectura requiere un índice que aún no está disponible. El administrador puede localizar su definición en la guía de índices.'
      : code === 'permission-denied' || code === 'unauthenticated' ? 'Firestore rechazó el permiso de lectura. Revisa cuenta, negocio y Rules publicadas; no significa que los registros hayan desaparecido.'
      : ['unavailable', 'deadline-exceeded'].includes(code) ? 'No se confirmó la lectura con el servidor. Conserva los datos pendientes y reintenta la conexión.'
      : code === 'failed-precondition' ? 'Firestore rechazó una precondición. Revisa el detalle técnico; no se ha identificado como falta de índice.'
      : 'No se pudo completar la lectura. No se confirma que el módulo esté vacío.',
    shapes: shapes.map(record => ({ id: record.id, collection: record.collection, scope: record.scope, fields: queryIndexFields(record), kind: record.kind })) };
}
