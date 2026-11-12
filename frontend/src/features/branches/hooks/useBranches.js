import { boundedImageDataUrl, imageCanvas, MAX_QR_IMAGE_CHARS } from '../../../shared/images/raster.js';
import { useTenantData } from '../context/TenantContext';
import { createBranch, updateBranch } from '../infrastructure/branchRepository';
import { timestampNow } from '../../../core/firebase/timestamps';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

export const useBranches = (user) => {
  const { businessBranches, branchQuota, isLoading: isGlobalLoading } = useTenantData();
  const creatingId = useRef(null), saving = useRef(false), upload = useRef(null);
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
    creatingId.current = crypto.randomUUID();
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
  useEffect(() => () => { upload.current = null; }, [user.uid, user.businessId, editingBranch?.id, showFormModal]);
  const handleImageChange = useCallback(async event => {
    const file = event.currentTarget.files[0];
    event.currentTarget.value = '';
    if (!file) return;
    const request = {};
    upload.current = request;
    const loadId = toast.loading('Procesando código QR...');
    try {
      const canvas = await imageCanvas(file, 600, { smooth: false });
      const image = boundedImageDataUrl(canvas, 'image/png', MAX_QR_IMAGE_CHARS);
      if (upload.current === request) {
        setQrImageBase64(image);
        toast.success('QR listo para guardar', { id: loadId });
      } else toast.dismiss(loadId);
    } catch (error) {
      if (upload.current === request) toast.error(error.message, { id: loadId });
      else toast.dismiss(loadId);
    } finally { if (upload.current === request) upload.current = null; }
  }, []);
  const removeQrImage = () => {
    upload.current = null;
    setQrImageBase64(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving.current) return;
    if (upload.current) return toast.error('Espera a que se prepare el código QR.');
    if (!name.trim()) return toast.error('El nombre es obligatorio');

    saving.current = true;
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
        await createBranch(branchData, creatingId.current);
        toast.success('Nueva sucursal creada', { id: toastId });
      }
      setShowFormModal(false);
    } catch (error) {
      console.error("Error guardando sucursal:", error);
      toast.error(error.message || 'Hubo un error al guardar', { id: toastId });
    } finally {
      saving.current = false;
      setIsProcessing(false);
    }
  };

  return {
    branches, branchQuota,
    isLoading: isGlobalLoading,
    isProcessing,
    showFormModal, setShowFormModal,
    name, setName, address, setAddress, phone, setPhone, status, setStatus,
    qrImageBase64, handleImageChange, removeQrImage,
    editingBranch, openAddForm, openEditForm, handleSave
  };
};
