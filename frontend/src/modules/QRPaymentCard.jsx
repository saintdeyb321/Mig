import { Input, Button, cn } from "../shared/ui";
// src/modules/QRPaymentCard.jsx
import React, { memo } from 'react';
const QRPaymentCard = memo(({
  qrImageBase64,
  isProcessing,
  handleImageChange,
  onRemoveImage // 🚀 Nueva prop para limpiar la imagen desde el formulario
}) => {
  return (
    // Le quitamos la clase "card" para que encaje perfecto dentro del modal de la sucursal, pero mantenemos tu diseño.
    <div className="border-t-4 border-t-accent py-4 px-0 mt-4">
      <h3 className="text-lg font-semibold">Pagos Digitales (Opcional)</h3>
      <p className="text-sm leading-relaxed text-muted">
        Sube la imagen del código QR de Yape/Plin para esta sede. El sistema la optimizará automáticamente.
      </p>

      <div className="grid justify-items-center gap-4 rounded-xl border border-dashed border-line bg-subtle p-4">

        <div className="flex aspect-square w-full max-w-52 items-center justify-center overflow-hidden rounded-xl border border-line bg-panel p-2">
          {qrImageBase64 ? <img src={qrImageBase64} alt="Vista previa QR" className="size-full object-contain animate-enter motion-reduce:animate-none" /> : <span className="text-4xl text-muted">📲</span>}
        </div>

        <div className="grid w-full gap-2">
          <Input type="file" id="qr-upload" accept="image/*" onChange={handleImageChange} className="hidden" disabled={isProcessing} />

          <div className="flex gap-2.5 w-full flex-wrap">
            <label htmlFor="qr-upload" className="cursor-pointer rounded-xl border border-line bg-panel text-sm font-medium hover:bg-subtle flex-[1_1_200px] text-center m-0 min-h-12 flex items-center justify-center py-0 px-4">
              {qrImageBase64 ? '🔄 Cambiar imagen' : '📁 Seleccionar QR'}
            </label>

            {/* 🚀 Botón Eliminar: type="button" es vital para no enviar el formulario por accidente */}
            {qrImageBase64 && <Button type="button" onClick={onRemoveImage} disabled={isProcessing} title="Eliminar QR permanentemente" variant="secondary" className={cn("flex-[1_1_200px] bg-danger text-panel border-0 rounded-xl min-h-12 text-base font-semibold flex items-center justify-center gap-2", isProcessing ? "cursor-not-allowed" : "cursor-pointer")}>
                🗑️ Eliminar Imagen
              </Button>}
          </div>
        </div>
      </div>
    </div>
  );
});
export default QRPaymentCard;
