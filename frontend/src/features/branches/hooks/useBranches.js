import { useTenantData } from '../context/TenantContext';
import { createBranch, updateBranch } from '../infrastructure/branchRepository';
import { timestampNow } from '../../../core/firebase/timestamps';
import { useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';

export const useBranches = (user) => {
  const { businessBranches, isLoading: isGlobalLoading } = useTenantData();
  const [isProcessing, setIsProcessing] = useState(false);

  // Estados del formulario
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('activo');
  const [qrImageBase64, setQrImageBase64] = useState(null);

  const branches = useMemo(() => {
    if (!businessBranches) return [];
    return [...businessBranches].sort((a, b) => a.name.localeCompare(b.name));
  }, [businessBranches]);

  const openAddForm = () => {
    setEditingBranch(null);
    setName('');
    setAddress('');
    setPhone('');
    setStatus('activo');
    setQrImageBase64(null); // Empezar sin imagen
    setShowFormModal(true);
  };

  const openEditForm = (branch) => {
    setEditingBranch(branch);
    setName(branch.name);
    setAddress(branch.address || '');
    setPhone(branch.phone || '');
    setStatus(branch.status || 'activo');
    setQrImageBase64(branch.yapeQrUrl || null); // Cargar el QR que ya tenía guardado
    setShowFormModal(true);
  };
  const handleImageChange = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecciona un archivo de imagen válido.');
      return;
    }

    const loadId = toast.loading('Procesando imagen...');
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;

      img.onload = () => {
        const MAX_WIDTH = 600;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
        } else {
          if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);

        setQrImageBase64(compressedBase64);
        toast.success('QR listo para guardar', { id: loadId });
      };

      img.onerror = () => toast.error('Error al procesar la imagen.', { id: loadId });
    };
  }, []);
  const removeQrImage = () => {
    setQrImageBase64(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('El nombre es obligatorio');

    setIsProcessing(true);
    const toastId = toast.loading(editingBranch ? 'Actualizando sucursal...' : 'Creando sucursal...');

    try {
      // Agregamos yapeQrUrl al objeto que se guarda en Firebase
      const branchData = {
        name: name.trim(),
        address: address.trim(),
        phone: phone.trim(),
        status,
        yapeQrUrl: qrImageBase64, // Guarda el base64 o null si lo borró
        businessId: user.businessId,
        updatedAt: timestampNow()
      };

      if (editingBranch) {
        await updateBranch(editingBranch.id, branchData);
        toast.success('Sucursal actualizada', { id: toastId });
      } else {
        branchData.createdAt = timestampNow();
        await createBranch(branchData);
        toast.success('Nueva sucursal creada', { id: toastId });
      }
      setShowFormModal(false);
    } catch (error) {
      console.error("Error guardando sucursal:", error);
      toast.error('Hubo un error al guardar', { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    branches,
    isLoading: isGlobalLoading,
    isProcessing,
    showFormModal, setShowFormModal,
    name, setName, address, setAddress, phone, setPhone, status, setStatus,
    qrImageBase64, handleImageChange, removeQrImage,
    editingBranch, openAddForm, openEditForm, handleSave
  };
};
