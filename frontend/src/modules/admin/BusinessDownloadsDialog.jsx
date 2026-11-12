import { Download } from 'lucide-react';
import BackupPanel from '../../features/backups/components/BackupPanel.jsx';
import { Dialog } from '../../shared/ui';

export function BusinessDownloadsDialog({ user, license, onClose }) {
  return <Dialog title="Descargar datos" description={license.businessName} icon={Download} onClose={onClose} className="max-w-2xl">
    <BackupPanel user={user} businessId={license.id} businessName={license.businessName} />
  </Dialog>;
}
