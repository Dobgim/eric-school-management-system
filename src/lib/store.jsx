import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { uid } from './utils';

// Client side of the data layer. The server (server/index.js) owns the data: this store loads the slice the
// signed-in user may see, applies changes optimistically, sends them to the API, and reloads whenever another
// device changes something (Server-Sent Events). A copy is cached on the device so the installed app can
// still show the last known data offline.

const COLLECTIONS = [
  'students', 'guardians', 'classes', 'facilities', 'sessions', 'calendarEvents', 'categories', 'feeItems',
  'payments', 'staff', 'salaryScales', 'salaryAdjustments', 'payrollRuns', 'inventory', 'stockMovements', 'sales',
  'academicRecords', 'promotionRecommendations', 'announcements', 'activityLog', 'paymentRequests', 'notifications', 'users',
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

export function StoreProvider({ children }) {
  const [status, setStatus] = useState('loading'); // loading | anon | ready
  const [user, setUser] = useState(null);
  const [db, setDb] = useState(null);
  const [offline, setOffline] = useState(false);
  const [saveError, setSaveError] = useState('');
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
      request('/api/public/school').then(setPublicSchool).catch(() => {});
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

  // Live updates from other devices.
  useEffect(() => {
    if (!user || typeof EventSource === 'undefined') return;
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
  }, [user, reload]);

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
          showError(e.status === 0 ? 'Not saved — you are offline. Reconnect and try again.' : `Not saved: ${e.message}`);
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
    mutate,
    reload,
    request,
  }), [mutate, reload]);

  const login = useCallback(async (username, password, portal) => {
    try {
      const { user: u } = await request('/api/auth/login', { method: 'POST', body: { username, password, portal } });
      userRef.current = u;
      const data = await request('/api/data');
      apply(data, u);
      setUser(u);
      setOffline(false);
      setStatus('ready');
      return { user: u };
    } catch (e) {
      return { error: e.message };
    }
  }, [apply]);

  const logout = useCallback(async () => {
    try { await request('/api/auth/logout', { method: 'POST' }); } catch { /* offline: still clear locally */ }
    clearCache();
    userRef.current = null;
    dbRef.current = null;
    setUser(null);
    setDb(null);
    setStatus('anon');
  }, []);

  const school = db?.school || publicSchool;
  const value = useMemo(() => ({ db, user, api, login, logout, saveError, offline, status, school }), [db, user, api, login, logout, saveError, offline, status, school]);

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
