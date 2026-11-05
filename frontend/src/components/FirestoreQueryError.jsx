import { queryErrorDiagnostic } from '../core/firebase/queryErrors.js';
import { Alert, Button } from '../shared/ui';

export default function FirestoreQueryError({ error, area, user, onRetry, commercial = false }) {
  if (!error) return null;
  const diagnostic = queryErrorDiagnostic(error, area);
  const admin = ['dueño', 'superadmin'].includes(user?.role) || import.meta.env.DEV;
  const message = commercial ? diagnostic.missingIndex ? 'La consulta necesita preparación por el administrador. Conservamos los registros; reintenta después.'
    : ['permission-denied','unauthenticated'].includes(diagnostic.code) ? 'Tu cuenta no pudo acceder a esta información. Solicita revisión al dueño; los registros se conservan.'
    : ['unavailable','deadline-exceeded'].includes(diagnostic.code) ? 'No pudimos actualizar la información. Revisa tu conexión y vuelve a intentar.'
    : 'No se pudo completar la consulta. Reintenta o solicita revisión al administrador.' : diagnostic.message;
  return <Alert variant="danger" title={commercial ? 'No se pudo actualizar' : diagnostic.missingIndex ? 'Índice de Firestore pendiente' : 'Lectura no confirmada'}>
    <p>{message}</p>
    {admin && <details className="mt-3 rounded-xl border border-danger/20 bg-panel/70 p-3"><summary className="min-h-8 cursor-pointer font-semibold">Diagnóstico · {diagnostic.area}</summary>
      <p className="mb-2 text-xs">Código: {diagnostic.code || 'sin código SDK'}. Módulo/consulta: {diagnostic.area}.</p>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">{diagnostic.technical}</pre>
      {diagnostic.url && <a href={diagnostic.url} target="_blank" rel="noopener noreferrer" className="my-3 inline-flex min-h-11 items-center font-bold underline">Crear índice en Firebase Console</a>}
      {diagnostic.missingIndex && <><p className="my-2 text-xs">Definiciones locales: docs/INDICES-FIRESTORE-MIGAPOS.md. Proyecto migapos / base (default). Patrones posibles del módulo; el enlace real del SDK, si existe, identifica la forma exacta.</p><ul className="list-disc space-y-2 pl-4 text-xs">{diagnostic.shapes.slice(0, 8).map(shape => <li key={shape.id}><strong>{shape.id}</strong> · {shape.collection} / {shape.scope} · {shape.fields.map(([field, direction]) => `${field} ${direction === 'DESCENDING' ? 'DESC' : 'ASC'}`).join(' → ')}{shape.kind !== 'composite' && ' · revisar índices simples/exenciones antes de crear compuestos'}</li>)}</ul>{!diagnostic.shapes.length && <p className="text-xs">Forma no identificada automáticamente: buscar el módulo y builder dinámico en la guía. No se genera un enlace ni una definición ficticios.</p>}</>}
    </details>}
    {onRetry && <Button className="mt-3" onClick={onRetry} variant="secondary" size="sm">Reintentar lectura</Button>}
  </Alert>;
}
