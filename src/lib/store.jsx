import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_MOMO, buildSeed } from './seed';
import { hashPassword, uid } from './utils';

// All data lives in one JSON document. Swapping this module for an API client is the
// only change needed to move to a real backend.
const KEY = 'sis:data:v1';
const SESSION_KEY = 'sis:session:v1';

const StoreContext = createContext(null);

// Bring data saved by an older version up to the current shape.
export function migrate(data) {
  if (!data) return data;
  data.paymentRequests ||= [];
  data.settings.momo ||= { ...DEFAULT_MOMO };
  data.settings.counters.request ||= 0;
  return data;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function StoreProvider({ children }) {
  const [db, setDb] = useState(load);
  const [userId, setUserId] = useState(() => {
    try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
  });
  const [saveError, setSaveError] = useState('');
  const dbRef = useRef(db);
  dbRef.current = db;

  useEffect(() => {
    if (!db) buildSeed().then(setDb);
  }, [db]);

  useEffect(() => {
    if (!db) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      setSaveError('');
    } catch {
      setSaveError('Storage is full — remove large uploaded documents or photos so changes can be saved.');
    }
  }, [db]);

  const user = db && userId ? db.users.find((u) => u.id === userId && u.active) : null;

  const mutate = useCallback((fn) => setDb((prev) => fn(structuredClone(prev)) || prev), []);

  const log = useCallback(
    (action, details = '') =>
      mutate((d) => {
        d.activityLog.unshift({ id: uid('lg'), userId: userId || null, action, details, at: new Date().toISOString() });
        d.activityLog = d.activityLog.slice(0, 1000);
        return d;
      }),
    [mutate, userId],
  );

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
    // Reserve the next value of a named counter (reg numbers, receipts, sales...).
    nextCounter(name) {
      const next = (dbRef.current.settings.counters[name] || 0) + 1;
      dbRef.current = { ...dbRef.current, settings: { ...dbRef.current.settings, counters: { ...dbRef.current.settings.counters, [name]: next } } };
      mutate((d) => { d.settings.counters[name] = Math.max(d.settings.counters[name] || 0, next); return d; });
      return next;
    },
    mutate,
    log,
  }), [mutate, log]);

  const login = useCallback(async (username, password, portal) => {
    const d = dbRef.current;
    const u = d.users.find((x) => x.username.toLowerCase() === username.trim().toLowerCase());
    if (!u || u.passwordHash !== (await hashPassword(password))) return { error: 'Incorrect username or password.' };
    if (!u.active) return { error: 'This account has been deactivated. Contact the administrator.' };
    if (portal === 'parent' && u.role !== 'parent') return { error: 'This is a staff account — use the Staff tab.' };
    if (portal === 'staff' && u.role === 'parent') return { error: 'This is a parent account — use the Parents tab.' };
    try { sessionStorage.setItem(SESSION_KEY, u.id); } catch { /* private mode */ }
    setUserId(u.id);
    mutate((x) => {
      x.activityLog.unshift({ id: uid('lg'), userId: u.id, action: 'Signed in', details: '', at: new Date().toISOString() });
      x.users = x.users.map((y) => (y.id === u.id ? { ...y, lastLogin: new Date().toISOString() } : y));
      return x;
    });
    return { user: u };
  }, [mutate]);

  const logout = useCallback(() => {
    if (userId) log('Signed out');
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    setUserId(null);
  }, [log, userId]);

  const resetDemo = useCallback(async () => {
    const fresh = await buildSeed();
    setDb(fresh);
  }, []);

  const value = useMemo(() => ({ db, user, api, login, logout, resetDemo, saveError }), [db, user, api, login, logout, resetDemo, saveError]);

  if (!db) {
    return (
      <div className="grid min-h-screen place-items-center text-slate-500">
        <div className="flex items-center gap-3"><span className="size-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /> Preparing school data…</div>
      </div>
    );
  }
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);
