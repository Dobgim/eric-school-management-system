import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { uid } from './utils';
import { disablePush } from './push';

// Client side of the data layer. The server (server/index.js) owns the data: this store loads the slice the
// signed-in user may see, applies changes optimistically, sends them to the API, and reloads whenever another
// device changes something (Server-Sent Events). A copy is cached on the device so the installed app can
// still show the last known data offline.

const COLLECTIONS = [
  'students', 'guardians', 'classes', 'facilities', 'sessions', 'calendarEvents', 'categories', 'feeItems',
  'payments', 'staff', 'salaryScales', 'salaryAdjustments', 'payrollRuns', 'inventory', 'stockMovements', 'sales',
  'academicRecords', 'promotionRecommendations', 'announcements', 'activityLog', 'paymentRequests', 'notifications', 'users',
  'admissionApplications', 'invites',
];
const CACHE_KEY = 'sis:cache:v2';
const CLIENT_ID = uid('client');

const StoreContext = createContext(null);

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('No connection to the server. Check your internet and try again.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  return data;
}

function normalize(data) {
  const d = { ...data };
  for (const c of COLLECTIONS) d[c] ||= [];
  d.settings = { counters: {}, ...(d.settings || {}) };
  d.school ||= {};
  return d;
}

/** Changes between two snapshots, as operations for POST /api/ops. */
function diff(prev, next) {
  const ops = [];
  for (const c of COLLECTIONS) {
    const a = prev[c] || [];
    const b = next[c] || [];
    if (a === b) continue;
    const before = new Map(a.map((x) => [x.id, x]));
    const after = new Set();
    for (const item of b) {
      after.add(item.id);
      const old = before.get(item.id);
      if (!old || (old !== item && JSON.stringify(old) !== JSON.stringify(item))) ops.push({ t: 'put', c, v: item });
    }
    for (const item of a) if (!after.has(item.id)) ops.push({ t: 'del', c, id: item.id });
  }
  for (const k of ['school', 'settings']) {
    if (prev[k] !== next[k] && JSON.stringify(prev[k]) !== JSON.stringify(next[k])) ops.push({ t: 'kv', k, v: next[k] });
  }
  return ops;
}

const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; } };
const writeCache = (user, db) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ user, db, at: new Date().toISOString() })); } catch { /* storage full or blocked */ } };
const clearCache = () => { try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ } };

// Without "Remember me", the offline copy of the data must not outlive the browser session (shared computers):
// a new browser session finds no session marker and drops it. The server cookie ends with the session too.
const REMEMBER_KEY = 'sis:remember';
try {
  if (localStorage.getItem(REMEMBER_KEY) === '0' && !sessionStorage.getItem('sis:open')) clearCache();
  sessionStorage.setItem('sis:open', '1');
} catch { /* storage blocked */ }

// Outbox: things a parent submits while offline (payments to verify, admission applications) are kept on the
// phone and sent automatically when the connection returns. Items are tagged with the user who made them.
const OUTBOX_KEY = 'sis:outbox:v1';
const readOutbox = () => { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY)) || []; } catch { return []; } };
const writeOutbox = (list) => { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(list)); } catch { /* storage full or blocked */ } };

export function StoreProvider({ children }) {
  const [status, setStatus] = useState('loading'); // loading | anon | ready
  const [user, setUser] = useState(null);
  const [db, setDb] = useState(null);
  const [offline, setOffline] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [serverProblem, setServerProblem] = useState('');
  const [cachedAt, setCachedAt] = useState(() => readCache()?.at || null);
  const [outbox, setOutbox] = useState(readOutbox);
  const sendingOutbox = useRef(false);
  const [publicSchool, setPublicSchool] = useState(() => readCache()?.db?.school || { name: 'School Information System', motto: '' });
  const dbRef = useRef(null);
  const userRef = useRef(null);
  const queue = useRef([]);
  const inFlight = useRef(0);
  const stale = useRef(false);
  const flushing = useRef(null);

  const showError = useCallback((msg) => {
    setSaveError(msg);
    setTimeout(() => setSaveError((m) => (m === msg ? '' : m)), 8000);
  }, []);

  const apply = useCallback((data, u) => {
    const d = normalize(data);
    dbRef.current = d;
    setDb(d);
    writeCache(u, d);
    setCachedAt(new Date().toISOString());
  }, []);

  const reload = useCallback(async () => {
    if (!userRef.current) return;
    try {
      const data = await request('/api/data');
      apply(data, userRef.current);
      setOffline(false);
    } catch (e) {
      if (e.status === 401) { userRef.current = null; setUser(null); setStatus('anon'); clearCache(); }
      else if (e.status === 0) setOffline(true);
    }
  }, [apply]);

  // Startup: who is signed in? Fall back to the cached copy when there is no connection.
  useEffect(() => {
    (async () => {
      request('/api/public/school').then((s) => { setPublicSchool(s); setServerProblem(''); }).catch((e) => setServerProblem(
        e.status === 404 ? 'The school server is not running at this address (the API answered 404). Deploy the latest version including the api/ folder, then reload.'
          : e.status === 0 ? '' : e.message,
      ));
      try {
        const { user: u } = await request('/api/auth/me');
        userRef.current = u;
        setUser(u);
        const data = await request('/api/data');
        apply(data, u);
        setStatus('ready');
      } catch (e) {
        const cached = readCache();
        if (e.status === 0 && cached?.user && cached?.db) {
          userRef.current = cached.user;
          setUser(cached.user);
          dbRef.current = normalize(cached.db);
          setDb(dbRef.current);
          setOffline(true);
          setStatus('ready');
        } else {
          setStatus('anon');
        }
      }
    })();
  }, [apply]);

  // Live updates from other devices: a server-sent event stream where the server can hold one open;
  // on serverless hosting (Vercel) the app checks for changes every 10 s and whenever it comes back into view.
  useEffect(() => {
    if (!user) return;
    let stop = () => {};
    let cancelled = false;
    request('/api/health').catch(() => ({ live: true })).then(({ live }) => {
      if (cancelled) return;
      stop = live === false || typeof EventSource === 'undefined' ? poll() : stream();
    });
    // A phone notification just arrived: fetch the new data now rather than at the next check.
    const onPush = (e) => { if (e.data?.type === 'push') reload(); };
    navigator.serviceWorker?.addEventListener('message', onPush);
    return () => { cancelled = true; stop(); navigator.serviceWorker?.removeEventListener('message', onPush); };
  }, [user, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  function poll() {
    const tick = () => { if (document.visibilityState === 'visible' && !inFlight.current) reload(); };
    const id = setInterval(tick, 5000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }

  function stream() {
    const es = new EventSource('/api/events');
    let timer;
    let hadError = false;
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.by === CLIENT_ID) return;
      } catch { return; }
      if (inFlight.current) { stale.current = true; return; }
      clearTimeout(timer);
      timer = setTimeout(reload, 250);
    };
    es.onerror = () => { hadError = true; setOffline(!navigator.onLine); };
    es.onopen = () => { if (hadError) { hadError = false; reload(); } setOffline(false); };
    return () => { clearTimeout(timer); es.close(); };
  }

  const flush = useCallback(() => {
    if (flushing.current) return;
    flushing.current = Promise.resolve().then(async () => {
      while (queue.current.length) {
        const ops = queue.current.splice(0);
        inFlight.current++;
        try {
          await request('/api/ops', { method: 'POST', body: { ops, clientId: CLIENT_ID } });
          if (ops.some((o) => o.c === 'users')) stale.current = true;
        } catch (e) {
          if (e.status === 0) {
            // Offline: keep the changes and send them when the connection returns.
            queue.current.unshift(...ops);
            setOffline(true);
            flushing.current = null; // `finally` below still releases inFlight
            return;
          }
          showError(`Not saved: ${e.message}`);
          queue.current = [];
          stale.current = true;
        } finally {
          inFlight.current--;
        }
      }
      flushing.current = null;
      if (stale.current) { stale.current = false; reload(); }
    });
  }, [reload, showError]);

  // Send what the parent saved while offline (oldest first). Stops at the first network failure.
  const flushOutbox = useCallback(async () => {
    const u = userRef.current;
    if (!u || sendingOutbox.current) return;
    sendingOutbox.current = true;
    let sent = 0;
    try {
      for (const item of readOutbox().filter((i) => i.userId === u.id)) {
        try {
          await request(item.path, { method: 'POST', body: item.body });
          sent++;
        } catch (e) {
          if (e.status === 0) break;
          showError(`Couldn’t send “${item.label}”: ${e.message}`);
        }
        const rest = readOutbox().filter((i) => i.id !== item.id);
        writeOutbox(rest);
        setOutbox(rest);
      }
    } finally {
      sendingOutbox.current = false;
    }
    if (sent) reload();
  }, [reload, showError]);

  // Follow the phone's connection: catch up and send waiting items as soon as it is back.
  useEffect(() => {
    if (!user) return;
    const online = () => { setOffline(false); reload(); flush(); flushOutbox(); };
    const offlineNow = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offlineNow);
    if (navigator.onLine) flushOutbox();
    else setOffline(true);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offlineNow); };
  }, [user, reload, flush, flushOutbox]);

  const mutate = useCallback((fn) => {
    const prev = dbRef.current;
    if (!prev) return;
    const next = fn(structuredClone(prev)) || prev;
    const ops = diff(prev, next);
    if (!ops.length) return;
    dbRef.current = next;
    setDb(next);
    queue.current.push(...ops);
    flush();
  }, [flush]);

  const api = useMemo(() => ({
    add(coll, obj) {
      const item = { id: uid(), ...obj };
      mutate((d) => { d[coll].push(item); return d; });
      return item;
    },
    update(coll, id, patch) {
      mutate((d) => {
        const i = d[coll].findIndex((x) => x.id === id);
        if (i >= 0) d[coll][i] = { ...d[coll][i], ...(typeof patch === 'function' ? patch(d[coll][i]) : patch) };
        return d;
      });
    },
    remove(coll, id) {
      mutate((d) => { d[coll] = d[coll].filter((x) => x.id !== id); return d; });
    },
    setSchool(patch) {
      mutate((d) => { d.school = { ...d.school, ...patch }; return d; });
    },
    setSettings(patch) {
      mutate((d) => { d.settings = { ...d.settings, ...patch }; return d; });
    },
    /** Reserve the next registration/receipt/sale… number from the server (never duplicated across devices). */
    async nextCounter(name) {
      const { value } = await request(`/api/counters/${name}`, { method: 'POST' });
      return value;
    },
    /** In-app notification for everyone in `roles` and/or specific `userIds`. */
    notify({ roles = [], userIds = [], title, body = '', link = '', kind = 'info' }) {
      const n = { id: uid('nt'), roles, userIds, title, body, link, kind, createdAt: new Date().toISOString(), readBy: [] };
      mutate((d) => { d.notifications.unshift(n); return d; });
      return n;
    },
    markRead(ids, readerId) {
      mutate((d) => {
        d.notifications = d.notifications.map((n) => (ids.includes(n.id) && !n.readBy.includes(readerId) ? { ...n, readBy: [...n.readBy, readerId] } : n));
        return d;
      });
    },
    log(action, details = '') {
      mutate((d) => { d.activityLog.unshift({ id: uid('lg'), userId: userRef.current?.id, action, details, at: new Date().toISOString() }); return d; });
    },
    /**
     * POST something the user submits (e.g. a payment to verify). Offline, it is kept on the device and sent
     * automatically later: resolves { queued: true } instead of failing.
     */
    async submit(path, body, label) {
      try {
        return { sent: true, res: await request(path, { method: 'POST', body }) };
      } catch (e) {
        if (e.status !== 0) throw e;
        const item = { id: uid('ob'), userId: userRef.current?.id, path, body, label, createdAt: new Date().toISOString() };
        const list = [...readOutbox(), item];
        writeOutbox(list);
        setOutbox(list);
        setOffline(true);
        return { queued: true };
      }
    },
    mutate,
    reload,
    request,
  }), [mutate, reload]);

  // Start using the app as `u` once the server has set the session cookie (after login or a verified sign-up).
  const enter = useCallback(async (u) => {
    userRef.current = u;
    const data = await request('/api/data');
    apply(data, u);
    setUser(u);
    setOffline(false);
    setStatus('ready');
  }, [apply]);

  const login = useCallback(async (username, password, portal, remember = true) => {
    try {
      const { user: u } = await request('/api/auth/login', { method: 'POST', body: { username, password, portal, remember } });
      try { localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0'); } catch { /* storage blocked */ }
      await enter(u);
      return { user: u };
    } catch (e) {
      return { error: e.message };
    }
  }, [enter]);

  const logout = useCallback(async () => {
    await disablePush();
    try { await request('/api/auth/logout', { method: 'POST' }); } catch { /* offline: still clear locally */ }
    clearCache();
    userRef.current = null;
    dbRef.current = null;
    setUser(null);
    setDb(null);
    setStatus('anon');
  }, []);

  const school = db?.school || publicSchool;
  const value = useMemo(() => ({ db, user, api, login, logout, enter, saveError, offline, status, school, serverProblem, cachedAt, outbox: outbox.filter((i) => i.userId === user?.id) }), [db, user, api, login, logout, enter, saveError, offline, status, school, serverProblem, cachedAt, outbox]);

  if (status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center text-slate-500">
        <div className="flex items-center gap-3"><span className="size-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /> Loading…</div>
      </div>
    );
  }
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);
