// Data access and access control. The browser receives only what the signed-in role may see,
// and every change it sends is checked here before it reaches the database.
import { randomBytes } from 'node:crypto';
import { hashPassword, toClientUser } from './auth.js';

export const COLLECTIONS = [
  'students', 'guardians', 'classes', 'facilities', 'sessions', 'calendarEvents', 'categories', 'feeItems',
  'payments', 'staff', 'salaryScales', 'salaryAdjustments', 'payrollRuns', 'inventory', 'stockMovements', 'sales',
  'academicRecords', 'promotionRecommendations', 'announcements', 'activityLog', 'paymentRequests', 'notifications',
];

export const newId = (p = '') => p + Date.now().toString(36) + randomBytes(3).toString('hex');

export class Forbidden extends Error { status = 403; }
export class Invalid extends Error { status = 400; }

/** Everything in the database, shaped like the app's data model. `q` is a query function (inside a transaction or not). */
export async function loadAll(q) {
  const [records, kv, counters, users] = await Promise.all([
    q('select collection, data from records'),
    q('select key, value from kv'),
    q('select name, value from counters'),
    q('select * from users order by created_at'),
  ]);
  const out = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
  for (const r of records.rows) if (out[r.collection]) out[r.collection].push(r.data);
  for (const r of kv.rows) out[r.key] = r.value;
  out.settings = { ...(out.settings || {}), counters: Object.fromEntries(counters.rows.map((r) => [r.name, r.value])) };
  out.users = users.rows.map(toClientUser);
  out.activityLog.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  out.notifications.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return out;
}

const teacherClassId = (all, user) => all.classes.find((c) => c.teacherId && c.teacherId === user.staffId)?.id || null;
const parentChildIds = (all, user) => all.students.filter((s) => (s.guardianIds || []).includes(user.guardianId)).map((s) => s.id);
const forUser = (n, user) => (n.userIds || []).includes(user.id) || (n.roles || []).includes(user.role);
const minimalUsers = (all) => all.users.map((u) => ({ id: u.id, name: u.name, role: u.role }));
const staffCard = (s) => ({ id: s.id, firstName: s.firstName, lastName: s.lastName, gender: s.gender, phone: s.phone, position: s.position, classId: s.classId, category: s.category, status: s.status, staffNo: s.staffNo });

/** The slice of the database a user is allowed to read. */
export function viewFor(user, all) {
  const base = {
    school: all.school, sessions: all.sessions, classes: all.classes, categories: all.categories,
    calendarEvents: all.calendarEvents, feeItems: all.feeItems,
    notifications: all.notifications.filter((n) => forUser(n, user)).slice(0, 200),
  };
  const empty = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));

  if (user.role === 'parent') {
    const kids = new Set(parentChildIds(all, user));
    const kidClassIds = new Set(all.students.filter((s) => kids.has(s.id)).map((s) => s.classId));
    const teacherIds = new Set(all.classes.filter((c) => kidClassIds.has(c.id)).map((c) => c.teacherId));
    return {
      ...empty, ...base,
      settings: { currentSessionId: all.settings.currentSessionId, currentTermId: all.settings.currentTermId, momo: all.settings.momo, counters: {} },
      students: all.students.filter((s) => kids.has(s.id)).map(({ documents, ...s }) => ({ ...s, documents: [] })),
      guardians: all.guardians.filter((g) => g.id === user.guardianId),
      payments: all.payments.filter((p) => kids.has(p.studentId)),
      sales: all.sales.filter((s) => kids.has(s.studentId)),
      academicRecords: all.academicRecords.filter((r) => kids.has(r.studentId)),
      paymentRequests: all.paymentRequests.filter((r) => r.guardianId === user.guardianId),
      announcements: all.announcements.filter((a) => a.audience === 'all' || a.audience === 'parents'),
      staff: all.staff.filter((s) => teacherIds.has(s.id)).map(staffCard),
      users: minimalUsers(all),
    };
  }

  if (user.role === 'teacher') {
    const classId = teacherClassId(all, user);
    const pupils = all.students.filter((s) => s.classId === classId || Object.values(s.enrollments || {}).includes(classId));
    const ids = new Set(pupils.map((s) => s.id));
    const guardianIds = new Set(pupils.flatMap((s) => s.guardianIds || []));
    return {
      ...empty, ...base,
      settings: { ...all.settings, momo: undefined },
      facilities: all.facilities,
      students: pupils,
      guardians: all.guardians.filter((g) => guardianIds.has(g.id)),
      academicRecords: all.academicRecords.filter((r) => ids.has(r.studentId) || r.classId === classId),
      promotionRecommendations: all.promotionRecommendations.filter((r) => ids.has(r.studentId)),
      announcements: all.announcements.filter((a) => a.audience === 'all' || a.audience === 'staff'),
      staff: all.staff.map(staffCard),
      users: minimalUsers(all),
    };
  }

  // Office staff. The secretary does not see payroll; only the super admin sees account details.
  const view = { ...all, ...base, notifications: base.notifications };
  if (user.role === 'admin') { view.payrollRuns = []; view.salaryAdjustments = []; }
  if (user.role !== 'superadmin') view.users = user.role === 'admin' ? all.users.filter((u) => u.role === 'parent').concat(minimalUsers(all).filter((u) => u.role !== 'parent')) : minimalUsers(all);
  return view;
}

// Collections each office role may change. Teachers and parents are handled row by row below.
const WRITE = {
  admin: ['students', 'guardians', 'classes', 'facilities', 'sessions', 'calendarEvents', 'academicRecords', 'promotionRecommendations', 'announcements', 'staff', 'notifications', 'activityLog'],
  bursar: ['payments', 'feeItems', 'categories', 'payrollRuns', 'salaryAdjustments', 'salaryScales', 'staff', 'inventory', 'stockMovements', 'sales', 'paymentRequests', 'notifications', 'activityLog'],
};
const KV_WRITE = { superadmin: ['school', 'settings'], admin: ['school', 'settings'] };
export const COUNTER_ACCESS = {
  superadmin: ['reg', 'receipt', 'staff', 'sale', 'request'],
  admin: ['reg', 'staff'],
  bursar: ['receipt', 'staff', 'sale', 'request'],
  parent: ['request'],
  teacher: [],
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Only adding yourself to a notification's readBy list. */
function isMarkRead(user, before, after) {
  if (!before || !forUser(before, user)) return false;
  const { readBy: rb, ...restB } = before;
  const { readBy: ra, ...restA } = after;
  return same(restB, restA) && (ra || []).every((x) => (rb || []).includes(x) || x === user.id);
}

/**
 * Validate and apply a batch of changes inside one transaction.
 * ops: [{ t: 'put', c, v } | { t: 'del', c, id } | { t: 'kv', k, v }]
 * Returns { changed: Set<collection>, extra: notifications created by the server }.
 */
export async function applyOps(q, user, ops) {
  if (!Array.isArray(ops) || !ops.length) return { changed: new Set() };
  const all = await loadAll(q);
  const byId = (c, id) => (c === 'users' ? all.users : all[c] || []).find((x) => x.id === id);
  const changed = new Set();
  const now = new Date().toISOString();
  const kids = user.role === 'parent' ? new Set(parentChildIds(all, user)) : null;
  const tClass = user.role === 'teacher' ? teacherClassId(all, user) : null;

  const putRecord = async (c, v) => {
    await q(`insert into records (collection, id, data, updated_by) values ($1, $2, $3::jsonb, $4)
             on conflict (collection, id) do update set data = excluded.data, updated_at = now(), updated_by = excluded.updated_by`, [c, v.id, JSON.stringify(v), user.id]);
    changed.add(c);
  };

  for (const op of ops) {
    const { t, c } = op;

    if (t === 'kv') {
      if (!(KV_WRITE[user.role] || []).includes(op.k)) throw new Forbidden(`You can't change the ${op.k} settings.`);
      const { counters, ...value } = op.v || {};
      await q(`insert into kv (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()`, [op.k, JSON.stringify(value)]);
      changed.add(op.k);
      continue;
    }

    if (c === 'users') { await writeUser(q, user, all, op); changed.add('users'); continue; }
    if (!COLLECTIONS.includes(c)) throw new Invalid(`Unknown data type: ${c}`);
    const id = t === 'del' ? op.id : op.v?.id;
    if (!id || typeof id !== 'string') throw new Invalid('Record without an id.');
    const before = byId(c, id);
    const after = op.v;

    // Activity log: anyone may add entries, stamped with their real identity; nobody edits history.
    if (c === 'activityLog') {
      if (t !== 'put' || before) throw new Forbidden('The activity log cannot be edited.');
      await putRecord(c, { ...after, userId: user.id, at: now });
      continue;
    }

    // Everyone may mark their own notifications as read.
    if (c === 'notifications' && t === 'put' && isMarkRead(user, before, after)) { await putRecord(c, after); continue; }

    if (user.role === 'superadmin') {
      // full access
    } else if (user.role === 'admin' || user.role === 'bursar') {
      if (!WRITE[user.role].includes(c)) throw new Forbidden(`Your role can't change ${c}.`);
    } else if (user.role === 'teacher') {
      const inClass = (studentId) => all.students.some((s) => s.id === studentId && (s.classId === tClass || Object.values(s.enrollments || {}).includes(tClass)));
      const rec = after || before;
      if (c === 'academicRecords' && tClass && rec.classId === tClass && inClass(rec.studentId)) { /* ok */ }
      else if (c === 'promotionRecommendations' && tClass && inClass(rec.studentId)) { /* ok */ }
      else throw new Forbidden('Teachers can only record results and recommendations for their own class.');
    } else if (user.role === 'parent') {
      if (c === 'paymentRequests' && t === 'put' && !before) {
        const items = after.items || [];
        if (after.status !== 'pending' || after.channel !== 'manual') throw new Forbidden('Payments made by parents must be verified by the bursar.');
        if (!items.length || items.some((i) => !kids.has(i.studentId) || !(Number(i.amount) > 0))) throw new Forbidden('You can only pay for your own children.');
        const ref = String(after.reference || '').trim().toLowerCase();
        if (ref.length < 4) throw new Invalid('Enter the transaction ID.');
        if (all.payments.some((p) => (p.reference || '').toLowerCase() === ref) || all.paymentRequests.some((r) => r.status !== 'rejected' && (r.reference || '').toLowerCase() === ref)) throw new Invalid('This transaction ID has already been used.');
        const amount = items.reduce((s, i) => s + Math.round(Number(i.amount)), 0);
        const clean = { ...after, guardianId: user.guardianId, userId: user.id, amount, createdAt: now };
        await putRecord(c, clean);
        // Tell the bursar straight away.
        const names = items.map((i) => { const s = all.students.find((x) => x.id === i.studentId); return `${s.firstName} ${s.lastName} (${Math.round(i.amount).toLocaleString('en-US')} XAF)`; }).join(', ');
        await putRecord('notifications', {
          id: newId('nt'), roles: ['bursar', 'superadmin'], userIds: [], kind: 'verify', link: '/fees/online', readBy: [], createdAt: now,
          title: `Payment to verify: ${amount.toLocaleString('en-US')} XAF from ${user.name}`,
          body: `${names} · ${clean.method?.toUpperCase()} · ${clean.reference}`,
        });
        continue;
      }
      throw new Forbidden('Parents can only submit payments for verification.');
    } else {
      throw new Forbidden('Not allowed.');
    }

    if (t === 'put') await putRecord(c, after);
    else if (t === 'del') { await q('delete from records where collection = $1 and id = $2', [c, id]); changed.add(c); }
    else throw new Invalid(`Unknown operation ${t}`);
  }
  return { changed };
}

async function writeUser(q, user, all, op) {
  const v = op.v || {};
  const existing = all.users.find((u) => u.id === (op.id || v.id));
  const canManage = user.role === 'superadmin' || (user.role === 'admin' && v.role === 'parent' && (!existing || existing.role === 'parent'));
  if (op.t !== 'put' || !canManage) throw new Forbidden('Only the super admin can manage these accounts.');
  if (!['superadmin', 'admin', 'bursar', 'teacher', 'parent'].includes(v.role)) throw new Invalid('Invalid role.');
  const username = String(v.username || '').trim();
  if (!username || !String(v.name || '').trim()) throw new Invalid('Name and username are required.');
  if (all.users.some((u) => u.id !== v.id && u.username.toLowerCase() === username.toLowerCase())) throw new Invalid('That username is taken.');
  if (existing && existing.id === user.id && (v.role !== 'superadmin' || v.active === false)) throw new Invalid("You can't demote or deactivate your own account.");
  if (v.password !== undefined && v.password !== '' && String(v.password).length < 6) throw new Invalid('Password must be at least 6 characters.');
  if (existing) {
    await q('update users set username = $2, role = $3, name = $4, staff_id = $5, guardian_id = $6, active = $7 where id = $1',
      [existing.id, username, v.role, v.name.trim(), v.staffId || null, v.guardianId || null, v.active !== false]);
    if (v.password) await q('update users set password_hash = $2 where id = $1', [existing.id, await hashPassword(v.password)]);
  } else {
    if (!v.password) throw new Invalid('A password is required for new accounts.');
    await q('insert into users (id, username, password_hash, role, name, staff_id, guardian_id, active) values ($1, $2, $3, $4, $5, $6, $7, $8)',
      [v.id || newId('u'), username, await hashPassword(v.password), v.role, v.name.trim(), v.staffId || null, v.guardianId || null, v.active !== false]);
  }
}

export async function nextCounter(q, name) {
  const { rows } = await q(`insert into counters (name, value) values ($1, 1) on conflict (name) do update set value = counters.value + 1 returning value`, [name]);
  return rows[0].value;
}
