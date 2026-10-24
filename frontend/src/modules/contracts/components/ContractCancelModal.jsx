import { ConfirmDialog } from "../../../shared/ui";
// src/modules/contracts/components/ContractCancelModal.jsx
import React, { useState } from 'react';
import toast from 'react-hot-toast';
const ContractCancelModal = ({
  contract,
  onClose,
  onConfirm,
  isProcessing
}) => {
  const [cancelReason, setCancelReason] = useState('');
  if (!contract) return null;
  const handleConfirm = () => {
    if (!cancelReason.trim()) return toast.error('El motivo es obligatorio para auditoría.');
    onConfirm(contract.id, cancelReason);
  };
  return <ConfirmDialog title={<>Anular Pedido Definitivamente</>} busy={isProcessing} className="max-w-lg" onClose={onClose}>

        {/* CABECERA */}
        <div className="cancel-header">
          <div className="cancel-icon">⚠️</div>
          <div className="cancel-title-group">

            <span className="cancel-id">{contract.contractId}</span>
          </div>
        </div>

        {/* CUERPO */}
        <div className="cancel-body">
          <div className="cancel-warning">
            Estás a punto de cancelar el pedido de <strong>{contract.clientName}</strong>.
            Esta acción <strong>NO</strong> se puede deshacer y obligará a reembolsar <strong>S/ {(contract.total - contract.balance).toFixed(2)}</strong> si hubo adelantos.
          </div>

          <div className="cancel-input-wrapper">
            <label>MOTIVO DE LA ANULACIÓN <span className="req">*</span></label>
            <textarea autoFocus value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Ej: El cliente canceló el evento a última hora..." disabled={isProcessing} />
            <small>Este motivo quedará registrado para futuras auditorías.</small>
          </div>
        </div>

        {/* PIE DE PÁGINA */}
        <div className="cancel-footer">
          <button type="button" onClick={onClose} disabled={isProcessing} className="cancel-btn-back">
            Mantener Pedido
          </button>
          <button type="button" onClick={handleConfirm} disabled={isProcessing || !cancelReason.trim()} className="cancel-btn-confirm">
            {isProcessing ? 'Procesando...' : 'Confirmar Anulación'}
          </button>
        </div>

      </ConfirmDialog>;
};
export default ContractCancelModal;
