// Registers the service worker that backs PWA install + (later) Web Push.
// Guarded so it silently no-ops on browsers without SW support, and registers
// after `load` so it never competes with first paint. Kept in its own module so
// the SW lifecycle stays separate from app/router code and is easy to debug.
//
// Stage 1: registration only. Subscription/permission flows come in Stage 2.
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // Non-fatal — the app works fine without the SW (just no install/push).
      console.warn('[sw] registration failed:', err);
    });
  });
}
