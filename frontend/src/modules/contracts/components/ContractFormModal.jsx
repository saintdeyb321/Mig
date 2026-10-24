import { ContractFinanceFields } from "./ContractFinanceFields";
import { Dialog, Input, FormField, Button, Select, Textarea, DialogFooter, SearchField } from "../../../shared/ui";
// src/modules/contracts/components/ContractFormModal.jsx
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useCustomers } from '../../../features/customers/hooks/useCustomers';
import { toDateSafe } from '../../../core/dates/dateValues';
import { useContractImageUrls } from '../../../features/contracts/hooks/useContractImageUrls';
const ContractFormModal = ({
  contractToEdit,
  activeLocations,
  onClose,
  onSubmit,
  isProcessing
}) => {
  const isEditing = !!contractToEdit;
  const {
    customers: agenda
  } = useCustomers();
  const [showAgendaModal, setShowAgendaModal] = useState(false);
  const [agendaSearch, setAgendaSearch] = useState('');
  const [formData, setFormData] = useState(() => {
    if (contractToEdit) {
      let formattedDate = '';
      if (contractToEdit.deliveryDate) {
        const d = toDateSafe(contractToEdit.deliveryDate);
        if (d) {
          d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
          formattedDate = d.toISOString().slice(0, 16);
        }
      }
      return {
        clientName: contractToEdit.clientName || '',
        clientPhone: contractToEdit.clientPhone || '',
        deliveryDate: formattedDate,
        details: contractToEdit.details || '',
        deliveryType: contractToEdit.deliveryType || 'domicilio',
        deliveryAddress: contractToEdit.deliveryAddress || '',
        subtotal: contractToEdit.subtotal || '',
        deliveryCost: contractToEdit.deliveryCost || '',
        advancePayment: '',
        paymentMethod: 'efectivo'
      };
    }
    return {
      clientName: '',
      clientPhone: '',
      deliveryDate: '',
      details: '',
      deliveryType: 'domicilio',
      deliveryAddress: '',
      subtotal: '',
      deliveryCost: '',
      advancePayment: '',
      paymentMethod: 'efectivo'
    };
  });
  const [images, setImages] = useState(() => {
    const initialImages = [];
    if (contractToEdit) {
      if (contractToEdit.referenceImages && contractToEdit.referenceImages.length > 0) {
        contractToEdit.referenceImages.forEach(img => initialImages.push({
          type: 'existing',
          value: img
        }));
      } else if (contractToEdit.referenceImage) {
        initialImages.push({
          type: 'existing',
          value: contractToEdit.referenceImage
        });
      }
    }
    return initialImages;
  });
  const previewUrls = useRef(new Set());
  useEffect(() => {
    const created = previewUrls.current;
    return () => {
      created.forEach(url => URL.revokeObjectURL(url));
      created.clear();
    };
  }, []);
  const imageReferences = useMemo(() => images.map(image => image.type === 'existing' ? image.value : image.url), [images]);
  const {
    urls: displayedImages
  } = useContractImageUrls(imageReferences);
  const totals = useMemo(() => {
    const sub = Math.max(0, Number(formData.subtotal) || 0);
    const del = Math.max(0, Number(formData.deliveryCost) || 0);
    const total = sub + del;
    if (isEditing) {
      const paid = Number(contractToEdit.paidTotal ?? Math.max(0, Number(contractToEdit.total || 0) - Number(contractToEdit.balance || 0)));
      return {
        total,
        balance: Math.max(0, total - paid),
        totalPaid: paid
      };
    }
    const adv = Math.max(0, Number(formData.advancePayment) || 0);
    return {
      total,
      balance: Math.max(0, total - adv),
      totalPaid: adv
    };
  }, [formData.subtotal, formData.deliveryCost, formData.advancePayment, isEditing, contractToEdit]);
  const handleChange = useCallback(e => {
    const {
      name,
      value
    } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      ...(name === 'deliveryType' && value !== 'domicilio' ? {
        deliveryAddress: ''
      } : {})
    }));
  }, []);
  const handleSelectContact = contact => {
    setFormData(prev => ({
      ...prev,
      clientName: contact.name,
      clientPhone: contact.phone || ''
    }));
    setShowAgendaModal(false);
    setAgendaSearch('');
    toast.success(`Datos de ${contact.name} cargados.`, {
      icon: '📖'
    });
  };
  const filteredAgenda = useMemo(() => {
    const lowerSearch = agendaSearch.toLowerCase();
    return agenda.filter(c => c.name.toLowerCase().includes(lowerSearch) || c.phone && c.phone.includes(lowerSearch));
  }, [agenda, agendaSearch]);
  const handleImageChange = e => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    if (images.length + files.length > 20) {
      return toast.error("Máximo 20 imágenes de referencia por pedido.");
    }
    if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !/\.(jpe?g|png|webp)$/i.test(file.name) || file.size > 5 * 1024 * 1024)) {
      return toast.error('Usa imágenes JPEG, PNG o WebP de hasta 5 MB. Se comprimen y guardan solo en este dispositivo.');
    }
    const newImages = files.map(file => {
      const url = URL.createObjectURL(file);
      previewUrls.current.add(url);
      return {
        type: 'new',
        file,
        url
      };
    });
    setImages(prev => [...prev, ...newImages]);
    e.target.value = null;
  };
  const handleRemoveImage = indexToRemove => {
    const removed = images[indexToRemove];
    if (removed?.type === 'new') {
      URL.revokeObjectURL(removed.url);
      previewUrls.current.delete(removed.url);
    }
    setImages(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };
  const handleFormSubmit = e => {
    e.preventDefault();
    if (!isEditing && Number(formData.advancePayment) > totals.total) {
      return toast.error('La cuota inicial no puede ser mayor al Total');
    }
    if (isEditing && totals.total < totals.totalPaid) {
      return toast.error('El total no puede ser menor al monto ya cobrado.');
    }
    if (formData.deliveryType === 'domicilio' && !formData.deliveryAddress.trim()) {
      return toast.error('Debes ingresar la dirección de entrega');
    }
    const existingImages = images.filter(img => img.type === 'existing').map(img => img.value);
    const newImageFiles = images.filter(img => img.type === 'new').map(img => img.file);
    const finalData = {
      ...formData,
      clientName: formData.clientName.trim(),
      deliveryDate: new Date(formData.deliveryDate).toISOString(),
      total: totals.total,
      subtotal: Number(formData.subtotal) || 0,
      deliveryCost: Number(formData.deliveryCost) || 0,
      ...(!isEditing && Number(formData.advancePayment) > 0 ? {
        initialPayment: {
          amount: Number(formData.advancePayment),
          method: formData.paymentMethod
        }
      } : {}),
      newImages: newImageFiles,
      retainedImages: existingImages
    };
    onSubmit(finalData, null, isEditing ? contractToEdit.id : null);
  };
  return <>
      <Dialog title={<>{isEditing ? 'Editar Pedido' : 'Registro de Nuevo Pedido'}</>} busy={isProcessing} className="max-w-3xl" onClose={onClose}>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">{isEditing ? '✏️' : '📝'}</span>

            </div>

          </div>

          <form onSubmit={handleFormSubmit} className="grid min-w-0 gap-5">
            <p role="status" className="rounded-xl border border-line bg-subtle/60 p-3 text-xs leading-relaxed text-muted">Fotos JPEG/PNG/WebP hasta 5 MB de entrada, comprimidas a 256 KiB + miniatura de 64 KiB; solo en este dispositivo/cuenta. Guarda sin foto si no está disponible.</p>

            <div className="grid min-w-0 gap-4 rounded-xl border border-line p-4">
              <h4 className="text-sm font-semibold">1. Datos del Cliente</h4>

              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <FormField label={<>Nombre Completo <span className="text-danger">*</span></>}>

                  <Input name="clientName" autoFocus value={formData.clientName} onChange={handleChange} required disabled={isProcessing} placeholder="Ej: Juan Pérez" />
                </FormField>

                <FormField label={<>Teléfono / WhatsApp</>}>

                  <Input name="clientPhone" type="tel" value={formData.clientPhone} onChange={handleChange} disabled={isProcessing} placeholder="987 654 321" autoComplete="off" />
                </FormField>
              </div>

              {!isEditing && agenda.length > 0 && <div className="flex justify-center mt-3">
                  <Button type="button" onClick={() => setShowAgendaModal(true)} disabled={isProcessing} className="m-0" variant="secondary">
                    📖 Buscar en Agenda
                  </Button>
                </div>}
            </div>

            <div className="grid min-w-0 gap-4 rounded-xl border border-line p-4">
              <h4 className="text-sm font-semibold">2. Logística de Entrega</h4>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <FormField label={<>Fecha y Hora <span className="text-danger">*</span></>}>

                  <Input name="deliveryDate" type="datetime-local" value={formData.deliveryDate} onChange={handleChange} required disabled={isProcessing} />
                </FormField>
                <FormField label={<>Método de Entrega <span className="text-danger">*</span></>}>

                  <Select name="deliveryType" value={formData.deliveryType} onChange={handleChange} disabled={isProcessing}>
                    <option value="domicilio">🛵 Delivery a Domicilio</option>
                    <optgroup label="🏪 Recoger en Local (Sedes)">
                      {activeLocations.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </optgroup>
                  </Select>
                </FormField>
                {formData.deliveryType === 'domicilio' && <FormField label={<>Dirección Exacta <span className="text-danger">*</span></>}>

                    <Input name="deliveryAddress" value={formData.deliveryAddress} onChange={handleChange} disabled={isProcessing} required placeholder="Av. Principal 123" />
                  </FormField>}
              </div>
            </div>

            <div className="grid min-w-0 gap-4 rounded-xl border border-line p-4">
              <h4 className="text-sm font-semibold">3. Detalles del Pedido</h4>
              <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <FormField label={<>Descripción Exacta <span className="text-danger">*</span></>}>

                  <Textarea name="details" value={formData.details} onChange={handleChange} required disabled={isProcessing} placeholder="Ej: Torta de chocolate, 2 pisos, relleno de fresa..." />
                </FormField>

                <div className="grid min-w-0 gap-1.5">
                  <label className="text-sm leading-relaxed text-muted">Fotos de Referencia (Max 4)</label>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {images.map((_image, idx) => <div key={idx} className="relative aspect-square overflow-hidden rounded-xl border border-line bg-subtle">
                        {displayedImages[idx] ? <img src={displayedImages[idx]} alt={`Ref ${idx}`} className="size-full object-cover" /> : <span>Cargando imagen...</span>}
                        <Button type="button" onClick={() => handleRemoveImage(idx)} disabled={isProcessing} className="absolute right-1 top-1 z-10 size-8 min-h-8 rounded-full p-1" title="Eliminar foto" variant="danger" aria-label="Eliminar foto">✖</Button>
                      </div>)}
                    {images.length < 4 && <div className="relative flex aspect-square items-center justify-center rounded-xl border border-dashed border-primary/40 bg-primary-soft focus-within:ring-2 focus-within:ring-focus" title="Subir foto">
                        <Input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleImageChange} disabled={isProcessing} className="absolute inset-0 size-full cursor-pointer opacity-0" aria-label="Seleccionar imagen de referencia" />
                        <span className="pointer-events-none text-2xl text-primary">➕</span>
                      </div>}
                  </div>
                </div>
              </div>
            </div>

            <ContractFinanceFields formData={formData} isProcessing={isProcessing} isEditing={isEditing} totals={totals} handleChange={handleChange} />

            <DialogFooter>
              <Button type="button" onClick={onClose} disabled={isProcessing} variant="secondary">Cancelar</Button>
              <Button type="submit" disabled={isProcessing} variant="primary">
                {isProcessing ? 'Procesando...' : isEditing ? 'Actualizar Pedido' : 'Guardar y Registrar Pedido'}
              </Button>
            </DialogFooter>

          </form>
        </Dialog>

      {showAgendaModal && <Dialog title={<>
                📖 Seleccionar Cliente
              </>} busy={isProcessing} className="max-w-lg" onClose={() => setShowAgendaModal(false)}>

            <div className="p-4">
              <SearchField type="text" placeholder="Buscar nombre o celular..." value={agendaSearch} onChange={e => setAgendaSearch(e.target.value)} autoFocus />

              <div className="max-h-75 overflow-y-auto flex flex-col gap-2 pr-1">
                {filteredAgenda.length === 0 ? <div className="text-center p-5 text-muted text-sm bg-subtle rounded-xl">
                    No se encontraron clientes.
                  </div> : filteredAgenda.map(c => <div key={c.id} className="flex justify-between items-center p-3 border border-line rounded-xl cursor-pointer motion-reduce:transition-none bg-panel transition-colors hover:border-primary/40 hover:bg-primary-soft/40">
                      <div>
                        <strong className="block text-ink text-base">{c.name}</strong>
                        <span className="text-sm text-muted">📱 {c.phone || 'Sin número'}</span>
                      </div>
                      <Button type="button" onClick={() => handleSelectContact(c)} className="py-1.5 px-3 text-sm border-0" variant="success">
                        Elegir
                      </Button>
                    </div>)}
              </div>
            </div>

          </Dialog>}
    </>;
};
export default ContractFormModal;
