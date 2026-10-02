// src/hooks/useCategories.js
import { useState, useMemo, useCallback } from 'react';
import { db } from '../firebase'; 
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore'; 
import { useGlobalData } from '../context/GlobalDataContext'; 
import toast from 'react-hot-toast'; 

export const useCategories = (user) => {
  const { globalCategories, isGlobalLoading } = useGlobalData();

  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('activo');
  const [editing, setEditing] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  // 🚀 OPTIMIZACIÓN 1 y 2: Cero estados derivados y Filtro blindado.
  // Leemos directo de la variable global y el cálculo se guarda en RAM.
  const filteredCategories = useMemo(() => {
    const safeCategories = globalCategories || [];
    const lowerSearch = searchTerm.toLowerCase();

    return safeCategories.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(lowerSearch);
      const isInactive = c.status === 'inactivo';
      if (!showInactive && isInactive) return false;
      return matchesSearch;
    });
  }, [globalCategories, searchTerm, showInactive]);

  // 🚀 OPTIMIZACIÓN 3: Congelamos los disparadores de modales (useCallback)
  const openAddForm = useCallback(() => {
    setName('');
    setStatus('activo');
    setEditing(null);
    setShowFormModal(true);
  }, []);

  const openEditForm = useCallback((c) => {
    setName(c.name);
    setStatus(c.status || 'activo'); 
    setEditing(c.id);
    setShowFormModal(true);
  }, []);

  // 🚀 OPTIMIZACIÓN 4: Guardado limpio y seguro
  const handleSave = async (e) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || !user?.businessId) {
      toast.error('El nombre de la categoría es obligatorio');
      return;
    }

    const normalizedName = cleanName.toLowerCase();
    const safeCategories = globalCategories || [];
    const isDuplicate = safeCategories.some(c => c.name.toLowerCase() === normalizedName && c.id !== editing);

    if (isDuplicate) {
      toast.error(`La categoría "${cleanName}" ya existe.`);
      return;
    }

    setIsLoading(true);
    const toastId = 'category-toast';
    toast.loading(editing ? 'Actualizando...' : 'Guardando...', { id: toastId });

    const categoryData = {
      name: cleanName,
      status: status,
      businessId: user.businessId
    };

    try {
      if (editing) {
        await updateDoc(doc(db, 'categories', editing), categoryData);
        toast.success('Categoría actualizada', { id: toastId });
      } else {
        await addDoc(collection(db, 'categories'), categoryData);
        toast.success('Categoría agregada', { id: toastId });
      }
      
      // 💡 Se eliminó el "setCategories" manual. Dejamos que Firebase y tu Contexto
      // hagan la sincronización de fondo para evitar "ecos" en la pantalla.
      
      setShowFormModal(false);
      setName('');
    } catch (error) {
      console.error("Error al guardar:", error);
      toast.error('Error al procesar la solicitud', { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  return {
    categories: globalCategories || [], // Exportamos siempre un array seguro
    isLoading, 
    isFetching: isGlobalLoading,
    searchTerm, setSearchTerm, showFormModal, setShowFormModal,
    name, setName, status, setStatus, editing, showInactive, setShowInactive,
    filteredCategories, openAddForm, openEditForm, handleSave
  };
};