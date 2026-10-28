// SMS for parents without a smartphone (or who haven't turned on app notifications).
// Providers: Twilio, Africa's Talking, or any bulk-SMS company with a simple web link ("custom"),
// e.g. https://provider.cm/api/send?user=X&pass=Y&to={to}&sender={sender}&text={message}
// Keys are entered once by the super admin and stored encrypted; which messages go by SMS is in settings.sms.
import { getSecret } from './secrets.js';
import { normalizePhone } from './momo.js';

const BASE = {
  twilio: () => process.env.SMS_TWILIO_BASE || 'https://api.twilio.com',
  africastalking: (sandbox) => process.env.SMS_AT_BASE || (sandbox ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com'),
};

const e164 = (phone) => { const n = normalizePhone(phone); return /^\d{9}$/.test(n) ? `+237${n}` : null; };

/** Send one text to several numbers. Returns { sent, failed, errors }. */
export async function sendSms(cfg, numbers, message) {
  const to = [...new Set(numbers.map(e164).filter(Boolean))];
  if (!to.length) return { sent: 0, failed: 0, errors: [] };
  const text = String(message).slice(0, 320);
  const errors = [];
  let sent = 0;
  const call = async (url, init) => {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    const body = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${body.slice(0, 160)}`);
    return body;
  };
  if (cfg.provider === 'twilio') {
    const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
    for (const n of to) {
      try {
        await call(`${BASE.twilio()}/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`, {
          method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: n, From: cfg.sender, Body: text }),
        });
        sent++;
      } catch (e) { errors.push(`${n}: ${e.message}`); }
    }
  } else if (cfg.provider === 'africastalking') {
    try {
      const body = await call(`${BASE.africastalking(cfg.username === 'sandbox')}/version1/messaging`, {
        method: 'POST', headers: { apiKey: cfg.apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: cfg.username, to: to.join(','), message: text, ...(cfg.sender ? { from: cfg.sender } : {}) }),
      });
      const recipients = JSON.parse(body)?.SMSMessageData?.Recipients || [];
      for (const r of recipients) (/success/i.test(r.status) ? sent++ : errors.push(`${r.number}: ${r.status}`));
    } catch (e) { errors.push(e.message); }
  } else if (cfg.provider === 'custom') {
    for (const n of to) {
      try {
        const url = cfg.url
          .replaceAll('{to}', encodeURIComponent(n))
          .replaceAll('{to_local}', encodeURIComponent(n.replace(/^\+237/, '')))
          .replaceAll('{to_plain}', encodeURIComponent(n.replace(/^\+/, '')))
          .replaceAll('{sender}', encodeURIComponent(cfg.sender || ''))
          .replaceAll('{message}', encodeURIComponent(text));
        await call(url, { method: 'GET' });
        sent++;
      } catch (e) { errors.push(`${n}: ${e.message}`); }
    }
  } else {
    errors.push('No SMS provider set.');
  }
  if (errors.length) console.error('sms:', errors.join(' | '));
  return { sent, failed: errors.length, errors };
}

export const smsConfig = (q) => getSecret(q, 'sms');

/**
 * Text every parent-facing notification marked for SMS that hasn't been texted yet (last 15 minutes).
 * Claimed atomically like push. `settings.sms.for` says which kinds go out; `onlyWithoutApp` skips
 * parents who already receive app notifications.
 */
export async function flushSms(q) {
  const { rows: kvRows } = await q("select value from kv where key = 'settings'");
  const opts = kvRows[0]?.value?.sms;
  if (!opts?.enabled) return null;
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { rows } = await q(
    `update records set data = data || '{"smsSent": true}'::jsonb
      where collection = 'notifications' and data->>'sms' is not null and data->>'smsSent' is null and data->>'createdAt' > $1
      returning data`, [since]);
  const due = rows.map((r) => r.data).filter((n) => opts.for?.[n.sms]);
  if (!due.length) return null;
  const cfg = await smsConfig(q);
  if (!cfg?.provider) return null;

  const { rows: parents } = await q(`select id, guardian_id from users where role = 'parent' and status = 'active' and active`);
  const { rows: guardians } = await q(`select id, data->>'phone' as phone from records where collection = 'guardians'`);
  const { rows: pushed } = await q('select distinct user_id from push_subscriptions');
  const hasApp = new Set(pushed.map((r) => r.user_id));
  const { rows: school } = await q("select value from kv where key = 'school'");
  const name = school[0]?.value?.shortName || school[0]?.value?.name || 'School';

  let sent = 0;
  for (const n of due) {
    const users = parents.filter((u) => (n.userIds || []).includes(u.id) || (n.roles || []).includes('parent'));
    const phones = users.filter((u) => !(opts.onlyWithoutApp && hasApp.has(u.id)))
      .map((u) => guardians.find((g) => g.id === u.guardian_id)?.phone).filter(Boolean);
    if (!phones.length) continue;
    const r = await sendSms(cfg, phones, `${name}: ${n.title}. ${n.body || ''}`.trim());
    sent += r.sent;
    const entry = { id: `lg${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, userId: n.by || 'system', action: 'SMS sent', details: `${n.title} · ${r.sent} sent${r.failed ? `, ${r.failed} failed` : ''}`, at: new Date().toISOString() };
    await q(`insert into records (collection, id, data, updated_by) values ('activityLog', $1, $2::jsonb, 'system')`, [entry.id, JSON.stringify(entry)]);
  }
  return { sent };
}
