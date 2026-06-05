/* StudyMe service worker — Web Push Stage 1 (PWA foundation).
 *
 * CACHING: none. There is a `fetch` listener purely so the app meets install
 * heuristics, but it never calls respondWith — every request goes to the network
 * as usual. This is deliberate: it guarantees that deploy.sh rebuilds always
 * reach users (no stale app shell served from an SW cache). Offline support is
 * out of scope for this stage.
 *
 * PUSH: the `push` / `notificationclick` handlers below are ready for Stage 3,
 * but nothing drives them yet (no subscriptions, no VAPID keys until Stage 2/3).
 */

self.addEventListener('install', () => {
  // Take over immediately rather than waiting for old tabs to close, so a newly
  // deployed SW activates on the next load.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// No-op passthrough — registered for installability, intentionally NOT caching.
self.addEventListener('fetch', () => { /* default network handling */ });

// ── Push notifications (wired up in Stage 3) ────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (_) { data = { body: event.data && event.data.text() }; }

  const title = data.title || 'StudyMe';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/student' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/student';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) { c.navigate(url); return c.focus(); }
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
    })
  );
});
