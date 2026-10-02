export function getFirebaseErrorCode(error) {
  return String(error?.code || '').replace(/^(firestore|auth|storage)\//, '');
}

export function isPermissionDenied(error) {
  return getFirebaseErrorCode(error) === 'permission-denied';
}
