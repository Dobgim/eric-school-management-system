// First-run setup: a clean school with only what the app needs to work.
// No pupils, staff, payments or demo data — enter real (or test) records through the app.
import { randomBytes } from 'node:crypto';
import { hashPassword } from './auth.js';
import { db } from './db.js';

const id = (p) => p + randomBytes(5).toString('hex');

export const DEFAULT_ADMIN = { username: 'admin', password: process.env.ADMIN_PASSWORD || 'admin123' };

function currentSession() {
  const now = new Date();
  const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1; // school year starts in September
  const y = (d) => `${start}${d}`;
  const n = (d) => `${start + 1}${d}`;
  const sid = `s${String(start).slice(2)}${String(start + 1).slice(2)}`;
  return {
    id: sid, name: `${start}/${start + 1}`, start: y('-09-07'), end: n('-07-02'),
    terms: [
      { id: `${sid}-t1`, name: 'First Term', start: y('-09-07'), end: y('-12-11') },
      { id: `${sid}-t2`, name: 'Second Term', start: n('-01-04'), end: n('-03-26') },
      { id: `${sid}-t3`, name: 'Third Term', start: n('-04-12'), end: n('-07-02') },
    ],
  };
}

export async function ensureSetup() {
  const conn = await db();
  const { rows } = await conn.query('select count(*)::int as n from users');
  if (rows[0].n > 0) return false;

  const session = currentSession();
  const today = new Date();
  const currentTerm = session.terms.find((t) => today.toISOString().slice(0, 10) <= t.end) || session.terms[0];
  const school = {
    name: 'Your School Name', shortName: 'Your School', motto: 'Your school motto', logo: '',
    address: '', region: 'Cameroon', phone: '', altPhone: '', email: '', website: '', whatsapp: '',
    founded: '', authorization: '', currency: 'XAF', regPrefix: 'SCH',
  };
  const settings = {
    cnpsRate: 4.2, lowStockDefault: 10,
    currentSessionId: session.id, currentTermId: currentTerm.id,
    momo: { gateway: 'demo', mtnNumber: '', mtnName: '', orangeNumber: '', orangeName: '', bankName: '', bankAccount: '', bankAccountName: '' },
  };
  const classes = [
    ['Pre-Nursery', 'nursery', 25], ['Nursery 1', 'nursery', 25], ['Nursery 2', 'nursery', 25],
    ['Class 1', 'primary', 40], ['Class 2', 'primary', 40], ['Class 3', 'primary', 40],
    ['Class 4', 'primary', 40], ['Class 5', 'primary', 40], ['Class 6', 'primary', 40],
  ].map(([name, level, capacity], order) => ({ id: `c${order}`, name, level, order, capacity, section: 'A', teacherId: null, facilityId: '' }));
  const categories = [
    { id: 'regular', name: 'Regular', tuitionDiscount: 0 },
    { id: 'staffchild', name: 'Staff Child', tuitionDiscount: 50 },
    { id: 'scholarship', name: 'Scholarship', tuitionDiscount: 100 },
  ];

  await conn.tx(async (q) => {
    await q('insert into kv (key, value) values ($1, $2::jsonb), ($3, $4::jsonb)', ['school', JSON.stringify(school), 'settings', JSON.stringify(settings)]);
    const put = (c, v) => q('insert into records (collection, id, data, updated_by) values ($1, $2, $3::jsonb, $4)', [c, v.id, JSON.stringify(v), 'setup']);
    await put('sessions', session);
    for (const c of classes) await put('classes', c);
    for (const c of categories) await put('categories', c);
    for (const n of ['reg', 'receipt', 'staff', 'sale', 'request']) await q('insert into counters (name, value) values ($1, 0) on conflict do nothing', [n]);
    await q('insert into users (id, username, password_hash, role, name) values ($1, $2, $3, $4, $5)',
      [id('u'), DEFAULT_ADMIN.username, await hashPassword(DEFAULT_ADMIN.password), 'superadmin', 'School Administrator']);
  });
  console.log(`\n  First run: created a clean school. Sign in with  ${DEFAULT_ADMIN.username} / ${DEFAULT_ADMIN.password}  and change the password.\n`);
  return true;
}
