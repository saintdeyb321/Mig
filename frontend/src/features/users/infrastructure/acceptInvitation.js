import * as firestore from 'firebase/firestore';
import { hasCurrentTerms, legalAcceptanceEvidence, legalAcceptanceMarker, legalConfirmationComplete, legalPublication } from '../../legal/publication.js';

export async function acceptInvitation(database, user, confirmation, { sdk = firestore, expectedInvitation } = {}) {
  if (!user?.uid || !user.email || user.emailVerified !== true
    || !user.providerData?.some(provider => provider.providerId === 'google.com')) {
    throw new Error('La invitación requiere una cuenta Google con correo verificado.');
  }
  if (legalPublication.state !== 'approved' || !legalPublication.privacy || !legalConfirmationComplete(confirmation)) {
    throw new Error('Confirma los Términos y la lectura de la Política de Privacidad para activar la cuenta.');
  }
  if (globalThis.navigator?.onLine === false) throw new Error('Conéctate para activar la cuenta.');
  const { doc, collection, getDocFromServer, runTransaction, serverTimestamp } = sdk;
  const profileRef = doc(database, 'users', user.uid), inviteRef = doc(database, 'invites', user.email);
  const evidenceRef = doc(collection(profileRef, 'legal_acceptances'));
  const matchesInvitation = data => !expectedInvitation || (data.businessId === expectedInvitation.businessId
    && data.role === expectedInvitation.role && (data.branchId ?? null) === expectedInvitation.branchId);
  const activate = async tx => {
    const existing = await tx.get(profileRef);
    if (existing.exists()) return existing.data();
    const invitation = await tx.get(inviteRef);
    if (!invitation.exists()) throw new Error('Tu correo no tiene una invitación pendiente.');
    const invite = invitation.data();
    if (!['dueño', 'cajero'].includes(invite.role) || invite.email !== user.email || (invite.status ?? 'activo') !== 'activo'
      || typeof invite.businessId !== 'string' || !invite.businessId.trim() || invite.businessId === 'platform-admin'
      || (invite.role === 'cajero' && (!invite.branchId || invite.branchId === 'global'))) {
      throw new Error('Invitación inválida o suspendida.');
    }
    if (!matchesInvitation(invite)) throw new Error('La invitación cambió. Vuelve a comprobar tu acceso.');
    const data = { email: invite.email, firstName: invite.firstName ?? '', lastName: invite.lastName ?? '', role: invite.role,
      businessId: invite.businessId, branchId: invite.branchId ?? null, shiftStart: invite.shiftStart ?? null,
      shiftEnd: invite.shiftEnd ?? null, status: invite.status ?? 'activo', createdAt: new Date().toISOString() };
    const evidence = legalAcceptanceEvidence({ ...data, id: evidenceRef.id, uid: user.uid }, legalPublication, serverTimestamp());
    data.legalAcceptance = legalAcceptanceMarker(evidence);
    tx.set(profileRef, data);
    tx.set(evidenceRef, evidence);
    tx.delete(inviteRef);
    return data;
  };
  try {
    return await runTransaction(database, activate);
  } catch (error) {
    if (error.code !== 'permission-denied') throw error;
    // Another client may have consumed the invitation after this transaction read it.
    const profile = (await getDocFromServer(profileRef)).data();
    if (profile?.email !== user.email || profile.status !== 'activo' || !matchesInvitation(profile)
      || !hasCurrentTerms({ ...profile, uid: user.uid })) throw error;
    return profile;
  }
}
