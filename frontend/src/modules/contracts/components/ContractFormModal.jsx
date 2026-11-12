import { ContractFinanceFields } from "./ContractFinanceFields";
import { Dialog, Input, FormField, Button, Select, Textarea, DialogFooter, SectionCard } from "../../../shared/ui";
import { CalendarClock, ImagePlus, Images, NotebookPen, Save, UserRound } from 'lucide-react';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { toDateSafe } from '../../../core/dates/dateValues';
import { useContractImageUrls } from '../../../features/contracts/hooks/useContractImageUrls';
import { contractImageList, contractImageScope } from '../../../features/contracts/infrastructure/contractImages';
import { contractMediaId, fitsContractImageLimit, MAX_CONTRACT_IMAGES } from '../../../features/contracts/application/contractImagePolicy.js';
const ContractFormModal = ({
  contractToEdit, user,
  activeLocations,
  onClose,
  onSubmit,
  isProcessing,
  cashAction
}) => {
  const isEditing = !!contractToEdit;
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
  const savedImages = contractImageList(contractToEdit);
  const [images, setImages] = useState(() => savedImages.map(value => ({ type: 'existing', value })));
  const overImageLimit = images.length > MAX_CONTRACT_IMAGES;
  const previewUrls = useRef(new Set());
  useEffect(() => {
    const created = previewUrls.current;
    return () => {
      created.forEach(url => URL.revokeObjectURL(url));
      created.clear();
    };
  }, []);
  const {
    urls: existingPreviews, loading: loadingImages, error: imageError
  } = useContractImageUrls(savedImages, { preserveSlots: true, scope: contractImageScope(contractToEdit, user?.uid) });
  const displayedImages = images.map(image => image.type === 'new' ? image.url : existingPreviews[savedImages.indexOf(image.value)]);
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
  const handleImageChange = e => {
    const files = Array.from(e.currentTarget.files);
    e.currentTarget.value = '';
    if (files.length === 0) return;
    if (images.length + files.length > MAX_CONTRACT_IMAGES) {
      return toast.error(`Máximo ${MAX_CONTRACT_IMAGES} imágenes de referencia por pedido.`);
    }
    if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !/\.(jpe?g|png|webp)$/i.test(file.name) || file.size > 5 * 1024 * 1024)) {
      return toast.error('Usa imágenes JPEG, PNG o WebP de hasta 5 MB. Se comprimen para adjuntarlas al pedido.');
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
    if (!fitsContractImageLimit([...existingImages, ...newImageFiles], savedImages)) {
      return toast.error(`Reduce la selección a ${MAX_CONTRACT_IMAGES} fotos para guardar los cambios en las referencias.`);
    }
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
      retainedImages: existingImages,
      removeMediaIds: savedImages.filter(ref => !existingImages.includes(ref)).map(contractMediaId).filter(Boolean)
    };
    onSubmit(finalData, null, isEditing ? contractToEdit.id : null);
  };
  return <>
      <Dialog title={isEditing ? 'Editar Pedido' : 'Registro de Nuevo Pedido'} description="Cada detalle, listo para una entrega especial." icon={NotebookPen} busy={isProcessing} className="dialog-form-surface max-w-[850px]" bodyClassName="flex flex-col space-y-0 overflow-hidden p-0 sm:p-0" onClose={onClose}>
        <form onSubmit={handleFormSubmit} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="ui-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-canvas p-4 sm:p-6">
            <SectionCard number="1" title="Datos del cliente" icon={UserRound} tone="customer">
              <div className="grid min-w-0 gap-x-4 gap-y-3.5 sm:grid-cols-2">
                <FormField label="Nombre completo" required>
                  <Input name="clientName" autoFocus value={formData.clientName} onChange={handleChange} required disabled={isProcessing} placeholder="Ej: Juan Pérez" />
                </FormField>
                <FormField label="Teléfono / WhatsApp">
                  <Input name="clientPhone" type="tel" value={formData.clientPhone} onChange={handleChange} disabled={isProcessing} placeholder="987 654 321" autoComplete="off" />
                </FormField>
              </div>

            </SectionCard>

            <SectionCard number="2" title="Logística de entrega" icon={CalendarClock} tone="delivery">
              <div className="grid min-w-0 gap-x-4 gap-y-3.5 sm:grid-cols-2">
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

            <SectionCard number="3" title="Detalles del pedido" icon={NotebookPen} tone="details">
              <div className="grid min-w-0 items-start gap-4 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                <FormField label="Descripción exacta" required>
                  <Textarea name="details" value={formData.details} onChange={handleChange} required disabled={isProcessing} className="min-h-32" placeholder="Ej: Torta de chocolate, 2 pisos, relleno de fresa…" />
                </FormField>
                <div className="min-w-0 space-y-2.5 rounded-2xl border border-accent/20 bg-linear-to-br from-panel to-accent-soft/65 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-brand-deep">
                    <span className="flex items-center gap-2"><Images aria-hidden="true" className="size-4 text-accent" />Fotos de referencia</span>
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent tabular-nums">
                      {overImageLimit ? `${images.length} fotos existentes` : `${images.length}/${MAX_CONTRACT_IMAGES}`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-2">
                    {images.map((_image, idx) => <div key={idx} className="relative aspect-square min-w-0 rounded-xl border border-accent/15 bg-panel shadow-xs">
                      {displayedImages[idx] ? <img src={displayedImages[idx]} alt={`Referencia ${idx + 1}`} className="size-full rounded-[inherit] object-cover" />
                        : <span className="absolute inset-x-1 bottom-2 text-center text-xs text-muted">{loadingImages ? 'Cargando…' : 'No disponible aquí'}</span>}
                      <Button onClick={() => handleRemoveImage(idx)} disabled={isProcessing} className="absolute top-1 right-1 size-9 min-h-9 rounded-full p-1" variant="danger" aria-label={`Quitar foto ${idx + 1}`}>×</Button>
                    </div>)}
                    {images.length < MAX_CONTRACT_IMAGES && <div className="relative flex aspect-square min-w-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-accent/45 bg-accent-soft/70 p-1 text-center text-accent transition-colors hover:border-accent hover:bg-accent-soft focus-within:ring-2 focus-within:ring-focus motion-reduce:transition-none">
                      <Input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleImageChange} disabled={isProcessing} className="absolute inset-0 size-full cursor-pointer opacity-0" aria-label="Añadir fotos de referencia" />
                      <ImagePlus aria-hidden="true" className="pointer-events-none size-5" />
                      <span aria-hidden="true" className="pointer-events-none text-xs font-semibold">Añadir fotos</span>
                    </div>}
                  </div>
                  <p className="text-xs leading-relaxed text-muted">Hasta {MAX_CONTRACT_IMAGES} fotos · JPEG, PNG o WebP · archivo original de hasta 5 MiB por foto.</p>
                  <p className="text-xs text-muted">Las fotos nuevas estarán disponibles en otros dispositivos autorizados cuando se confirme su subida. Si se interrumpe, reintenta desde el pedido en este dispositivo.</p>
                  {imageError && <p role="status" className="text-xs text-warning">{imageError.message}</p>}
                  {overImageLimit && <p className="rounded-lg bg-warning-soft px-2 py-1.5 text-xs text-warning">Puedes conservar las fotos anteriores. Para cambiar la selección, redúcela a {MAX_CONTRACT_IMAGES} como máximo.</p>}
                </div>
              </div>
            </SectionCard>
            {cashAction}
            <ContractFinanceFields formData={formData} isProcessing={isProcessing} isEditing={isEditing} totals={totals} handleChange={handleChange} />
          </div>
          <DialogFooter className="static m-0 grid grid-cols-2 gap-2 border-finance-line/60 bg-linear-to-r from-panel via-panel to-success-soft/70 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:m-0 sm:grid-cols-[minmax(0,11rem)_minmax(0,16rem)] sm:justify-center sm:gap-3 sm:px-6">
            <Button onClick={onClose} disabled={isProcessing} variant="secondary" className="px-2">Cancelar</Button>
            <Button type="submit" loading={isProcessing} className="px-2"><Save aria-hidden="true" className="max-xs:hidden" />{isProcessing ? 'Procesando…' : isEditing ? 'Actualizar Pedido' : 'Guardar y Registrar Pedido'}</Button>
          </DialogFooter>
        </form>
      </Dialog>

    </>;
};
export default ContractFormModal;
