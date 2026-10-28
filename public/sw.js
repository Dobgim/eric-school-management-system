// Service worker: makes the app installable and lets it open without internet.
// Bump VERSION when this file's caching rules change; new builds are picked up automatically.
const VERSION = 'v7';
const SHELL = `sis-shell-${VERSION}`;
const ASSETS = `sis-assets-${VERSION}`;
const FONTS = `sis-fonts-${VERSION}`;
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([
    caches.open(SHELL).then((c) => c.addAll(PRECACHE)),
    precacheBuild().catch(() => {}), // best effort: the app still works online if this fails
  ]));
});

// Store every built file the app needs (entry scripts, styles and the chunks they load later, such as the
// PDF generator) on the first visit, so the app opens and works offline even if the parent visited only once.
async function precacheBuild() {
  const cache = await caches.open(ASSETS);
  const html = await (await fetch('/index.html', { cache: 'no-store' })).text();
  const queue = [...html.matchAll(/\/assets\/[\w.-]+\.(?:js|css)/g)].map((m) => m[0]);
  const seen = new Set();
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const res = await fetch(url);
    if (!res.ok) continue;
    await cache.put(url, res.clone());
    if (url.endsWith('.js')) {
      // Vite names chunks "name-<8 char hash>.js" and imports them relative to /assets/.
      const code = await res.text();
      for (const m of code.matchAll(/["'`](?:\.\/|\/?assets\/)?([\w.]+-[\w-]{8}\.(?:js|css))["'`]/g)) queue.push(`/assets/${m[1]}`);
    }
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL, ASSETS, FONTS];
    for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

// The page asks the waiting worker to take over when the user taps "Update".
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Live data always comes from the server (the app keeps its own offline copy).
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // Pages: network first so updates arrive, cached app shell when offline (SPA routes all use index.html).
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(request);
        const cache = await caches.open(SHELL);
        cache.put('/index.html', res.clone());
        return res;
      } catch {
        return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  // Built JS/CSS have content hashes in their names, so a cached copy never goes stale.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  // Google Fonts: serve cached, refresh in the background.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONTS));
    return;
  }

  // Other same-origin files (icons, manifest): cached copy first, refreshed in the background.
  if (url.origin === self.location.origin) event.respondWith(staleWhileRevalidate(request, SHELL));
});

async function cacheFirst(request, name) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) (await caches.open(name)).put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  const network = fetch(request).then((res) => {
    if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
    return res;
  }).catch(() => hit);
  return hit || network;
}

// Phone notifications sent by the school server (announcements, payments, messages).
self.addEventListener('push', (event) => {
  let n = {};
  try { n = event.data ? event.data.json() : {}; } catch { n = { title: event.data?.text() }; }
  event.waitUntil((async () => {
    if (typeof n.badge === 'number' && self.navigator.setAppBadge) {
      try { await (n.badge ? self.navigator.setAppBadge(n.badge) : self.navigator.clearAppBadge()); } catch { /* not supported */ }
    }
    // An open app refreshes its data at once, so the message is on the bell immediately.
    for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) c.postMessage({ type: 'push' });
    await self.registration.showNotification(n.title || 'School', {
      body: n.body || '', tag: n.tag, renotify: true, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
      vibrate: [120, 60, 120], data: { url: n.url || '/' },
    });
  })());
});

// Tapping the notification opens the app on the right page (or focuses it if it is already open).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
    if (win) { await win.focus(); return win.navigate(url).catch(() => {}); }
    return self.clients.openWindow(url);
  })());
});
