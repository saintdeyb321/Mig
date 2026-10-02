// src/modules/contracts/components/ContractFormModal.jsx
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useCustomers } from '../../../features/customers/hooks/useCustomers';
import { toDateSafe } from '../../../core/dates/dateValues';
import { useContractImageUrls } from '../../../features/contracts/hooks/useContractImageUrls';

const ContractFormModal = ({ contractToEdit, activeLocations, onClose, onSubmit, isProcessing }) => {
  const isEditing = !!contractToEdit;
  const { customers: agenda } = useCustomers();

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
      clientName: '', clientPhone: '', deliveryDate: '', details: '',
      deliveryType: 'domicilio', deliveryAddress: '', subtotal: '',
      deliveryCost: '', advancePayment: '', paymentMethod: 'efectivo'
    };
  });

  const [images, setImages] = useState(() => {
    const initialImages = [];
    if (contractToEdit) {
      if (contractToEdit.referenceImages && contractToEdit.referenceImages.length > 0) {
        contractToEdit.referenceImages.forEach(img => initialImages.push({ type: 'existing', value: img }));
      } else if (contractToEdit.referenceImage) {
        initialImages.push({ type: 'existing', value: contractToEdit.referenceImage });
      }
    }
    return initialImages;
  });
  const previewUrls = useRef(new Set());
  useEffect(() => {
    const created = previewUrls.current;
    return () => { created.forEach(url => URL.revokeObjectURL(url)); created.clear(); };
  }, []);
  const imageReferences = useMemo(() => images.map(image => image.type === 'existing' ? image.value : image.url), [images]);
  const { urls: displayedImages, error: imageError } = useContractImageUrls(imageReferences);

  const totals = useMemo(() => {
    const sub = Math.max(0, Number(formData.subtotal) || 0);
    const del = Math.max(0, Number(formData.deliveryCost) || 0);
    const total = sub + del;

    if (isEditing) {
      const paid = Number(contractToEdit.paidTotal ?? Math.max(0, Number(contractToEdit.total || 0) - Number(contractToEdit.balance || 0)));
      return { total, balance: Math.max(0, total - paid), totalPaid: paid };
    }

    const adv = Math.max(0, Number(formData.advancePayment) || 0);
    return { total, balance: Math.max(0, total - adv), totalPaid: adv };
  }, [formData.subtotal, formData.deliveryCost, formData.advancePayment, isEditing, contractToEdit]);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev, [name]: value,
      ...(name === 'deliveryType' && value !== 'domicilio' ? { deliveryAddress: '' } : {})
    }));
  }, []);

  const handleSelectContact = (contact) => {
    setFormData(prev => ({
      ...prev,
      clientName: contact.name,
      clientPhone: contact.phone || ''
    }));
    setShowAgendaModal(false);
    setAgendaSearch('');
    toast.success(`Datos de ${contact.name} cargados.`, { icon: '📖' });
  };

  const filteredAgenda = useMemo(() => {
    const lowerSearch = agendaSearch.toLowerCase();
    return agenda.filter(c =>
      c.name.toLowerCase().includes(lowerSearch) ||
      (c.phone && c.phone.includes(lowerSearch))
    );
  }, [agenda, agendaSearch]);

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    if (images.length + files.length > 4) {
      return toast.error("Máximo 4 imágenes de referencia por pedido.");
    }
    if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      || !/\.(jpe?g|png|webp)$/i.test(file.name) || file.size > 5 * 1024 * 1024)) {
      return toast.error('Usa imágenes JPEG, PNG o WebP de hasta 5 MB.');
    }

    const newImages = files.map(file => {
      const url = URL.createObjectURL(file);
      previewUrls.current.add(url);
      return { type: 'new', file, url };
    });

    setImages(prev => [...prev, ...newImages]);
    e.target.value = null;
  };

  const handleRemoveImage = (indexToRemove) => {
    const removed = images[indexToRemove];
    if (removed?.type === 'new') {
      URL.revokeObjectURL(removed.url);
      previewUrls.current.delete(removed.url);
    }
    setImages(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleFormSubmit = (e) => {
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
        initialPayment: { amount: Number(formData.advancePayment), method: formData.paymentMethod },
      } : {}),
      newImages: newImageFiles,
      retainedImages: existingImages
    };

    onSubmit(finalData, null, isEditing ? contractToEdit.id : null);
  };

  return (
    <>
      <div className="cfm-overlay fade-in">
        <div className="cfm-modal-container">

          <div className="cfm-header">
            <div className="cfm-title-group">
              <span className="cfm-icon">{isEditing ? '✏️' : '📝'}</span>
              <h2>{isEditing ? 'Editar Pedido' : 'Registro de Nuevo Pedido'}</h2>
            </div>
            <button type="button" onClick={onClose} className="cfm-btn-close" disabled={isProcessing}>✖</button>
          </div>

          <form onSubmit={handleFormSubmit} className="cfm-body">

            <div className="cfm-section">
              <h4 className="cfm-section-title">1. Datos del Cliente</h4>

              <div className="cfm-grid-2">
                <div className="cfm-input-group">
                  <label>Nombre Completo <span className="req">*</span></label>
                  <input name="clientName" autoFocus value={formData.clientName} onChange={handleChange} required disabled={isProcessing} placeholder="Ej: Juan Pérez" />
                </div>

                <div className="cfm-input-group">
                  <label>Teléfono / WhatsApp</label>
                  <input name="clientPhone" type="tel" value={formData.clientPhone} onChange={handleChange} disabled={isProcessing} placeholder="987 654 321" autoComplete="off" />
                </div>
              </div>


              {!isEditing && agenda.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setShowAgendaModal(true)}
                    disabled={isProcessing}
                    className="btn-agenda-inline"
                    style={{ margin: 0 }} /* Reseteamos el margin porque el flex padre ya lo centra */
                  >
                    📖 Buscar en Agenda
                  </button>
                </div>
              )}
            </div>



            <div className="cfm-section">
              <h4 className="cfm-section-title">2. Logística de Entrega</h4>
              <div className="cfm-grid-3">
                <div className="cfm-input-group">
                  <label>Fecha y Hora <span className="req">*</span></label>
                  <input name="deliveryDate" type="datetime-local" value={formData.deliveryDate} onChange={handleChange} required disabled={isProcessing} />
                </div>
                <div className="cfm-input-group">
                  <label>Método de Entrega <span className="req">*</span></label>
                  <select name="deliveryType" value={formData.deliveryType} onChange={handleChange} disabled={isProcessing}>
                    <option value="domicilio">🛵 Delivery a Domicilio</option>
                    <optgroup label="🏪 Recoger en Local (Sedes)">
                      {activeLocations.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </optgroup>
                  </select>
                </div>
                {formData.deliveryType === 'domicilio' && (
                  <div className="cfm-input-group">
                    <label>Dirección Exacta <span className="req">*</span></label>
                    <input name="deliveryAddress" value={formData.deliveryAddress} onChange={handleChange} disabled={isProcessing} required placeholder="Av. Principal 123" />
                  </div>
                )}
              </div>
            </div>

            <div className="cfm-section">
              <h4 className="cfm-section-title">3. Detalles del Pedido</h4>
              <div className="cfm-grid-product">
                <div className="cfm-input-group cfm-text-details">
                  <label>Descripción Exacta <span className="req">*</span></label>
                  <textarea name="details" value={formData.details} onChange={handleChange} required disabled={isProcessing} placeholder="Ej: Torta de chocolate, 2 pisos, relleno de fresa..." />
                </div>

                <div className="cfm-input-group cfm-photos-gallery-group">
                  <label>Fotos de Referencia (Max 4)</label>
                  <div className="cfm-gallery-container">
                    {images.map((_image, idx) => (
                      <div key={idx} className="cfm-gallery-item">
                        {displayedImages[idx] ? <img src={displayedImages[idx]} alt={`Ref ${idx}`} className="cfm-gallery-img" /> : <span>Cargando imagen...</span>}
                        <button type="button" onClick={() => handleRemoveImage(idx)} disabled={isProcessing} className="cfm-btn-remove-img" title="Eliminar foto">✖</button>
                      </div>
                    ))}
                    {images.length < 4 && (
                      <div className="cfm-gallery-add" title="Subir foto">
                        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleImageChange} disabled={isProcessing} className="cfm-gallery-input" />
                        <span className="cfm-gallery-add-icon">➕</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="cfm-section cfm-section-finance">
              <h4 className="cfm-section-title">
                4. Finanzas y Cobro
                {isEditing && <span className="cfm-edit-warning"> (Puedes ajustar los precios. Los abonos previos se mantienen)</span>}
              </h4>

              <div className="cfm-finance-grid">
                <div className="cfm-cost-inputs">
                  <div className="cfm-input-group">
                    <label>Costo del Producto (S/) <span className="req">*</span></label>
                    <input name="subtotal" type="number" min="0" step="0.50" value={formData.subtotal} onChange={handleChange} disabled={isProcessing} required placeholder="0.00" />
                  </div>
                  <div className="cfm-input-group">
                    <label>Costo Delivery (S/)</label>
                    <input name="deliveryCost" type="number" min="0" step="0.50" value={formData.deliveryCost} onChange={handleChange} disabled={isProcessing || formData.deliveryType !== 'domicilio'} placeholder="0.00" />
                  </div>
                </div>

                <div className="cfm-total-display">
                  <span>Total a Pagar</span>
                  <strong>S/ {totals.total.toFixed(2)}</strong>
                </div>

                {!isEditing && (
                  <div className="cfm-advance-inputs">
                    <div className="cfm-input-group">
                      <label>1ra Cuota (S/) <span style={{fontSize: '0.75rem', opacity: 0.7, fontWeight: 'normal'}}>(Opcional)</span></label>
                      <input name="advancePayment" type="number" min="0" max={totals.total} step="0.50" value={formData.advancePayment} onChange={handleChange} disabled={isProcessing || totals.total === 0} placeholder="0.00" />
                    </div>
                    <div className="cfm-input-group">
                      <label>Método de Pago</label>
                      <select name="paymentMethod" value={formData.paymentMethod} onChange={handleChange} disabled={isProcessing || !formData.advancePayment || Number(formData.advancePayment) === 0}>
                        <option value="efectivo">💵 Efectivo (A Caja)</option>
                        <option value="yape">📱 Yape/Plin</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {isEditing ? (
                <div className={`cfm-debt-summary ${totals.balance > 0 ? 'has-debt' : 'fully-paid'}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span>Total Abonado hasta ahora:</span>
                    <strong>S/ {totals.totalPaid.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: totals.balance > 0 ? '#b45309' : '#15803d' }}>
                    <span>Nuevo saldo pendiente:</span>
                    <strong>S/ {totals.balance.toFixed(2)}</strong>
                  </div>
                </div>
              ) : (
                totals.total > 0 && (
                  <div className={`cfm-debt-summary ${totals.balance > 0 ? 'has-debt' : 'fully-paid'}`}>
                    {totals.balance > 0
                      ? `El cliente dejará un saldo pendiente de S/ ${totals.balance.toFixed(2)}`
                      : 'El pedido quedará totalmente pagado ✅'}
                  </div>
                )
              )}
            </div>

            <div className="cfm-footer">
              <button type="button" onClick={onClose} disabled={isProcessing} className="cfm-btn-cancel">Cancelar</button>
              <button type="submit" disabled={isProcessing} className="cfm-btn-submit">
                {isProcessing ? 'Procesando...' : (isEditing ? 'Actualizar Pedido' : 'Guardar y Registrar Pedido')}
              </button>
            </div>

          </form>
        </div>
      </div>

      {showAgendaModal && (
        <div className="modal-overlay fade-in" style={{ zIndex: 10000 }}>
          <div className="card modal-content" style={{ maxWidth: '400px', padding: 0, overflow: 'hidden', borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>

            <div style={{ padding: '15px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📖 Seleccionar Cliente
              </h3>
              <button
                type="button"
                onClick={() => setShowAgendaModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}
              >
                ✖
              </button>
            </div>

            <div style={{ padding: '15px' }}>
              <div style={{ position: 'relative', marginBottom: '15px' }}>
                <span style={{ position: 'absolute', left: '10px', top: '10px', opacity: 0.5 }}>🔍</span>
                <input
                  type="text"
                  placeholder="Buscar nombre o celular..."
                  value={agendaSearch}
                  onChange={e => setAgendaSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 10px 10px 35px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.95rem' }}
                  autoFocus
                />
              </div>

              <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '5px' }}>
                {filteredAgenda.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '0.9rem', background: '#f1f5f9', borderRadius: '8px' }}>
                    No se encontraron clientes.
                  </div>
                ) : (
                  filteredAgenda.map(c => (
                    <div
                      key={c.id}
                      onClick={() => handleSelectContact(c)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s ease', background: 'white' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.background = '#eff6ff'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'white'; }}
                    >
                      <div>
                        <strong style={{ display: 'block', color: '#0f172a', fontSize: '0.95rem' }}>{c.name}</strong>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>📱 {c.phone || 'Sin número'}</span>
                      </div>
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#10b981', border: 'none' }}
                      >
                        Elegir
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
};

export default ContractFormModal;
