import { ContractFinanceFields } from "./ContractFinanceFields";
import { Dialog, Input, FormField, Button, Select, Textarea, DialogFooter, SearchField, SectionCard } from "../../../shared/ui";
import { BookUser, CalendarClock, ImagePlus, NotebookPen, Save, UserRound } from 'lucide-react';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useCustomers } from '../../../features/customers/hooks/useCustomers';
import { toDateSafe } from '../../../core/dates/dateValues';
import { useContractImageUrls } from '../../../features/contracts/hooks/useContractImageUrls';
import { MAX_CONTRACT_IMAGES } from '../../../features/contracts/infrastructure/contractImages';
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
    if (images.length + files.length > MAX_CONTRACT_IMAGES) {
      return toast.error(`Máximo ${MAX_CONTRACT_IMAGES} imágenes de referencia por pedido.`);
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
      <Dialog title={isEditing ? 'Editar Pedido' : 'Registro de Nuevo Pedido'} description="Cada detalle, listo para una entrega especial." icon={NotebookPen} busy={isProcessing} className="max-w-[850px]" bodyClassName="flex flex-col space-y-0 overflow-hidden p-0 sm:p-0" onClose={onClose}>
        <form onSubmit={handleFormSubmit} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
            <SectionCard number="1" title="Datos del cliente" icon={UserRound}>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <FormField label="Nombre completo" required>
                  <Input name="clientName" autoFocus value={formData.clientName} onChange={handleChange} required disabled={isProcessing} placeholder="Ej: Juan Pérez" />
                </FormField>
                <FormField label="Teléfono / WhatsApp">
                  <Input name="clientPhone" type="tel" value={formData.clientPhone} onChange={handleChange} disabled={isProcessing} placeholder="987 654 321" autoComplete="off" />
                </FormField>
              </div>
              {!isEditing && agenda.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-warning/40 bg-warning-soft p-3">
                <div className="flex items-center gap-2 text-sm text-warning"><BookUser aria-hidden="true" className="size-5 shrink-0" /><span>¿Ya es cliente? Completa sus datos desde tu agenda.</span></div>
                <Button onClick={() => setShowAgendaModal(true)} disabled={isProcessing} size="sm" variant="secondary" className="border-warning/30 bg-panel text-warning hover:border-warning/50 hover:bg-warning-soft">Buscar en agenda</Button>
              </div>}
            </SectionCard>

            <SectionCard number="2" title="Logística de entrega" icon={CalendarClock}>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <FormField label="Fecha y hora" required>
                  <Input name="deliveryDate" type="datetime-local" value={formData.deliveryDate} onChange={handleChange} required disabled={isProcessing} />
                </FormField>
                <FormField label="Método de entrega" required>
                  <Select name="deliveryType" value={formData.deliveryType} onChange={handleChange} disabled={isProcessing}>
                    <option value="domicilio">Delivery a domicilio</option>
                    <optgroup label="Recoger en local (sedes)">{activeLocations.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup>
                  </Select>
                </FormField>
                {formData.deliveryType === 'domicilio' && <FormField label="Dirección exacta" required className="sm:col-span-2">
                  <Input name="deliveryAddress" value={formData.deliveryAddress} onChange={handleChange} disabled={isProcessing} required placeholder="Av. Principal 123, referencia de llegada" />
                </FormField>}
              </div>
            </SectionCard>

            <SectionCard number="3" title="Detalles del pedido" icon={NotebookPen}>
              <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <FormField label="Descripción exacta" required>
                  <Textarea name="details" value={formData.details} onChange={handleChange} required disabled={isProcessing} className="min-h-28" placeholder="Ej: Torta de chocolate, 2 pisos, relleno de fresa…" />
                </FormField>
                <div className="min-w-0 space-y-2">
                  <p className="flex flex-wrap justify-between gap-1 text-sm font-semibold text-brand-deep"><span>Fotos de referencia</span><span className="text-xs font-medium text-muted">{images.length}/{MAX_CONTRACT_IMAGES}</span></p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-3">
                    {images.map((_image, idx) => <div key={idx} className="relative aspect-square overflow-hidden rounded-xl border border-line bg-subtle shadow-xs">
                      {displayedImages[idx] ? <img src={displayedImages[idx]} alt={`Referencia ${idx + 1}`} className="size-full object-cover" /> : <span className="p-2 text-xs text-muted">Cargando…</span>}
                      <Button onClick={() => handleRemoveImage(idx)} disabled={isProcessing} className="absolute right-0.5 top-0.5 z-10 size-9 min-h-9 rounded-full p-1" variant="danger" aria-label={`Quitar foto ${idx + 1}`}>×</Button>
                    </div>)}
                    {images.length < MAX_CONTRACT_IMAGES && <div className="relative flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-accent/35 bg-accent-soft text-accent transition-colors hover:border-accent focus-within:ring-2 focus-within:ring-focus">
                      <Input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleImageChange} disabled={isProcessing} className="absolute inset-0 size-full cursor-pointer opacity-0" aria-label="Añadir fotos de referencia" />
                      <ImagePlus aria-hidden="true" className="pointer-events-none size-6" />
                    </div>}
                  </div>
                  <p className="text-xs leading-relaxed text-muted">Hasta {MAX_CONTRACT_IMAGES} fotos · JPEG, PNG o WebP · 5 MB por foto. Se guardan comprimidas solo en este dispositivo y cuenta.</p>
                </div>
              </div>
            </SectionCard>
            <ContractFinanceFields formData={formData} isProcessing={isProcessing} isEditing={isEditing} totals={totals} handleChange={handleChange} />
          </div>
          <DialogFooter className="static m-0 gap-3 bg-panel px-4 py-4 sm:m-0 sm:px-6">
            <Button onClick={onClose} disabled={isProcessing} variant="secondary">Cancelar</Button>
            <Button type="submit" loading={isProcessing} className="sm:min-w-60"><Save aria-hidden="true" />{isProcessing ? 'Procesando…' : isEditing ? 'Actualizar Pedido' : 'Guardar y Registrar Pedido'}</Button>
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
