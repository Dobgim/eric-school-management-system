// Phone notifications (Web Push). Every new in-app notification is also pushed to the phones and computers
// of the people it is for, so it appears like a WhatsApp message even when the app is closed.
// Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY on the server, or generated once and stored encrypted.
import webpush from 'web-push';
import { getSecret, setSecret } from './secrets.js';

let vapid = null;

export async function vapidKeys(q) {
  if (vapid) return vapid;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    vapid = await getSecret(q, 'vapid');
    if (!vapid?.publicKey) {
      vapid = webpush.generateVAPIDKeys();
      await setSecret(q, 'vapid', vapid);
    }
  }
  return vapid;
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

/**
 * Push every notification that has not been pushed yet (created in the last 15 minutes).
 * Each one is claimed atomically, so two server instances never send the same message twice.
 */
export async function flushPush(q) {
  const { rows: subsCount } = await q('select count(*)::int as n from push_subscriptions');
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { rows } = await q(
    `update records set data = data || '{"pushed": true}'::jsonb
      where collection = 'notifications' and data->>'pushed' is null and data->>'createdAt' > $1
      returning data`, [since]);
  if (!rows.length || !subsCount[0].n) return 0;

  const keys = await vapidKeys(q);
  webpush.setVapidDetails('mailto:noreply@school.local', keys.publicKey, keys.privateKey);
  const { rows: users } = await q(`select id, role from users where status = 'active' and active`);
  const { rows: subs } = await q('select endpoint, user_id, keys from push_subscriptions');
  const { rows: all } = await q(`select data from records where collection = 'notifications'`);

  const isFor = (n, u) => (n.userIds || []).includes(u.id) || (n.roles || []).includes(u.role);
  const unread = (u) => all.filter(({ data: n }) => isFor(n, u) && !(n.readBy || []).includes(u.id)).length;
  let sent = 0;
  const jobs = [];
  for (const { data: n } of rows) {
    for (const u of users.filter((x) => isFor(n, x) && x.id !== n.by)) {
      const payload = JSON.stringify({ title: n.title, body: n.body || '', url: n.link || '/', tag: n.id, badge: unread(u) });
      for (const s of subs.filter((x) => x.user_id === u.id)) {
        jobs.push(webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 24 * 3600, timeout: 8000 })
          .then(() => { sent++; })
          .catch((e) => { if (e.statusCode === 404 || e.statusCode === 410) return removeSubscription(q, s.endpoint); }));
      }
    }
  }
  await Promise.allSettled(jobs);
  return sent;
}
