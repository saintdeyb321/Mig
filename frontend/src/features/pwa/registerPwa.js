let registration;

export function registerPwa() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return null;
  registration ??= navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(error => {
    registration = undefined;
    throw error;
  });
  return registration;
}
