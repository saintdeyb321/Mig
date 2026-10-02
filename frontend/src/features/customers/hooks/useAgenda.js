import { useCustomers } from './useCustomers';
import { saveCustomer, deleteCustomer } from '../infrastructure/customerRepository';
import { timestampNow } from '../../../core/firebase/timestamps';
import { useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';

export const useAgenda = (user) => {
  const { customers: globalAgenda, isLoading: isGlobalLoading } = useCustomers();

  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [editing, setEditing] = useState(null);

  const filteredContacts = useMemo(() => {
    const safeAgenda = globalAgenda || [];
    const lowerSearch = searchTerm.toLowerCase();
    return safeAgenda.filter(c =>
      c.name.toLowerCase().includes(lowerSearch) ||
      (c.phone && c.phone.includes(lowerSearch))
    );
  }, [globalAgenda, searchTerm]);

  const openAddForm = useCallback(() => {
    setName('');
    setPhone('');
    setEditing(null);
    setShowFormModal(true);
  }, []);

  const openEditForm = useCallback((c) => {
    setName(c.name);
    setPhone(c.phone || '');
    setEditing(c.id);
    setShowFormModal(true);
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanPhone = phone.trim();

    if (!cleanName || !user?.businessId) return toast.error('El nombre es obligatorio');

    setIsLoading(true);
    const toastId = 'agenda-toast';
    toast.loading(editing ? 'Actualizando contacto...' : 'Guardando contacto...', { id: toastId });

    try {
      const customerId = editing || `${user.businessId}_${cleanPhone}`;
      const contactData = {
        name: cleanName,
        phone: cleanPhone,
        businessId: user.businessId,
        updatedAt: timestampNow()
      };

      await saveCustomer(customerId, contactData);
      toast.success(editing ? 'Contacto actualizado' : 'Contacto guardado', { id: toastId });
      setShowFormModal(false);
    } catch (error) {
        console.error("Error al guardar el contacto:", error);
      toast.error('Error al procesar la solicitud', { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Seguro que deseas eliminar a este contacto de tu agenda?")) return;
    try {
      await deleteCustomer(id);
      toast.success("Contacto eliminado correctamente");
    } catch (error) {
        console.error("Error al eliminar el contacto:", error);
      toast.error("Error al eliminar el contacto");
    }
  };

  return {
    contacts: globalAgenda || [],
    isLoading, isFetching: isGlobalLoading,
    searchTerm, setSearchTerm, showFormModal, setShowFormModal,
    name, setName, phone, setPhone, editing, filteredContacts,
    openAddForm, openEditForm, handleSave, handleDelete
  };
};
