// Phone notifications (Web Push). Every new in-app notification is also pushed to the phones and computers
// of the people it is for, so it appears like a WhatsApp message even when the app is closed.
// Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY on the server, or generated once and stored encrypted.
import webpush from 'web-push';
import { encrypt, getSecret } from './secrets.js';

let vapid = null;

export async function vapidKeys(q) {
  if (vapid) return vapid;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return vapid;
  }
  let saved = await getSecret(q, 'vapid');
  if (!saved?.publicKey) {
    // Several serverless instances may start at once: only the first key pair written is kept, and all use it.
    await q(`insert into secrets (key, value) values ('vapid', $1) on conflict (key) do nothing`, [encrypt(webpush.generateVAPIDKeys())]);
    saved = await getSecret(q, 'vapid');
  }
  vapid = saved;
  return vapid;
}

// Apple's push service rejects messages whose sender ("subject") is not a real https address or mailto.
function subject(origin) {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (/^https:\/\//.test(origin || '')) return origin;
  return 'mailto:notifications@school-app.cm';
}

export async function saveSubscription(q, userId, sub) {
  const endpoint = String(sub?.endpoint || '');
  if (!/^https:\/\//.test(endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return false;
  await q(`insert into push_subscriptions (endpoint, user_id, keys) values ($1, $2, $3::jsonb)
           on conflict (endpoint) do update set user_id = excluded.user_id, keys = excluded.keys`,
    [endpoint, userId, JSON.stringify({ p256dh: sub.keys.p256dh, auth: sub.keys.auth })]);
  return true;
}

export const removeSubscription = (q, endpoint) => q('delete from push_subscriptions where endpoint = $1', [String(endpoint || '')]);

/** Send one message to a list of subscriptions. Dead ones (uninstalled app, revoked permission) are removed. */
async function deliver(q, subs, payload, origin) {
  const keys = await vapidKeys(q);
  const options = { TTL: 24 * 3600, urgency: 'high', timeout: 8000, vapidDetails: { subject: subject(origin), publicKey: keys.publicKey, privateKey: keys.privateKey } };
  const results = await Promise.allSettled(subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, options)));
  const errors = [];
  let sent = 0;
  for (const [i, r] of results.entries()) {
    if (r.status === 'fulfilled') { sent++; continue; }
    const e = r.reason;
    // 404/410: the phone dropped the subscription. 403: it was made with other keys. Either way it can't be used.
    if ([403, 404, 410].includes(e.statusCode)) await removeSubscription(q, subs[i].endpoint);
    errors.push(`${e.statusCode || ''} ${String(e.body || e.message).slice(0, 120)}`.trim());
  }
  if (errors.length) console.error('push:', errors.join(' | '));
  return { sent, failed: errors.length, errors };
}

/**
 * Push every notification that has not been pushed yet (created in the last 15 minutes).
 * Each one is claimed atomically, so two server instances never send the same message twice.
 * Returns { notifications, sent }: how many messages went out and how many phones received them.
 */
export async function flushPush(q, origin) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { rows } = await q(
    `update records set data = data || '{"pushed": true}'::jsonb
      where collection = 'notifications' and data->>'pushed' is null and data->>'createdAt' > $1
      returning data`, [since]);
  if (!rows.length) return null;
  const { rows: subs } = await q('select endpoint, user_id, keys from push_subscriptions');
  if (!subs.length) return { notifications: rows.length, sent: 0 };

  const { rows: users } = await q(`select id, role from users where status = 'active' and active`);
  const { rows: all } = await q(`select data from records where collection = 'notifications'`);
  const isFor = (n, u) => (n.userIds || []).includes(u.id) || (n.roles || []).includes(u.role);
  const unread = (u) => all.filter(({ data: n }) => n.by !== u.id && isFor(n, u) && !(n.readBy || []).includes(u.id)).length;
  let sent = 0;
  const jobs = [];
  for (const { data: n } of rows) {
    for (const u of users.filter((x) => isFor(n, x) && x.id !== n.by)) {
      const mine = subs.filter((x) => x.user_id === u.id);
      if (!mine.length) continue;
      const payload = JSON.stringify({ title: n.title, body: n.body || '', url: n.link || '/', tag: n.id, badge: unread(u) });
      jobs.push(deliver(q, mine, payload, origin).then((r) => { sent += r.sent; }));
    }
  }
  await Promise.allSettled(jobs);
  return { notifications: rows.length, sent };
}

/** "Send a test notification" from My Account: reaches every phone where this user turned notifications on. */
export async function sendTest(q, user, origin) {
  const { rows: subs } = await q('select endpoint, user_id, keys from push_subscriptions where user_id = $1', [user.id]);
  if (!subs.length) return { devices: 0, sent: 0, errors: [] };
  const payload = JSON.stringify({ title: 'Notifications are working', body: `Hello ${user.name}, school messages will now arrive on this device.`, url: '/account', tag: `test-${Date.now()}` });
  return { devices: subs.length, ...(await deliver(q, subs, payload, origin)) };
}

/** How many parents and staff can receive phone notifications (shown to the office). */
export async function pushStats(q) {
  const { rows } = await q(`select u.role, count(distinct u.id)::int as n from push_subscriptions s join users u on u.id = s.user_id group by u.role`);
  const by = Object.fromEntries(rows.map((r) => [r.role, r.n]));
  const { rows: parents } = await q(`select count(*)::int as n from users where role = 'parent' and status = 'active' and active`);
  return { parents: by.parent || 0, parentAccounts: parents[0].n, staff: Object.entries(by).filter(([r]) => r !== 'parent').reduce((s, [, n]) => s + n, 0) };
}
