/*
 * The Liam's service worker: shows push alerts from the relay (lineup lock,
 * injuries, waiver results, the Tuesday recap) and opens the app where each
 * one points. It does no caching; the site stays network-first.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { body: event.data ? event.data.text() : '' };
  }
  const base = new URL(self.registration.scope);
  event.waitUntil(
    self.registration.showNotification(msg.title || 'The Liam', {
      body: msg.body || '',
      tag: msg.tag || undefined,
      icon: new URL('icon-192.png', base).href,
      badge: new URL('icon-192.png', base).href,
      data: { url: msg.url || base.href },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.registration.scope) && 'focus' in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
