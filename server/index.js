// School Information System API + web server.
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import { allocateToTerms } from '../src/lib/finance.js';
import { clearFailures, clearSessionCookie, hashPassword, loginBlocked, recordFailure, requireUser, setSessionCookie, toClientUser, verifyPassword } from './auth.js';
import { COUNTER_ACCESS, Forbidden, applyOps, loadAll, newId, nextCounter, viewFor } from './data.js';
import { db } from './db.js';
import { collect, detectOperator, momoMode, normalizePhone } from './momo.js';
import { ensureSetup } from './setup.js';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, '..', 'dist');
const PORT = Number(process.env.PORT) || 4000;

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' })); // uploaded documents and photos travel as data URLs
app.use(cookieParser());

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
  res.json({ ok: true, database: conn.kind, momo: momoMode() });
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
  const { rows } = await conn.query('select * from users where lower(username) = lower($1)', [String(username).trim()]);
  const row = rows[0];
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    recordFailure(key);
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
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
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  const s = { res, userId: req.user.id };
  streams.add(s);
  req.on('close', () => streams.delete(s));
});

// ---- Parent pays by MoMo phone prompt. Money is recorded only after the operator confirms.
app.post('/api/payments/online', requireUser, wrap(async (req, res) => {
  const user = req.user;
  if (user.role !== 'parent') throw new Forbidden('Only parents pay from the portal.');
  const { items = [], operator, phone } = req.body || {};
  const conn = await db();
  const all = await loadAll(conn.query);
  const kids = new Set(all.students.filter((s) => (s.guardianIds || []).includes(user.guardianId) && s.status === 'active').map((s) => s.id));
  const clean = items.map((i) => ({ studentId: i.studentId, amount: Math.round(Number(i.amount) || 0) })).filter((i) => i.amount > 0);
  if (!clean.length || clean.some((i) => !kids.has(i.studentId))) return res.status(400).json({ error: 'Choose an amount for your child(ren).' });
  if (!['mtn', 'orange'].includes(operator) || detectOperator(phone) !== operator) return res.status(400).json({ error: `Enter a valid ${operator === 'orange' ? 'Orange Money' : 'MTN MoMo'} number.` });
  const total = clean.reduce((s, i) => s + i.amount, 0);

  const result = await collect({ operator, phone, amount: total, reference: `SIS-${Date.now()}` });
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  if (!result.ok) {
    await logEntry(conn.query, user.id, 'Online payment failed', `${total} XAF via ${operator}: ${result.reason}`);
    return res.status(402).json({ error: result.reason });
  }

  const created = await conn.tx(async (q) => {
    const fresh = await loadAll(q);
    const payments = [];
    const put = (c, v) => q(`insert into records (collection, id, data, updated_by) values ($1, $2, $3::jsonb, $4)`, [c, v.id, JSON.stringify(v), user.id]);
    for (const item of clean) {
      const student = fresh.students.find((s) => s.id === item.studentId);
      for (const part of allocateToTerms(fresh, student, item.amount)) {
        const p = {
          id: newId('pay'), receiptNo: `RCT-${today.slice(0, 4)}-${String(await nextCounter(q, 'receipt')).padStart(5, '0')}`,
          studentId: item.studentId, sessionId: part.sessionId, termId: part.termId, date: today, amount: part.amount,
          method: operator, reference: result.transactionId, receivedBy: user.id, channel: 'online',
          note: `Paid online by ${user.name} (${normalizePhone(phone)})`,
        };
        payments.push(p);
        fresh.payments.push(p);
        await put('payments', p);
      }
    }
    await put('paymentRequests', {
      id: newId('rq'), ref: `PAY-${String(await nextCounter(q, 'request')).padStart(5, '0')}`, channel: 'online', status: 'approved', method: operator,
      guardianId: user.guardianId, userId: user.id, payerPhone: normalizePhone(phone), reference: result.transactionId, paidOn: today,
      items: clean, amount: total, createdAt: now, reviewedAt: now, paymentIds: payments.map((p) => p.id),
    });
    const names = clean.map((i) => { const s = fresh.students.find((x) => x.id === i.studentId); return `${s.firstName} ${s.lastName} (${i.amount.toLocaleString('en-US')} XAF)`; }).join(', ');
    await put('notifications', {
      id: newId('nt'), roles: ['bursar', 'superadmin'], userIds: [], kind: 'payment', link: '/fees', readBy: [], createdAt: now,
      title: `${total.toLocaleString('en-US')} XAF paid online by ${user.name}`,
      body: `${names} · ${operator === 'mtn' ? 'MTN Mobile Money' : 'Orange Money'} · ${result.transactionId} · receipts ${payments.map((p) => p.receiptNo).join(', ')}`,
    });
    await put('activityLog', { id: newId('lg'), userId: user.id, action: 'Paid fees online', details: `${total} XAF via ${operator} (${result.transactionId})`, at: now });
    return payments;
  });
  broadcast({ type: 'change', by: null, collections: ['payments', 'paymentRequests', 'notifications'] });
  res.json({ ok: true, transactionId: result.transactionId, payments: created, total, demo: momoMode() === 'demo' });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ---- Web app (production build)
if (existsSync(DIST)) {
  app.use('/assets', express.static(join(DIST, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(DIST, { index: false, setHeaders: (res, path) => { if (path.endsWith('sw.js')) res.set('Cache-Control', 'no-cache'); } }));
  app.get('*', (req, res) => res.sendFile(join(DIST, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server. Please try again.' : err.message });
});

const conn = await db();
await ensureSetup();
app.listen(PORT, () => {
  console.log(`  API ready on http://localhost:${PORT}  ·  database: ${conn.kind}  ·  MoMo: ${momoMode()} mode`);
  if (existsSync(DIST)) console.log(`  Web app served from dist/ on the same port`);
});
