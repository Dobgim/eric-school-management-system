// School Information System API (Express). Used by server/index.js locally and by api/index.js on Vercel.
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import { clearFailures, clearSessionCookie, hashPassword, loginBlocked, recordFailure, requireUser, setSessionCookie, toClientUser, verifyPassword } from './auth.js';
import { COLLECTIONS, COUNTER_ACCESS, Forbidden, applyOps, loadAll, newId, nextCounter, viewFor } from './data.js';
import { db } from './db.js';
import { momoMode, normalizePhone } from './momo.js';
import { paymentRoutes } from './payments.js';
import { flushSms, sendSms, smsConfig } from './sms.js';
import { setSecret } from './secrets.js';
import { flushPush, pushStats, removeSubscription, saveSubscription, sendTest, vapidKeys } from './push.js';
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
// Uploaded documents and photos travel as data URLs; a restored backup can be larger still.
const jsonSmall = express.json({ limit: '12mb' });
const jsonLarge = express.json({ limit: '80mb' });
app.use((req, res, next) => (req.path === '/api/backup/restore' ? jsonLarge : jsonSmall)(req, res, next));
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
    // The answer says how many phones were reached, so the office can see that a message went out.
    // Texts go out in the same pass for parents who get SMS.
    const isObj = body && typeof body === 'object' && !Array.isArray(body);
    db().then(async (conn) => {
      const [push, sms] = await Promise.all([
        flushPush(conn.query, `${req.protocol}://${req.get('host')}`).catch((e) => console.error('push:', e.message)),
        flushSms(conn.query).catch((e) => console.error('sms:', e.message)),
      ]);
      if (isObj && push) body.push = push;
      if (isObj && sms) body.sms = sms;
    }).finally(() => json(body));
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
  const { username = '', password = '', portal, remember = true } = req.body || {};
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
  setSessionCookie(req, res, row, { remember: remember !== false });
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

// Full copy of the school's data for safekeeping (super admin). Passwords and payment keys are never included.
app.get('/api/backup', requireUser, wrap(async (req, res) => {
  if (req.user.role !== 'superadmin') throw new Forbidden('Only the super admin can download a backup.');
  const conn = await db();
  const data = await loadAll(conn.query);
  const stamp = new Date().toISOString().slice(0, 10);
  const name = String(data.school?.shortName || data.school?.name || 'school').replace(/[^\w-]+/g, '-').slice(0, 40);
  res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${name}-backup-${stamp}.json"`, 'Cache-Control': 'no-store' });
  res.send(JSON.stringify({ app: 'School Information System', exportedAt: new Date().toISOString(), exportedBy: req.user.name, data }, null, 1));
  await logEntry(conn.query, req.user.id, 'Downloaded full backup');
}));

// Put back a backup file (super admin). School data is replaced; sign-in accounts are left as they are.
app.post('/api/backup/restore', requireUser, wrap(async (req, res) => {
  if (req.user.role !== 'superadmin') throw new Forbidden('Only the super admin can restore a backup.');
  const { backup, confirm } = req.body || {};
  if (confirm !== 'RESTORE') return res.status(400).json({ error: 'Type RESTORE to confirm.' });
  const data = backup?.data;
  if (backup?.app !== 'School Information System' || !data || !Array.isArray(data.students) || !data.school) return res.status(400).json({ error: 'This is not a backup file from this app.' });
  const conn = await db();
  const counts = {};
  await conn.tx(async (q) => {
    await q('delete from records');
    for (const c of COLLECTIONS) {
      const list = Array.isArray(data[c]) ? data[c].filter((r) => r && typeof r.id === 'string') : [];
      counts[c] = list.length;
      for (const r of list) {
        // Restored messages were already delivered once: never push or text them again.
        const v = c === 'notifications' ? { ...r, pushed: true, smsSent: true } : r;
        await q('insert into records (collection, id, data, updated_by) values ($1, $2, $3::jsonb, $4)', [c, r.id, JSON.stringify(v), req.user.id]);
      }
    }
    const { counters = {}, ...settings } = data.settings || {};
    for (const [k, v] of [['school', data.school], ['settings', settings]]) {
      await q(`insert into kv (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()`, [k, JSON.stringify(v)]);
    }
    for (const [name, value] of Object.entries(counters)) {
      if (Number.isInteger(value)) await q('insert into counters (name, value) values ($1, $2) on conflict (name) do update set value = greatest(counters.value, excluded.value)', [name, value]);
    }
  });
  await logEntry(conn.query, req.user.id, 'Restored a backup', `From ${backup.exportedAt || 'unknown date'}: ${counts.students} pupils, ${counts.payments} payments`);
  broadcast({ type: 'change', by: null, collections: [...COLLECTIONS, 'school', 'settings'] });
  res.json({ ok: true, counts });
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
// ---- SMS provider (super admin). Keys are stored encrypted; settings.sms holds the non-secret choices.
const SMS_KINDS = ['absence', 'personal', 'payment', 'announcement'];
app.get('/api/sms/config', requireUser, wrap(async (req, res) => {
  if (req.user.role !== 'superadmin') throw new Forbidden('Only the super admin manages SMS.');
  const conn = await db();
  const cfg = await smsConfig(conn.query);
  res.json({ provider: cfg?.provider || '', sender: cfg?.sender || '', username: cfg?.username || '', accountSid: cfg?.accountSid ? `${cfg.accountSid.slice(0, 6)}…` : '', url: cfg?.url ? cfg.url.replace(/(pass(word)?|key|token|secret)=[^&]*/gi, '$1=•••') : '', configured: !!cfg?.provider });
}));
app.post('/api/sms/config', requireUser, wrap(async (req, res) => {
  if (req.user.role !== 'superadmin') throw new Forbidden('Only the super admin manages SMS.');
  const b = req.body || {};
  const conn = await db();
  if (b.remove) {
    await setSecret(conn.query, 'sms', null);
  } else if (b.provider) {
    const cfg = { provider: b.provider, sender: String(b.sender || '').trim().slice(0, 11) };
    if (b.provider === 'twilio') Object.assign(cfg, { accountSid: String(b.accountSid || '').trim(), authToken: String(b.authToken || '').trim() });
    else if (b.provider === 'africastalking') Object.assign(cfg, { username: String(b.username || '').trim(), apiKey: String(b.apiKey || '').trim() });
    else if (b.provider === 'custom') Object.assign(cfg, { url: String(b.url || '').trim() });
    else return res.status(400).json({ error: 'Choose an SMS provider.' });
    const missing = b.provider === 'twilio' ? !cfg.accountSid || !cfg.authToken || !cfg.sender
      : b.provider === 'africastalking' ? !cfg.username || !cfg.apiKey
        : !/^https?:\/\//.test(cfg.url) || !cfg.url.includes('{message}') || !cfg.url.includes('{to');
    if (missing) return res.status(400).json({ error: b.provider === 'custom' ? 'Enter the provider’s web link, with {to} and {message} where the number and text go.' : 'Fill in all the provider details.' });
    await setSecret(conn.query, 'sms', cfg);
  }
  // Which messages go by SMS (not secret).
  const { rows } = await conn.query("select value from kv where key = 'settings'");
  const settings = rows[0]?.value || {};
  const cfg = await smsConfig(conn.query);
  settings.sms = {
    enabled: !!cfg?.provider && b.enabled !== false,
    onlyWithoutApp: b.onlyWithoutApp !== false,
    for: Object.fromEntries(SMS_KINDS.map((k) => [k, !!(b.for?.[k] ?? settings.sms?.for?.[k] ?? k !== 'announcement')])),
  };
  await conn.query(`insert into kv (key, value) values ('settings', $1::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(settings)]);
  broadcast({ type: 'change', by: null, collections: ['settings'] });
  res.json({ ok: true, sms: settings.sms });
}));
app.post('/api/sms/test', requireUser, wrap(async (req, res) => {
  if (req.user.role !== 'superadmin') throw new Forbidden('Only the super admin manages SMS.');
  const conn = await db();
  const cfg = await smsConfig(conn.query);
  if (!cfg?.provider) return res.status(400).json({ error: 'Save the SMS provider first.' });
  const r = await sendSms(cfg, [req.body?.phone], 'Test message from your school app. SMS is working.');
  if (!r.sent) return res.status(400).json({ error: `The SMS was not sent: ${r.errors[0] || 'check the number'}` });
  res.json(r);
}));

app.post('/api/push/test', requireUser, wrap(async (req, res) => {
  const conn = await db();
  res.json(await sendTest(conn.query, req.user, `${req.protocol}://${req.get('host')}`));
}));
app.get('/api/push/stats', requireUser, wrap(async (req, res) => {
  if (!['superadmin', 'admin', 'bursar'].includes(req.user.role)) throw new Forbidden('Not allowed.');
  const conn = await db();
  res.json(await pushStats(conn.query));
}));
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
