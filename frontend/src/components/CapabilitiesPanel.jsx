import { ChevronDown, ShieldCheck } from 'lucide-react';
import { Alert, Badge } from '../shared/ui';

export default function CapabilitiesPanel() {
  return <details className="group rounded-card border border-accent/20 bg-linear-to-br from-panel to-accent-soft/65 shadow-card">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-card px-3.5 py-3 font-bold text-brand-deep [&::-webkit-details-marker]:hidden sm:px-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/15 bg-accent-soft text-accent"><ShieldCheck aria-hidden="true" className="size-5" /></span>
      <span className="min-w-0 flex-1 text-sm">Capacidades y límites del sistema</span><Badge variant="accent">Spark</Badge>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-accent group-open:rotate-180 motion-safe:transition-transform" />
    </summary>
    <div className="grid gap-3 border-t border-accent/15 px-3.5 py-3 text-sm text-muted sm:px-4"><p>Authentication, Firestore y Hosting. Las operaciones admitidas conservan su autorización y confirmación remota.</p>
      <Alert>Ventas online de hasta 8 productos distintos. El personal autorizado puede anular tickets compatibles con una caja vigente en la sede de origen. Contratos, anticipos y cuotas según permisos y sede.</Alert>
      <Alert variant="warning">La sincronización financiera offline y la conciliación certificada permanecen deshabilitadas. Los cierres operativos quedan pendientes de conciliación.</Alert>
      <p>Los pendientes cifrados y las fotografías se conservan en este dispositivo. No hay Functions, Storage, jobs, purgas ni restauración privilegiada. La exportación local no es una copia integral de Firebase.</p>
    </div>
  </details>;
}
