import { memo } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { Badge } from '../shared/ui';
const NetworkBadge=memo(()=>{
  const isOnline=useNetworkStatus();
  const Icon=isOnline?Wifi:WifiOff;
  return <Badge variant={isOnline?'success':'warning'} title={isOnline?'Con conexión':'Sin conexión: una operación local puede quedar pendiente'} className="shrink-0 text-[10px]" role="status"><Icon aria-hidden="true" className="size-3" /><span className="hidden xs:inline">{isOnline?'En línea':'Sin conexión'}</span></Badge>;
});
export default NetworkBadge;
