self.addEventListener('message', event => {
  // Older MigaPOS tabs had a timer that sent this message unconditionally.
  if (event.data?.type === 'SKIP_WAITING') {
    event.stopImmediatePropagation();
    return;
  }
  const reply = event.ports[0];
  if (event.data?.type !== 'MIGAPOS_ACTIVATE_UPDATE' || !reply) return;
  event.waitUntil((async () => {
    const windows = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .filter(client => client.url.startsWith(self.registration.scope));
    const only = windows[0];
    if (windows.length !== 1 || only.id !== event.source?.id || only.visibilityState !== 'visible') {
      reply.postMessage(false);
      return;
    }
    await self.skipWaiting();
    reply.postMessage(true);
  })().catch(() => reply.postMessage({ error: true })));
});
