// src/hooks/useAgenda.js
import { useState, useMemo, useCallback } from 'react';
import { db } from '../firebase'; 
import { setDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore'; 
import toast from 'react-hot-toast'; 
import { useGlobalData } from '../context/GlobalDataContext'; // 🚀 IMPORTAMOS EL CONTEXTO

export const useAgenda = (user) => {
  // 🚀 LEEMOS DE LA RAM, CERO LECTURAS DE FIREBASE
  const { globalAgenda, isGlobalLoading } = useGlobalData(); 
  
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
        updatedAt: Timestamp.now()
      };

      await setDoc(doc(db, 'customers', customerId), contactData, { merge: true });
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
      await deleteDoc(doc(db, 'customers', id));
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