export function downloadBackup(text, businessId, encrypted) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `migapos-${String(businessId).replace(/[^a-z0-9_-]/gi, '_').slice(0, 80)}-${Date.now()}${encrypted ? '.encrypted' : ''}.json`;
  document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return link.download;
}
