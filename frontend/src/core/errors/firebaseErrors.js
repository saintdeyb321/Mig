export function getFirebaseErrorCode(error) {
  return String(error?.code || '').replace(/^(firestore|auth|storage)\//, '');
}

export function isPermissionDenied(error) {
  return getFirebaseErrorCode(error) === 'permission-denied';
}

export function firebaseErrorMessage(error) {
  const code = getFirebaseErrorCode(error);
  if (code === 'permission-denied') return 'Permiso denegado: revisa la cuenta, negocio, sede, licencia y Rules publicadas. No reintentes un cobro sin consultar primero su recibo.';
  if (code === 'failed-precondition') return `Precondición o índice pendiente: revisa los índices publicados y el detalle de Firebase. ${error.message || ''}`;
  if (code === 'unavailable') return 'Firestore no está disponible. Revisa la conexión y conserva los pendientes; una respuesta perdida no confirma ni descarta un cobro.';
  return error?.message || 'No se pudo completar la operación.';
}
