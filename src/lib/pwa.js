import { useSyncExternalStore } from 'react';

// Installable-app state shared by the install prompts and the update banner.
let state = {
  deferredPrompt: null, // Chrome/Edge/Android: the saved `beforeinstallprompt` event
  installed: false,
  updateReady: false,
};
const listeners = new Set();
const set = (patch) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

// iPhone/iPad Safari has no install prompt — users add it from the Share menu.
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let waitingWorker = null;

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    set({ deferredPrompt: e });
  });
  window.addEventListener('appinstalled', () => set({ deferredPrompt: null, installed: true }));

  // The service worker is only registered in production builds; in dev it would fight Vite's hot reload.
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const track = (worker) => {
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorker = worker;
            set({ updateReady: true });
          }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) { waitingWorker = reg.waiting; set({ updateReady: true }); }
      reg.addEventListener('updatefound', () => reg.installing && track(reg.installing));
      // Check for a new version whenever the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update());
    } catch { /* offline first load or unsupported — the app still works as a website */ }
  });
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

export async function promptInstall() {
  const e = state.deferredPrompt;
  if (!e) return false;
  e.prompt();
  const { outcome } = await e.userChoice;
  set({ deferredPrompt: null, installed: outcome === 'accepted' });
  return outcome === 'accepted';
}

export const applyUpdate = () => waitingWorker?.postMessage('SKIP_WAITING');

export function usePwa() {
  const s = useSyncExternalStore(subscribe, () => state);
  const standalone = isStandalone();
  return {
    standalone,
    canPrompt: !!s.deferredPrompt,
    ios: isIOS(),
    installed: s.installed || standalone,
    updateReady: s.updateReady,
  };
}
