import { useEffect, useState } from 'react';
import { Building2, ClipboardList, Download, UsersRound } from 'lucide-react';
import { readPlatformBusiness } from '../../features/licenses/infrastructure/platformBusinessRepository.js';
import BackupPanel from '../../features/backups/components/BackupPanel.jsx';
import { toDateSafe } from '../../core/dates/dateValues.js';
import { Alert, Badge, Button, Card, Dialog, HelpDisclosure, LoadingState, SectionCard } from '../../shared/ui';

export function BusinessDetailsDialog({ user, license, onClose, onQuota }) {
  const [result, setResult] = useState(null), [error, setError] = useState(null), [attempt, retry] = useState(0);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    readPlatformBusiness({ actorId: user.uid, businessId: license.id, signal: controller.signal, includePeople: true }).then(value => {
      if (!controller.signal.aborted) { setResult(value); setError(null); }
    }).catch(failure => { if (!controller.signal.aborted) setError(failure); });
    return () => controller.abort();
  }, [user.uid, license.id, attempt]);
  const people = name => {
    const section = result?.sections.find(entry => entry.name === name);
    return <div className="space-y-3"><p className="text-xs text-muted">{section?.status === 'complete' ? `${section.count} documentos confirmados en esta lectura.` : section?.status === 'limited' ? 'Lista parcial: primeros 50 documentos.' : 'Lectura no confirmada; no se afirma que la lista esté vacía.'}</p>
      {section?.error && <Alert variant="warning">{section.error}</Alert>}
      {(result?.people[name] ?? []).map(person => <Card as="article" key={person.id} className="space-y-1 p-3 sm:p-3"><p className="break-all font-semibold">{person.email || 'Email no documentado'}</p><p className="break-all font-mono text-xs text-muted">{name === 'users' ? 'UID de perfil' : 'ID de invitación'}: {person.id}</p><p className="text-xs">Rol: {person.role ?? 'no documentado'} · Estado: {person.status ?? 'no documentado'} · Sede: {person.branchId ?? 'no documentada'}</p></Card>)}
    </div>;
  };
  const currentLicense = result?.licenses ?? license;
  return <Dialog title="Detalle del negocio" description={license.businessName} icon={Building2} onClose={onClose} className="max-w-4xl">
    <Alert title="Lectura administrativa bajo demanda">Revisa un solo negocio. Permiso de lectura temporal: 1–2 escrituras de control, 0 escrituras de negocio. La muestra inicial no es un inventario exhaustivo.</Alert>
    {error ? <Alert variant="danger">{error.message}<Button onClick={() => retry(value => value + 1)} variant="secondary">Reintentar detalle</Button></Alert> : !result ? <LoadingState>Consultando el negocio elegido…</LoadingState> : <>
      <SectionCard title="Negocio y licencia" icon={Building2}><dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-muted">BusinessId canónico</dt><dd className="break-all font-mono">{license.id}</dd></div>
        <div><dt className="text-xs text-muted">Nombre</dt><dd>{result.tenants?.businessName ?? currentLicense.businessName ?? 'No documentado'}</dd></div>
        <div><dt className="text-xs text-muted">Estado de negocio / licencia</dt><dd>{result.tenants?.status ?? 'tenant no documentado'} / {currentLicense.status ?? 'licencia no documentada'}</dd></div>
        <div><dt className="text-xs text-muted">Vencimiento</dt><dd>{toDateSafe(currentLicense.expiry)?.toLocaleString('es-PE') ?? 'No documentado'}</dd></div>
        <div><dt className="text-xs text-muted">Cupo de sedes</dt><dd>{currentLicense.branchQuotaVersion === 1 ? `${currentLicense.activeBranchIds.length} / ${currentLicense.maxActiveBranches} plazas registradas` : 'Histórico sin regularizar'}</dd></div>
      </dl><Button variant="secondary" onClick={() => onQuota({ ...currentLicense, id: license.id, businessName: license.businessName })}>Modificar / regularizar cupo</Button></SectionCard>
      <SectionCard title="Sucursales existentes" icon={Building2}><div className="grid gap-2">{result.branches.map(branch => <div className="flex flex-wrap justify-between gap-2 rounded-xl border border-line bg-panel p-3 text-sm" key={branch.id}><span className="min-w-0 break-all">{branch.name} · {branch.id}</span><Badge variant={branch.status === 'activo' ? 'success' : 'warning'}>{branch.status ?? 'no verificado'}</Badge>{branch.branchLifecycleVersion !== 1 && <span className="text-xs text-warning">Cierre histórico requiere revisión administrativa</span>}</div>)}</div>{!result.complete && <Alert variant="warning">Lista de sedes incompleta; no permite regularizar el cupo.</Alert>}</SectionCard>
      <SectionCard title="Perfiles vinculados" icon={UsersRound}>{people('users')}<p className="text-xs text-muted">Estos UID/emails proceden de Firestore. Revisa cada uno manualmente en Firebase Authentication; no se afirma que enumeren todas las cuentas Auth.</p></SectionCard>
      <SectionCard title="Invitaciones pendientes" icon={UsersRound}>{people('invites')}</SectionCard>
      <SectionCard title="Inventario inicial de colecciones conocidas" icon={ClipboardList}><div className="overflow-x-auto"><table className="w-full min-w-96 text-left text-xs"><thead><tr className="border-b border-line"><th className="p-2">Colección</th><th className="p-2">Alcance observado</th><th className="p-2">Estado</th></tr></thead><tbody>{result.inventory.map(section => <tr key={section.name} className="border-b border-line"><td className="p-2 font-mono">{section.name}</td><td className="p-2">{section.status === 'sample-only' ? '≥1, solo muestra' : section.count ?? 'sin verificar'}</td><td className="p-2">{section.status}{section.error && <p className="max-w-md break-words text-danger">{section.error}</p>}</td></tr>)}</tbody></table></div>
        <p className="text-xs text-warning">Subcolecciones históricas de jobs (scopes/asset_sources), padres ausentes, rutas desconocidas, referencias y archivos locales requieren inventario adicional. Una muestra vacía no demuestra ausencia recursiva.</p>
      </SectionCard>
      {result.warnings.map(warning => <Alert key={warning} variant="warning">{warning}</Alert>)}
      <SectionCard title="Baja de negocio · preparación supervisada" icon={ClipboardList}>
        <ol className="list-decimal space-y-2 pl-5 text-sm"><li>Confirmar identidad, negocio y conservación con el propietario por WhatsApp externo.</li><li>Revisar cajas, anticipos, cuotas, devoluciones y pendientes/fotos en cada cuenta/dispositivo.</li><li>Exportar datos e inventario por separado, comprobar checksums y el estado de cada colección declarada; una copia limitada no es integral.</li><li>Revisar en Authentication los UID y correos anteriores y cualquier cuenta adicional; borrar Auth no borra Firestore.</li><li>Preparar un manifiesto local de rutas/checkpoints; completar en Console el alcance recursivo desconocido y referencias sin asumir propiedad.</li><li>Solo con autorización destructiva independiente y herramienta exhaustiva/reanudable se podría ejecutar una limpieza. Después verificar rutas conocidas y las exclusiones manuales.</li></ol>
        <Button onClick={() => setExporting(value => !value)} variant="secondary"><Download />{exporting ? 'Ocultar exportador' : 'Exportar, inventariar y preparar dry-run'}</Button>
        <Button variant="danger" disabled>Ejecutar eliminación · no habilitado</Button>
        <HelpDisclosure title="Procedimiento administrativo local pendiente">Guardar previamente las Rules publicadas y las configuraciones activas; autenticar manualmente al operador autorizado en Firebase CLI sin cuentas de servicio; revisar proyecto migapos y base (default). Inventariar recursivamente colecciones/documentos incluidos padres ausentes desde un entorno administrativo de confianza, validar propiedad de cada ruta, conflictos/cajas y copia cifrada entregada; registrar checkpoints/lotes y reanudación. La CLI administrativa puede omitir Rules y destruir datos, por lo que no se incluye un comando de borrado ni un ejecutor en esta app. Requiere autorización independiente, revisión humana y verificación final, sin Blaze ni backend desplegado.</HelpDisclosure>
      </SectionCard>
    </>}
    {exporting && <BackupPanel user={user} businessId={license.id} onClose={() => setExporting(false)} />}
  </Dialog>;
}
