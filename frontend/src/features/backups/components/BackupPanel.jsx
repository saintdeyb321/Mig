import { Select, Input, Button, Card } from "../../../shared/ui";
import { useState } from 'react';
import { useLocalBackup } from '../hooks/useLocalBackup.js';
export default function BackupPanel({
  user,
  businessId = user?.businessId,
  onClose
}) {
  const [encrypted, setEncrypted] = useState(true),
    [password, setPassword] = useState(''),
    [repeat, setRepeat] = useState('');
  const [pending, setPending] = useState(false),
    [photos, setPhotos] = useState(false),
    [consent, setConsent] = useState(false);
  const [maxRecords, setMaxRecords] = useState(2000),
    [file, setFile] = useState(null);
  const backup = useLocalBackup(user, businessId);
  if (!['dueño', 'superadmin'].includes(user?.role)) return null;
  const exportData = async localOnly => {
    try {
      if (encrypted && (password.length < 12 || password.length > 1024 || password !== repeat)) return;
      await backup.exportBackup({
        localOnly,
        pending: localOnly && pending,
        photos: localOnly && photos,
        password: encrypted ? password : '',
        consent,
        maxRecords
      });
    } finally {
      setPassword('');
      setRepeat('');
    }
  };
  const valid = consent && (!encrypted || password.length >= 12 && password.length <= 1024 && password === repeat);
  return <Card aria-label="Backup local Spark" as="section" className="grid gap-4 text-sm leading-relaxed [&_p]:text-muted">
    <h3 className="break-words text-lg font-semibold">Exportación local · {businessId}</h3>
    <p>Lee solo lo permitido por Firestore Rules. SuperAdmin no hereda acceso operativo. No es un backup integral de Firebase ni un snapshot atómico; evita cambios concurrentes durante la lectura.</p>
    <p>No incluye cuentas Authentication, credenciales ni objetos Storage. No hay restauración a Firebase, purga, scheduler ni jobs. Las fotografías solo existen en su dispositivo/cuenta.</p>
    <label className="text-sm leading-relaxed text-muted">Límite total de documentos Firestore <Select value={maxRecords} disabled={backup.busy} onChange={event => setMaxRecords(Number(event.target.value))}>
      {[100, 500, 2000, 5000].map(value => <option key={value} value={value}>{value}</option>)}
    </Select></label>
    <p>Páginas de hasta 200; límite adicional de 16 MiB remotos. Cada descarga consume lecturas de tu cuota Spark. Una colección inaccesible o limitada figura expresamente en el manifiesto.</p>
    <label className="flex items-start gap-2 text-sm leading-relaxed text-muted"><Input className="mt-1" type="checkbox" checked={encrypted} disabled={backup.busy} onChange={event => setEncrypted(event.target.checked)} /> Cifrar archivo (recomendado)</label>
    {!encrypted && <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft p-3 text-sm text-danger">El JSON sin cifrar contiene información personal/comercial; guárdalo en un lugar privado.</p>}
    {encrypted && <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm leading-relaxed text-muted">Contraseña (no se guarda) <Input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} disabled={backup.busy} /></label>
      <label className="text-sm leading-relaxed text-muted">Repetir contraseña <Input type="password" autoComplete="new-password" value={repeat} onChange={event => setRepeat(event.target.value)} disabled={backup.busy} /></label>
      <p className="text-xs sm:col-span-2">Si la pierdes, no podremos recuperar el archivo cifrado.</p>
    </div>}
    <label className="flex items-start gap-2 text-sm leading-relaxed text-muted"><Input className="mt-1" type="checkbox" checked={consent} disabled={backup.busy} onChange={event => setConsent(event.target.checked)} /> Autorizo estas lecturas y la descarga de información de este negocio en este equipo.</label>
    <p><Button disabled={backup.busy || !valid} onClick={() => void exportData(false)} type="button" variant="primary">Descargar datos Firestore autorizados</Button></p>
    <fieldset disabled={backup.busy} className="grid min-w-0 gap-3 rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-semibold">Archivo separado del dispositivo (siempre cifrado)</legend>
      <label className="flex items-start gap-2 text-sm leading-relaxed text-muted"><Input className="mt-1" type="checkbox" checked={pending} onChange={event => setPending(event.target.checked)} /> Consiento exportar mis pendientes cifrados, sin sincronizarlos (hasta 500 ventas/500 cajas inspeccionadas)</label>
      <label className="flex items-start gap-2 text-sm leading-relaxed text-muted"><Input className="mt-1" type="checkbox" checked={photos} onChange={event => setPhotos(event.target.checked)} /> Consiento exportar mis fotos locales (hasta 100, 4 MiB)</label>
      <Button disabled={!encrypted || !valid || !pending && !photos} onClick={() => void exportData(true)} type="button" variant="secondary">Descargar pendientes/fotos del dispositivo</Button>
    </fieldset>
    <fieldset disabled={backup.busy} className="grid min-w-0 gap-3 rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-semibold">Comprobar archivo local / dry-run sin escrituras</legend>
      <Input aria-label="Archivo de backup" type="file" accept="application/json,.json" onChange={event => setFile(event.target.files[0] ?? null)} />
      <Button disabled={!file} onClick={async () => {
        try {
          await backup.verifyFile(file, password);
        } finally {
          setPassword('');
          setRepeat('');
        }
      }} type="button" variant="secondary">Verificar integridad (0 escrituras)</Button>
    </fieldset>
    {backup.progress && <p role="status" className="rounded-xl border border-line bg-subtle/60 p-3 text-xs leading-relaxed text-muted">Leyendo {backup.progress.collection}: {backup.progress.count} documentos.</p>}
    {backup.error && <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft p-3 text-sm text-danger">{backup.error}</p>}
    {backup.result && <div role="status" className="grid gap-3 rounded-xl border border-line bg-subtle p-4">
      <p>{backup.result.filename ? `Descarga solicitada: ${backup.result.filename}` : 'Integridad local verificada; no se restauró ningún dato.'} Escrituras: 0.</p>
      <p>{backup.result.manifest.partial ? 'EXPORTACIÓN PARCIAL' : 'Alcance declarado leído; consultar exclusiones y advertencias.'}</p>
      <ul className="list-disc space-y-1 break-words pl-5 text-xs">{backup.result.manifest.sections.map(section => <li key={section.name}>{section.name}: {section.count} · {section.status} {section.warning ?? ''}</li>)}</ul>
      <ul className="list-disc space-y-1 break-words pl-5 text-xs">{backup.result.manifest.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
    </div>}
    {backup.busy && <Button onClick={backup.cancel} type="button" variant="secondary">Cancelar lectura</Button>}
    {onClose && <Button disabled={backup.busy} onClick={onClose} type="button" variant="secondary">Cerrar exportador</Button>}
  </Card>;
}
