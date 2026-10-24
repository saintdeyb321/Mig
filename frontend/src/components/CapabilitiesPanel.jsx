import { ShieldCheck } from 'lucide-react';
import { Alert, Badge, Card } from '../shared/ui';

export default function CapabilitiesPanel() {
  return <Card className="p-4 sm:p-5"><details><summary className="flex items-center gap-3 font-semibold text-ink"><ShieldCheck className="size-5 text-accent" />Capacidades y límites del sistema<Badge variant="accent" className="ml-auto">Spark</Badge></summary>
    <div className="mt-4 grid gap-3 text-sm text-muted"><p>Authentication, Firestore y Hosting. Las operaciones admitidas conservan su autorización y confirmación remota.</p>
      <Alert>Ventas online de hasta dos productos distintos. Contratos nuevos, anticipos, cuotas y devoluciones según permisos y sede.</Alert>
      <Alert variant="warning">La anulación POS, sincronización financiera offline y conciliación certificada permanecen deshabilitadas. Los cierres operativos quedan pendientes de conciliación.</Alert>
      <p>Los pendientes cifrados y las fotografías se conservan en este dispositivo. No hay Functions, Storage, jobs, purgas ni restauración privilegiada. La exportación local no es una copia integral de Firebase.</p>
    </div>
  </details></Card>;
}
