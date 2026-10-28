// Phone notifications (Web Push): ask permission, register this phone with the school server,
// and forget it again on sign-out so the next person using the phone doesn't get someone else's alerts.
import { request } from './store';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

/** 'ios-install' (iPhone: add to Home Screen first) | 'unsupported' | 'denied' | 'off' | 'on' */
export async function pushState() {
  if (isIOS() && !standalone()) return 'ios-install';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

const toKey = (b64) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Ask for permission (must follow a tap) and register this phone. Returns the new state. */
export async function enablePush() {
  if (!supported()) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  await syncPush();
  return 'on';
}

/**
 * Make sure the server knows this phone (after sign-in, or if the browser renewed the subscription).
 * Calls made at the same time share one run: two parallel subscribe() calls make the browser abort one of them.
 */
let syncing = null;
export function syncPush() {
  syncing ||= doSync().finally(() => { syncing = null; });
  return syncing;
}

async function doSync() {
  if (!supported() || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.ready;
  const { key } = await request('/api/push/key');
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with other server keys can never receive messages: replace it.
  const current = sub?.options?.applicationServerKey;
  if (sub && current && btoa(String.fromCharCode(...new Uint8Array(current))) !== btoa(String.fromCharCode(...toKey(key)))) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) });
  await request('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
}

export async function disablePush() {
  if (!supported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await request('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  } catch { /* best effort */ }
}

/** Number on the installed app's icon, like messaging apps. */
export function setIconBadge(n) {
  try {
    if (n > 0) navigator.setAppBadge?.(n);
    else navigator.clearAppBadge?.();
  } catch { /* not supported */ }
}
