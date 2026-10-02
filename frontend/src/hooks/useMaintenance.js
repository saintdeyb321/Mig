// src/hooks/useMaintenance.js
import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase'; 

export const useMaintenance = () => {
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState(''); 

  useEffect(() => {
    const statusRef = doc(db, 'system', 'status');
        
    const unsubscribe = onSnapshot(statusRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        // 🚀 EL TRUCO DEL DESARROLLADOR: Bypass para Localhost
        if (data.maintenanceMode === true) {
          if (import.meta.env.DEV) {
            // Si estás en tu PC (localhost), la app ignora el bloqueo.
            console.warn("⚠️ MODO MANTENIMIENTO ACTIVO EN PRODUCCIÓN. (Ignorado aquí en localhost para que puedas programar)");
            setIsMaintenance(false);
          } else {
            // Si están en internet (producción), los bloquea.
            setIsMaintenance(true);
          }
        } else {
          setIsMaintenance(false); // Mantenimiento apagado
        }
        
        // Asignar mensaje dinámico si existe
        if (data.message) {
          setMaintenanceMsg(data.message);
        } else {
          setMaintenanceMsg('');
        }
        
      } else {
        setIsMaintenance(false);
      }
    }, (error) => {
      console.warn("Error al escuchar el estado del sistema:", error);
      setIsMaintenance(false);
    });

    return () => unsubscribe();
  }, []);

  return { isMaintenance, maintenanceMsg };
};