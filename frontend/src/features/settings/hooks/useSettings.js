import { useTenantData } from '../../branches/context/TenantContext';
import { saveSettings } from '../infrastructure/settingsRepository';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

export const useSettings = (user) => {
  const { settings: globalSettings } = useTenantData();
  const [isSavingData, setIsSavingData] = useState(false);
  const [companyData, setCompanyData] = useState({
    ruc: '',
    razonSocial: '',
    direccion: '',
    telefono: ''
  });
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
      await saveSettings(user.businessId, { companyData });

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
