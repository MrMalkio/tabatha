// Tabby Sidecar — Web Push service worker.
// Receives pushes from the Supabase `send-focus-push` edge function and shows
// the same style of modal/notification the extension would surface.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Tabatha', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Tabatha';
  const options = {
    body: data.body || '',
    icon: data.icon || '/sidecar/favicon.png',
    badge: data.badge || '/sidecar/favicon.png',
    tag: data.tag || 'tabatha-focus',
    data: { url: data.url || '/sidecar', ...(data.data || {}) },
    requireInteraction: !!data.requireInteraction,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/sidecar';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes('/sidecar') && 'focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
