import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, IconButton } from '../../../shared/ui';
export function ContractPhotoViewer({
  images,
  index,
  onClose,
  onPrevious,
  onNext,
  busy
}) {
  return <Dialog title="Fotografía de referencia" description={`Imagen ${index + 1} de ${images.length}`} onClose={onClose} busy={busy} className="max-w-5xl">
    <div className="relative flex min-h-40 items-center justify-center rounded-xl bg-subtle p-2">
      <img src={images[index]} alt={`Referencia ${index + 1} ampliada`} className="max-h-[60dvh] w-full object-contain" />
      {images.length > 1 && <>
        <IconButton label="Foto anterior" onClick={onPrevious} className="absolute left-2 bg-panel shadow-card"><ChevronLeft /></IconButton>
        <IconButton label="Foto siguiente" onClick={onNext} className="absolute right-2 bg-panel shadow-card"><ChevronRight /></IconButton>
      </>}
    </div>
  </Dialog>;
}
