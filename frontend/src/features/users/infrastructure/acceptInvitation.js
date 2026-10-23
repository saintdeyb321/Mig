import * as firestore from 'firebase/firestore';

export async function acceptInvitation(database, user, { sdk = firestore } = {}) {
  if (!user?.uid || !user.email || user.emailVerified !== true
    || !user.providerData?.some(provider => provider.providerId === 'google.com')) {
    throw new Error('La invitación requiere una cuenta Google con correo verificado.');
  }
  const { doc, runTransaction } = sdk;
  const profileRef = doc(database, 'users', user.uid), inviteRef = doc(database, 'invites', user.email);
  return runTransaction(database, async tx => {
    const existing = await tx.get(profileRef);
    if (existing.exists()) return existing.data();
    const invitation = await tx.get(inviteRef);
    if (!invitation.exists()) throw new Error('Tu correo no tiene una invitación pendiente.');
    const invite = invitation.data();
    if (!['dueño', 'cajero'].includes(invite.role) || invite.email !== user.email || invite.status === 'inactivo') throw new Error('Invitación inválida o suspendida.');
    const data = { email: invite.email, firstName: invite.firstName ?? '', lastName: invite.lastName ?? '', role: invite.role,
      businessId: invite.businessId, branchId: invite.branchId ?? null, shiftStart: invite.shiftStart ?? null,
      shiftEnd: invite.shiftEnd ?? null, status: invite.status ?? 'activo', createdAt: new Date().toISOString() };
    tx.set(profileRef, data); tx.delete(inviteRef);
    return data;
  });
}
