// src/hooks/useSettings.js
import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore'; 
import toast from 'react-hot-toast';
import { useGlobalData } from '../context/GlobalDataContext';

export const useSettings = (user) => {
  const { globalSettings } = useGlobalData();

  // --- 🚀 ESTADOS PARA DATOS FISCALES / EMPRESA ---
  const [isSavingData, setIsSavingData] = useState(false);
  const [companyData, setCompanyData] = useState({
    ruc: '',
    razonSocial: '',
    direccion: '',
    telefono: ''
  });

  // 🚀 Cargar los datos globales en el formulario si ya existen
  useEffect(() => {
    if (globalSettings?.companyData) {
      setCompanyData({
        ruc: globalSettings.companyData.ruc || '',
        razonSocial: globalSettings.companyData.razonSocial || '',
        direccion: globalSettings.companyData.direccion || '',
        telefono: globalSettings.companyData.telefono || ''
      });
    }
  }, [globalSettings]);

  const handleCompanyDataChange = (e) => {
    const { name, value } = e.target;
    setCompanyData(prev => ({ ...prev, [name]: value }));
  };

  const saveCompanyData = async () => {
    if (!user?.businessId) return;
    
    setIsSavingData(true);
    const loadId = toast.loading('Guardando datos de la empresa...');

    try {
      const settingsRef = doc(db, 'settings', user.businessId);
      await setDoc(settingsRef, { businessId: user.businessId, companyData }, { merge: true });
      
      toast.success('Datos de facturación actualizados', { id: loadId });
    } catch (error) {
      console.error("Error al guardar datos fiscales:", error);
      toast.error('Error al guardar la información.', { id: loadId });
    } finally {
      setIsSavingData(false);
    }
  };

  return {
    companyData, 
    handleCompanyDataChange, 
    saveCompanyData, 
    isSavingData
  };
};
