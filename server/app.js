// School Information System API (Express). Used by server/index.js locally and by api/index.js on Vercel.
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import { clearFailures, clearSessionCookie, hashPassword, loginBlocked, recordFailure, requireUser, setSessionCookie, toClientUser, verifyPassword } from './auth.js';
import { COUNTER_ACCESS, Forbidden, applyOps, loadAll, newId, nextCounter, viewFor } from './data.js';
import { db } from './db.js';
import { momoMode, normalizePhone } from './momo.js';
import { paymentRoutes } from './payments.js';
import { flushPush, removeSubscription, saveSubscription, vapidKeys } from './push.js';
import { ensureSetup } from './setup.js';
import { signupRoutes } from './signup.js';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, '..', 'dist');
// On Vercel the API runs as short-lived serverless functions: no open live-update streams, and the
// built web app is served by Vercel itself.
export const SERVERLESS = !!process.env.VERCEL;

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' })); // uploaded documents and photos travel as data URLs
app.use(cookieParser());

// Connect to the database and create the clean starting data once per process (cold start on Vercel).
let ready;
export const init = () => (ready ||= (async () => { await db(); await ensureSetup(); })().catch((e) => { ready = null; throw e; }));
app.use('/api', (req, res, next) => init().then(() => next(), next));

// After anything that may have created notifications, push them to people's phones before answering
// (serverless functions stop as soon as the response is sent).
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/payments/online/')) return next();
  const json = res.json.bind(res);
  res.json = (body) => {
    db().then((conn) => flushPush(conn.query)).catch((e) => console.error('push:', e.message)).finally(() => json(body));
    return res;
  };
  next();
});

// Activity-log entry written directly by the server (login, failed online payment).
const logEntry = (q, userId, action, details = '') => {
  const entry = { id: newId('lg'), userId, action, details, at: new Date().toISOString() };
  return q(`insert into records (collection, id, data, updated_by) values ('activityLog', $1, $2::jsonb, $3)`, [entry.id, JSON.stringify(entry), userId]);
};

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---- Live updates (Server-Sent Events): every signed-in device hears about changes and reloads its data.
const streams = new Set();
function broadcast(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const s of streams) s.res.write(line);
}
setInterval(() => { for (const s of streams) s.res.write(': ping\n\n'); }, 25000).unref();

app.get('/api/health', wrap(async (req, res) => {
  const conn = await db();
  await conn.query('select 1');
  res.json({ ok: true, database: conn.kind, momo: momoMode(), live: !SERVERLESS });
}));

// Branding for the sign-in page (no private data).
app.get('/api/public/school', wrap(async (req, res) => {
  const conn = await db();
  const { rows } = await conn.query("select value from kv where key = 'school'");
  const { name, shortName, motto, logo, address, region, phone } = rows[0]?.value || {};
  res.json({ name, shortName, motto, logo, address, region, phone });
}));

// ---- Auth
app.post('/api/auth/login', wrap(async (req, res) => {
  const { username = '', password = '', portal } = req.body || {};
  const key = `${req.ip}|${String(username).toLowerCase()}`;
  if (loginBlocked(key)) return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes and try again.' });
  const conn = await db();
  // Sign in with username, email, or (parents) the phone number written any way: "677 12 34 56", "+237677123456".
  const id = String(username).trim();
  const phone = normalizePhone(id).replace(/\D/g, '');
  const byPhone = /^\d{9}$/.test(phone) ? phone : '';
  // Parent accounts made by the office may have another username; their phone is on the guardian record.
  const guardianIds = [];
  if (byPhone) {
    const { rows: gs } = await conn.query(`select id, data->>'phone' as phone, data->>'altPhone' as alt from records where collection = 'guardians'`);
    for (const g of gs) if ([g.phone, g.alt].some((p) => p && normalizePhone(p).replace(/\D/g, '') === byPhone)) guardianIds.push(g.id);
  }
  const { rows } = await conn.query(
    `select * from users
      where lower(username) = lower($1)
         or (email is not null and lower(email) = lower($1))
         or ($2 <> '' and (username = $2 or phone = $2))
         or (role = 'parent' and guardian_id = any($3))`,
    [id, byPhone, guardianIds],
  );
  let row = null;
  for (const r of rows) if (await verifyPassword(password, r.password_hash)) { row = r; break; }
  if (!row) {
    recordFailure(key);
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  if (row.status === 'pending') return res.status(403).json({ error: 'Your account is waiting for approval by the school. You can sign in once it is approved.' });
  if (row.status === 'rejected') return res.status(403).json({ error: `Your sign-up was not approved${row.review_note ? `: ${row.review_note}` : '.'} Please contact the school office.` });
  if (!row.active) return res.status(403).json({ error: 'This account has been deactivated. Contact the administrator.' });
  if (portal === 'parent' && row.role !== 'parent') return res.status(403).json({ error: 'This is a staff account — use the Staff tab.' });
  if (portal === 'staff' && row.role === 'parent') return res.status(403).json({ error: 'This is a parent account — use the Parents tab.' });
  clearFailures(key);
  await conn.query('update users set last_login = now() where id = $1', [row.id]);
  await logEntry(conn.query, row.id, 'Signed in');
  setSessionCookie(req, res, row);
  res.json({ user: toClientUser({ ...row, last_login: new Date() }) });
}));

app.post('/api/auth/logout', (req, res) => { clearSessionCookie(res); res.json({ ok: true }); });

app.get('/api/auth/me', requireUser, (req, res) => res.json({ user: req.user }));

// Add or change the email you can sign in with.
app.post('/api/auth/email', requireUser, wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const conn = await db();
  if (email) {
    const { rows } = await conn.query('select id from users where lower(email) = $1 and id <> $2', [email, req.user.id]);
    if (rows.length) return res.status(400).json({ error: 'That email is already used by another account.' });
  }
  await conn.query('update users set email = $2 where id = $1', [req.user.id, email || null]);
  res.json({ ok: true, email });
}));

app.post('/api/auth/password', requireUser, wrap(async (req, res) => {
  const { current = '', next = '' } = req.body || {};
  const conn = await db();
  const { rows } = await conn.query('select password_hash from users where id = $1', [req.user.id]);
  if (!(await verifyPassword(current, rows[0].password_hash))) return res.status(400).json({ error: 'Current password is wrong.' });
  if (String(next).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  await conn.query('update users set password_hash = $2 where id = $1', [req.user.id, await hashPassword(next)]);
  res.json({ ok: true });
}));

// ---- Data
app.get('/api/data', requireUser, wrap(async (req, res) => {
  const conn = await db();
  res.set('Cache-Control', 'no-store');
  res.json(viewFor(req.user, await loadAll(conn.query)));
}));

app.post('/api/ops', requireUser, wrap(async (req, res) => {
  const conn = await db();
  const { changed } = await conn.tx((q) => applyOps(q, req.user, req.body?.ops));
  if (changed.size) broadcast({ type: 'change', by: req.body?.clientId || null, collections: [...changed] });
  res.json({ ok: true, changed: [...changed] });
}));

app.post('/api/counters/:name', requireUser, wrap(async (req, res) => {
  if (!(COUNTER_ACCESS[req.user.role] || []).includes(req.params.name)) throw new Forbidden('Not allowed.');
  const conn = await db();
  res.json({ value: await nextCounter(conn.query, req.params.name) });
}));

app.get('/api/events', requireUser, (req, res) => {
  // Serverless functions can't hold a stream open; 204 tells the browser not to retry (it polls instead).
  if (SERVERLESS) return res.status(204).end();
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  const s = { res, userId: req.user.id };
  streams.add(s);
  req.on('close', () => streams.delete(s));
});

// ---- Phone notifications: the browser registers here after the user allows notifications.
app.get('/api/push/key', requireUser, wrap(async (req, res) => {
  const conn = await db();
  res.json({ key: (await vapidKeys(conn.query)).publicKey });
}));
app.post('/api/push/subscribe', requireUser, wrap(async (req, res) => {
  const conn = await db();
  if (!(await saveSubscription(conn.query, req.user.id, req.body?.subscription))) return res.status(400).json({ error: 'Invalid subscription.' });
  res.json({ ok: true });
}));
// Allowed without a session: called while signing out, so the next person on this phone doesn't get these alerts.
app.post('/api/push/unsubscribe', wrap(async (req, res) => {
  const conn = await db();
  await removeSubscription(conn.query, req.body?.endpoint);
  res.json({ ok: true });
}));

paymentRoutes(app, wrap, broadcast);
signupRoutes(app, wrap, requireUser, broadcast);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ---- Web app (production build), when this server also hosts the pages
if (!SERVERLESS && existsSync(DIST)) {
  app.use('/assets', express.static(join(DIST, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(DIST, { index: false, setHeaders: (res, path) => { if (path.endsWith('sw.js')) res.set('Cache-Control', 'no-cache'); } }));
  app.get('*', (req, res) => res.sendFile(join(DIST, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 && !err.expose ? 'Something went wrong on the server. Please try again.' : err.message });
});

export default app;
