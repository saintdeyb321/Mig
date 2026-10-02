export const getIdentityKey = user => JSON.stringify([
  user?.uid, user?.businessId, user?.role, user?.branchId,
]);
