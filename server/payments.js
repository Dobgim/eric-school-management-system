// Parents pay school fees by Mobile Money phone prompt (Fapshi). The flow:
//   1. POST /api/payments/online       the parent picks the term(s) and amounts; Fapshi sends the prompt to their phone
//   2. GET  /api/payments/online/:id   the app checks until the parent approves (or declines) on the phone
//   3. POST /api/payments/fapshi/webhook   Fapshi tells the server directly, in case the app was closed
// Money is recorded, with receipts, only once Fapshi confirms the payment as successful.
import { allocateToScope, dueForScope, scopeLabel, scopeTerms } from '../src/lib/finance.js';
import { requireUser } from './auth.js';
import { Forbidden, Invalid, loadAll, newId, nextCounter } from './data.js';
import { db } from './db.js';
import { checkAccount, collectionStatus, detectOperator, gateway, normalizePhone, startCollection } from './momo.js';
import { setSecret } from './secrets.js';

const OPERATOR = { mtn: 'MTN Mobile Money', orange: 'Orange Money' };
const put = (q, c, v, by) => q(`insert into records (collection, id, data, updated_by) values ($1, $2, $3::jsonb, $4)
  on conflict (collection, id) do update set data = excluded.data, updated_at = now(), updated_by = excluded.updated_by`, [c, v.id, JSON.stringify(v), by]);
const fmt = (n) => `${Math.round(n).toLocaleString('en-US')} XAF`;

export function paymentRoutes(app, wrap, broadcast) {
  // ---- Start: validate, then ask Fapshi to send the approval prompt.
  app.post('/api/payments/online', requireUser, wrap(async (req, res) => {
    const user = req.user;
    if (user.role !== 'parent') throw new Forbidden('Only parents pay from the portal.');
    const { items = [], phone, scope } = req.body || {};
    const conn = await db();
    const all = await loadAll(conn.query);
    if (!scope || !scopeTerms(all, scope).length) throw new Invalid('Choose the term you are paying for.');
    const kids = all.students.filter((s) => (s.guardianIds || []).includes(user.guardianId) && s.status === 'active');
    const clean = items.map((i) => ({ studentId: i.studentId, amount: Math.round(Number(i.amount) || 0) })).filter((i) => i.amount > 0);
    if (!clean.length || clean.some((i) => !kids.some((k) => k.id === i.studentId))) throw new Invalid('Enter an amount for your child(ren).');
    for (const i of clean) {
      const kid = kids.find((k) => k.id === i.studentId);
      const due = dueForScope(all, kid, scope);
      if (i.amount > due) throw new Invalid(due ? `${kid.firstName} owes ${fmt(due)} for ${scopeLabel(all, scope)}. Enter that amount or less.` : `${kid.firstName} has nothing left to pay for ${scopeLabel(all, scope)}.`);
    }
    const n = normalizePhone(phone);
    if (!detectOperator(n)) throw new Invalid('Enter a valid MTN or Orange Mobile Money number (9 digits).');
    const total = clean.reduce((s, i) => s + i.amount, 0);
    if (total < 100) throw new Invalid('The minimum Mobile Money payment is 100 XAF.');

    const gw = await gateway(conn.query);
    const id = newId('rq');
    const names = clean.map((i) => kids.find((k) => k.id === i.studentId).firstName).join(', ');
    const { transId } = await startCollection(gw, {
      phone: n, amount: total, name: user.name, userId: user.id, externalId: id,
      message: `${all.school?.name || 'School'} fees: ${names} · ${scopeLabel(all, scope)}`,
    });
    const now = new Date().toISOString();
    const request = {
      id, ref: `PAY-${String(await nextCounter(conn.query, 'request')).padStart(5, '0')}`, channel: 'online', status: 'processing',
      method: detectOperator(n), provider: gw.mode === 'demo' ? 'demo' : 'fapshi', transId, scope, scopeLabel: scopeLabel(all, scope),
      guardianId: user.guardianId, userId: user.id, payerPhone: n, items: clean, amount: total, createdAt: now, paidOn: now.slice(0, 10),
    };
    await put(conn.query, 'paymentRequests', request, user.id);
    broadcast({ type: 'change', by: null, collections: ['paymentRequests'] });
    res.json({ ok: true, id, status: 'processing', total, demo: gw.mode === 'demo', school: all.school?.name || '' });
  }));

  // ---- Check: the app asks every few seconds until the parent has approved or declined.
  app.get('/api/payments/online/:id', requireUser, wrap(async (req, res) => {
    const conn = await db();
    const { rows } = await conn.query(`select data from records where collection = 'paymentRequests' and id = $1`, [req.params.id]);
    const request = rows[0]?.data;
    if (!request || (request.userId !== req.user.id && !['superadmin', 'bursar'].includes(req.user.role))) return res.status(404).json({ error: 'Payment not found.' });
    res.json(await settle(conn, request, broadcast));
  }));

  // ---- Fapshi calls this when a payment changes. The status is always re-checked with Fapshi, never trusted.
  app.post('/api/payments/fapshi/webhook', wrap(async (req, res) => {
    const transId = String(req.body?.transId || '');
    if (!transId) return res.status(400).json({ error: 'transId missing' });
    const conn = await db();
    const { rows } = await conn.query(`select data from records where collection = 'paymentRequests' and data->>'transId' = $1`, [transId]);
    if (rows[0]) await settle(conn, rows[0].data, broadcast);
    res.json({ ok: true });
  }));

  // ---- The school's Fapshi account (super admin). The keys are stored encrypted and never sent back.
  app.get('/api/payments/config', requireUser, wrap(async (req, res) => {
    if (req.user.role !== 'superadmin') throw new Forbidden('Only the super admin manages the payment account.');
    const conn = await db();
    const gw = await gateway(conn.query);
    let account = null;
    if (gw.mode !== 'demo') { try { account = await checkAccount(gw); } catch (e) { account = { error: e.message }; } }
    res.json({ mode: gw.mode, source: gw.source, apiUser: gw.apiUser ? `${gw.apiUser.slice(0, 4)}…${gw.apiUser.slice(-4)}` : '', account, webhook: `${req.protocol}://${req.get('host')}/api/payments/fapshi/webhook` });
  }));

  app.post('/api/payments/config', requireUser, wrap(async (req, res) => {
    if (req.user.role !== 'superadmin') throw new Forbidden('Only the super admin manages the payment account.');
    const conn = await db();
    if (req.body?.remove) {
      await setSecret(conn.query, 'fapshi', null);
      return res.json({ ok: true, mode: 'demo' });
    }
    const apiUser = String(req.body?.apiUser || '').trim();
    const apiKey = String(req.body?.apiKey || '').trim();
    const mode = req.body?.mode === 'sandbox' ? 'sandbox' : 'live';
    if (!apiUser || !apiKey) throw new Invalid('Enter both the API user and the API key from your Fapshi dashboard.');
    let account;
    try { account = await checkAccount({ mode, apiUser, apiKey }); } catch (e) { throw new Invalid(`Fapshi did not accept these keys: ${e.message}`); }
    await setSecret(conn.query, 'fapshi', { apiUser, apiKey, mode });
    res.json({ ok: true, mode, account });
  }));
}

/** Ask Fapshi where a payment stands; record it (once) when successful. */
async function settle(conn, request, broadcast) {
  if (request.status === 'approved') return { status: 'successful', paymentIds: request.paymentIds, reference: request.reference };
  if (request.status === 'failed') return { status: 'failed', reason: request.reason };
  const gw = await gateway(conn.query);
  const result = await collectionStatus(request.provider === 'demo' ? { mode: 'demo' } : gw, request.transId, request.createdAt);
  if (result.status === 'pending') {
    // Give up after 10 minutes without an answer.
    if (Date.now() - new Date(request.createdAt).getTime() < 10 * 60 * 1000) return { status: 'pending' };
    Object.assign(result, { status: 'failed', reason: 'No approval was received on the phone. Try again.' });
  }

  const outcome = await conn.tx(async (q) => {
    // Claim the request so a webhook and the app checking at the same moment can't both record it.
    const next = result.status === 'successful' ? 'approved' : 'failed';
    const { rows } = await q(`update records set data = data || $2::jsonb, updated_at = now()
      where collection = 'paymentRequests' and id = $1 and data->>'status' = 'processing' returning data`,
    [request.id, JSON.stringify({ status: next })]);
    if (!rows.length) return null; // already handled
    const now = new Date().toISOString();
    const r = rows[0].data;
    if (next === 'failed') {
      await put(q, 'paymentRequests', { ...r, reason: result.reason, reviewNote: result.reason, reviewedAt: now }, 'system');
      await put(q, 'notifications', {
        id: newId('nt'), userIds: [r.userId], roles: [], kind: 'rejected', link: '/portal/pay', readBy: [], createdAt: now,
        title: `Payment of ${fmt(r.amount)} was not completed`, body: result.reason,
      }, 'system');
      return { status: 'failed', reason: result.reason };
    }
    const all = await loadAll(q);
    const today = now.slice(0, 10);
    const payments = [];
    for (const item of r.items) {
      const student = all.students.find((s) => s.id === item.studentId);
      for (const part of allocateToScope(all, student, item.amount, r.scope)) {
        const p = {
          id: newId('pay'), receiptNo: `RCT-${today.slice(0, 4)}-${String(await nextCounter(q, 'receipt')).padStart(5, '0')}`,
          studentId: item.studentId, sessionId: part.sessionId, termId: part.termId, date: today, amount: part.amount,
          method: r.method, reference: result.reference, receivedBy: r.userId, channel: 'online', requestId: r.id,
          note: `Paid by phone prompt (${r.payerPhone}) for ${r.scopeLabel}`,
        };
        payments.push(p);
        all.payments.push(p);
        await put(q, 'payments', p, 'system');
      }
    }
    await put(q, 'paymentRequests', { ...r, reference: result.reference, reviewedAt: now, paymentIds: payments.map((p) => p.id) }, 'system');
    const kids = r.items.map((i) => { const s = all.students.find((x) => x.id === i.studentId); return `${s.firstName} ${s.lastName} (${fmt(i.amount)})`; }).join(', ');
    const payer = all.users.find((u) => u.id === r.userId)?.name || 'A parent';
    await put(q, 'notifications', {
      id: newId('nt'), roles: ['bursar', 'superadmin'], userIds: [], kind: 'payment', link: '/fees', readBy: [], createdAt: now,
      title: `${fmt(r.amount)} paid online by ${payer}`,
      body: `${kids} · ${r.scopeLabel} · ${OPERATOR[r.method] || r.method} · ${result.reference}`,
    }, 'system');
    await put(q, 'notifications', {
      id: newId('nt'), userIds: [r.userId], roles: [], kind: 'confirmed', sms: 'payment', link: '/portal/payments', readBy: [], createdAt: now,
      title: `Payment received: ${fmt(r.amount)}`, body: `${kids} · ${r.scopeLabel}. Your receipts are ready.`,
    }, 'system');
    await put(q, 'activityLog', { id: newId('lg'), userId: r.userId, action: 'Paid fees online', details: `${fmt(r.amount)} for ${r.scopeLabel} via ${r.method} (${result.reference})`, at: now }, 'system');
    return { status: 'successful', paymentIds: payments.map((p) => p.id), reference: result.reference };
  });
  broadcast({ type: 'change', by: null, collections: ['payments', 'paymentRequests', 'notifications'] });
  if (outcome) return outcome;
  // Someone else settled it first: report what they recorded.
  const { rows } = await conn.query(`select data from records where collection = 'paymentRequests' and id = $1`, [request.id]);
  return rows[0].data.status === 'approved' ? { status: 'successful', paymentIds: rows[0].data.paymentIds, reference: rows[0].data.reference } : { status: 'failed', reason: rows[0].data.reason };
}
