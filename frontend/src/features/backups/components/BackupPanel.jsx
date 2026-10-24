import { useState } from 'react';
import { useLocalBackup } from '../hooks/useLocalBackup.js';

export default function BackupPanel({ user, businessId = user?.businessId, onClose }) {
  const [encrypted, setEncrypted] = useState(true), [password, setPassword] = useState(''), [repeat, setRepeat] = useState('');
  const [pending, setPending] = useState(false), [photos, setPhotos] = useState(false), [consent, setConsent] = useState(false);
  const [maxRecords, setMaxRecords] = useState(2000), [file, setFile] = useState(null);
  const backup = useLocalBackup(user, businessId);
  if (!['dueño', 'superadmin'].includes(user?.role)) return null;
  const exportData = async localOnly => {
    try {
      if (encrypted && (password.length < 12 || password.length > 1024 || password !== repeat)) return;
      await backup.exportBackup({ localOnly, pending: localOnly && pending, photos: localOnly && photos,
        password: encrypted ? password : '', consent, maxRecords });
    } finally { setPassword(''); setRepeat(''); }
  };
  const valid = consent && (!encrypted || password.length >= 12 && password.length <= 1024 && password === repeat);
  return <section className="card" aria-label="Backup local Spark">
    <h3>Exportación local · {businessId}</h3>
    <p>Lee solo lo permitido por Firestore Rules. SuperAdmin no hereda acceso operativo. No es un backup integral de Firebase ni un snapshot atómico; evita cambios concurrentes durante la lectura.</p>
    <p>No incluye cuentas Authentication, credenciales ni objetos Storage. No hay restauración a Firebase, purga, scheduler ni jobs. Las fotografías solo existen en su dispositivo/cuenta.</p>
    <label>Límite total de documentos Firestore <select value={maxRecords} disabled={backup.busy} onChange={event => setMaxRecords(Number(event.target.value))}>
      {[100, 500, 2000, 5000].map(value => <option key={value} value={value}>{value}</option>)}
    </select></label>
    <p>Páginas de hasta 200; límite adicional de 16 MiB remotos. Cada descarga consume lecturas de tu cuota Spark. Una colección inaccesible o limitada figura expresamente en el manifiesto.</p>
    <label><input type="checkbox" checked={encrypted} disabled={backup.busy} onChange={event => setEncrypted(event.target.checked)} /> Cifrar archivo (recomendado)</label>
    {!encrypted && <p role="alert">El JSON sin cifrar contiene información personal/comercial; guárdalo en un lugar privado.</p>}
    {encrypted && <div>
      <label>Contraseña (no se guarda) <input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} disabled={backup.busy} /></label>
      <label>Repetir contraseña <input type="password" autoComplete="new-password" value={repeat} onChange={event => setRepeat(event.target.value)} disabled={backup.busy} /></label>
      <p>Si la pierdes, no podremos recuperar el archivo cifrado.</p>
    </div>}
    <label><input type="checkbox" checked={consent} disabled={backup.busy} onChange={event => setConsent(event.target.checked)} /> Autorizo estas lecturas y la descarga de información de este negocio en este equipo.</label>
    <p><button disabled={backup.busy || !valid} onClick={() => void exportData(false)}>Descargar datos Firestore autorizados</button></p>
    <fieldset disabled={backup.busy}>
      <legend>Archivo separado del dispositivo (siempre cifrado)</legend>
      <label><input type="checkbox" checked={pending} onChange={event => setPending(event.target.checked)} /> Consiento exportar mis pendientes cifrados, sin sincronizarlos (hasta 500 ventas/500 cajas inspeccionadas)</label>
      <label><input type="checkbox" checked={photos} onChange={event => setPhotos(event.target.checked)} /> Consiento exportar mis fotos locales (hasta 100, 4 MiB)</label>
      <button disabled={!encrypted || !valid || !pending && !photos} onClick={() => void exportData(true)}>Descargar pendientes/fotos del dispositivo</button>
    </fieldset>
    <fieldset disabled={backup.busy}>
      <legend>Comprobar archivo local / dry-run sin escrituras</legend>
      <input aria-label="Archivo de backup" type="file" accept="application/json,.json" onChange={event => setFile(event.target.files[0] ?? null)} />
      <button disabled={!file} onClick={async () => { try { await backup.verifyFile(file, password); } finally { setPassword(''); setRepeat(''); } }}>Verificar integridad (0 escrituras)</button>
    </fieldset>
    {backup.progress && <p role="status">Leyendo {backup.progress.collection}: {backup.progress.count} documentos.</p>}
    {backup.error && <p role="alert">{backup.error}</p>}
    {backup.result && <div role="status">
      <p>{backup.result.filename ? `Descarga solicitada: ${backup.result.filename}` : 'Integridad local verificada; no se restauró ningún dato.'} Escrituras: 0.</p>
      <p>{backup.result.manifest.partial ? 'EXPORTACIÓN PARCIAL' : 'Alcance declarado leído; consultar exclusiones y advertencias.'}</p>
      <ul>{backup.result.manifest.sections.map(section => <li key={section.name}>{section.name}: {section.count} · {section.status} {section.warning ?? ''}</li>)}</ul>
      <ul>{backup.result.manifest.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
    </div>}
    {backup.busy && <button onClick={backup.cancel}>Cancelar lectura</button>}
    {onClose && <button disabled={backup.busy} onClick={onClose}>Cerrar exportador</button>}
  </section>;
}
