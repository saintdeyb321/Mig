import { useTenantData } from '../../branches/context/TenantContext';
import { useUsersData } from './useUsersData';
import { updateUser, createInvite, deleteInvite } from '../infrastructure/userRepository';
import { toMillisSafe } from '../../../core/dates/dateValues';
import { isPermissionDenied } from '../../../core/errors/firebaseErrors';
import { useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';

export const useUserManagement = (user) => {
  const { users: globalUsers, invites: globalInvites, isLoading: isGlobalLoading } = useUsersData(user);
  const { businessBranches } = useTenantData();

  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [emailPrefix, setEmailPrefix] = useState('');
  const [role, setRole] = useState('cajero');
  const [shiftStart, setShiftStart] = useState('08:00');
  const [shiftEnd, setShiftEnd] = useState('16:00');
  const [branchId, setBranchId] = useState('');
  const [editing, setEditing] = useState(null);

  const allUsers = useMemo(() => {
    const users = globalUsers || [];
    const invites = globalInvites || [];
    // Pero si por si acaso llega sin él, lo aseguramos. También aseguramos que tenga un ID único.
    const safeInvites = invites.map(inv => ({ ...inv, isInvite: true, id: inv.email || inv.id }));

    return [...users, ...safeInvites].sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt));
  }, [globalUsers, globalInvites]);

  const filteredUsers = useMemo(() => {
    if (isGlobalLoading) return [];
    const term = searchTerm.toLowerCase();

    return allUsers.filter(u => {
      if (user?.role !== 'superadmin' && u.role === 'superadmin') return false;
      const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
      const email = (u.email || '').toLowerCase();
      const matchesSearch = fullName.includes(term) || email.includes(term);

      if (u.isInvite) return matchesSearch;

      const isInactive = u.status === 'inactivo';
      if (!showInactive && isInactive) return false;
      return matchesSearch;
    });
  }, [allUsers, searchTerm, showInactive, isGlobalLoading, user?.role]);

  const openAddForm = useCallback(() => {
    setFirstName('');
    setLastName('');
    setEmailPrefix('');
    setRole('cajero');
    setShiftStart('08:00');
    setShiftEnd('16:00');
    setBranchId('');
    setEditing(null);
    setShowFormModal(true);
  }, []);

  const openEditForm = useCallback((u) => {
    if (u.isInvite) {
      return toast.error('No puedes editar una invitación pendiente. Cáncelala y crea una nueva.');
    }
    if (u.role === 'superadmin' && user?.role !== 'superadmin') {
      return toast.error('Acceso denegado: No puedes editar esta cuenta.');
    }
    setFirstName(u.firstName || '');
    setLastName(u.lastName || '');
    setEmailPrefix(u.email ? u.email.split('@')[0] : '');
    setRole(u.role || 'cajero');
    setShiftStart(u.shiftStart || '08:00');
    setShiftEnd(u.shiftEnd || '16:00');
    setBranchId(u.branchId || '');
    setEditing(u.id);
    setShowFormModal(true);
  }, [user?.role]);

  const cancelInvite = useCallback(async (inviteEmail) => {
    if (!window.confirm('¿Estás seguro de cancelar esta invitación? El usuario no podrá registrarse.')) return;
    setIsLoading(true);
    const toastId = toast.loading('Cancelando invitación...');
    try {
      await deleteInvite(inviteEmail);
      toast.success('Invitación cancelada', { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('Error al cancelar invitación', { id: toastId });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();

    if (!firstName || !lastName || !emailPrefix || !user?.businessId) {
      return toast.error('Completa todos los campos');
    }
    if (role === 'cajero' && !branchId) {
      return toast.error('Debes asignar una sede válida al cajero');
    }
    if (emailPrefix.includes('@')) {
      return toast.error('Solo la parte antes del @gmail.com');
    }
    if (role === 'superadmin' && user?.role !== 'superadmin') {
      return toast.error('No tienes permisos para crear superadministradores.');
    }

    const fullEmail = `${emailPrefix.toLowerCase().trim()}@gmail.com`;
    const emailExists = !editing && (globalUsers || []).some(u => u.email === fullEmail);
    if (emailExists) {
      return toast.error('Este correo ya está registrado en tu personal.');
    }

    if (!editing) {
      const inviteExists = (globalInvites || []).some(u => u.email === fullEmail);
      if (inviteExists) {
        return toast.error('Ya existe una invitación pendiente para este correo.');
      }
    }

    setIsLoading(true);
    const toastId = toast.loading(editing ? 'Actualizando...' : 'Creando invitación...');

    try {
      const userData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
        shiftStart: role === 'cajero' ? shiftStart : null,
        shiftEnd: role === 'cajero' ? shiftEnd : null,
        branchId: role === 'dueño' || role === 'superadmin' ? 'global' : branchId,
        status: 'activo',
      };

      if (editing) {
        await updateUser(editing, userData);
        toast.success('Usuario actualizado correctamente', { id: toastId });
      } else {
        await createInvite(fullEmail, {
          ...userData,
          email: fullEmail,
          businessId: user.businessId,
          createdAt: new Date().toISOString(),
        });
        toast.success('Invitación enviada. El usuario debe registrarse con Google.', { id: toastId });
      }

      setShowFormModal(false);
    } catch (err) {
      console.error(err);
      if (isPermissionDenied(err)) {
        toast.error('No tienes permiso para crear invitaciones. Contacta al superadmin.', { id: toastId });
      } else {
        toast.error('Error al guardar', { id: toastId });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleStatus = async (userId, currentStatus) => {
    const targetUser = (globalUsers || []).find(u => u.id === userId);
    if (targetUser?.role === 'superadmin' && user?.role !== 'superadmin') {
      return toast.error('Acceso denegado: No puedes bloquear esta cuenta.');
    }
    const newStatus = currentStatus === 'inactivo' ? 'activo' : 'inactivo';
    const toastId = toast.loading('Cambiando estado...');
    try {
      await updateUser(userId, { status: newStatus });
      toast.success('Estado actualizado', { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('Error al cambiar estado', { id: toastId });
    }
  };

  return {
    isLoading, isGlobalLoading, filteredUsers, searchTerm, setSearchTerm,
    showFormModal, setShowFormModal, showInactive, setShowInactive,
    firstName, setFirstName, lastName, setLastName, emailPrefix, setEmailPrefix,
    role, setRole, shiftStart, setShiftStart, shiftEnd, setShiftEnd,
    branchId, setBranchId, branches: businessBranches, editing,
    openAddForm, openEditForm, handleSave, toggleStatus, cancelInvite,
  };
};
