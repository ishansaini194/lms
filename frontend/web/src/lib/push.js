// Web Push subscribe/unsubscribe helper for the student portal.
// Uses the service worker registered in Stage 1 (registerSW.js) and the VAPID
// public key from env. No sending here — this only creates the browser
// subscription and POSTs it to the backend (built in Step 2). Kept in its own
// module so the push lifecycle stays separate from UI/app code.
import { apiFetch } from '@/lib/api';

// Public key only — safe to ship to the browser. Missing → feature stays hidden.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

export function pushSupported() {
  return typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

// True only when both the browser supports push AND a VAPID key is configured.
export function pushConfigured() {
  return pushSupported() && !!VAPID_PUBLIC_KEY;
}

export function notificationPermission() {
  return typeof Notification !== 'undefined' ? Notification.permission : 'denied';
}

// Standard base64url → Uint8Array for applicationServerKey.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// The currently-stored browser subscription, if any (null on unsupported/error).
export async function getExistingSubscription() {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return null;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

// Create (or reuse) the push subscription and persist it on the backend.
// Caller must have already obtained Notification permission via a user gesture.
export async function subscribeToPush() {
  if (!pushSupported()) throw new Error('Notifications aren’t supported on this browser.');
  if (!VAPID_PUBLIC_KEY) throw new Error('Notifications aren’t set up yet.');

  const reg = await navigator.serviceWorker.ready; // SW from Stage 1
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = sub.toJSON();
  await apiFetch('/api/me/push-subscription', {
    method: 'POST',
    body: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
  });
  return sub;
}

// Unsubscribe the browser and remove the row on the backend (best-effort).
export async function unsubscribeFromPush() {
  const sub = await getExistingSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch { /* keep going to clean the server row */ }
  await apiFetch(`/api/me/push-subscription?endpoint=${encodeURIComponent(endpoint)}`, { method: 'DELETE' });
}
