import { ConfirmDialog, Textarea, FormField, Button, DialogFooter } from "../../../shared/ui";
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
        <div className="flex items-center gap-3">
          <div className="text-2xl text-danger">⚠️</div>
          <div className="grid gap-1">

            <span className="font-mono text-xs text-muted">{contract.contractId}</span>
          </div>
        </div>

        {/* CUERPO */}
        <div className="grid gap-4">
          <div className="rounded-xl border border-danger/20 bg-danger-soft p-4 text-sm leading-relaxed text-danger">
            Estás a punto de cancelar el pedido de <strong>{contract.clientName}</strong>.
            Esta acción <strong>NO</strong> se puede deshacer y obligará a reembolsar <strong>S/ {(contract.total - contract.balance).toFixed(2)}</strong> si hubo adelantos.
          </div>

          <FormField className="grid gap-2 [&>label]:text-sm [&>label]:font-medium [&>small]:text-xs [&>small]:text-muted" label={<>MOTIVO DE LA ANULACIÓN <span className="text-danger">*</span></>}>

            <Textarea autoFocus value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Ej: El cliente canceló el evento a última hora..." disabled={isProcessing} />
            <small>Este motivo quedará registrado para futuras auditorías.</small>
          </FormField>
        </div>

        {/* PIE DE PÁGINA */}
        <DialogFooter>
          <Button type="button" onClick={onClose} disabled={isProcessing} variant="secondary">
            Mantener Pedido
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isProcessing || !cancelReason.trim()} variant="danger">
            {isProcessing ? 'Procesando...' : 'Confirmar Anulación'}
          </Button>
        </DialogFooter>

      </ConfirmDialog>;
};
export default ContractCancelModal;
